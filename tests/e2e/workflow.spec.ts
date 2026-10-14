import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

test("local intake, PDF upload, approval and ZIP export persist", async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByLabel("Business description").fill(
        "Acme Bakery LLC is opening at 123 Main Street in Austin, TX 78701. Contact owner@acme.test or 555-0100."
    );
    await page.getByLabel("Preferred jurisdiction").fill("Austin, TX");
    await page.getByRole("button", { name: "Analyze and Start Workflow" }).click();
    await page.waitForURL("**/workflows/*");
    const id = page.url().split("/").pop();
    const blocked = await request.post(`/api/workflows/${id}/exports/build`, { data: { type: "combined-all" } });
    expect(blocked.status()).toBe(422);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    const pdf = await PDFDocument.create();
    const pdfPage = pdf.addPage([600, 800]);
    for (const [index, name] of ["business_name", "address", "entity_type"].entries()) {
        pdf.getForm().createTextField(name).addToPage(pdfPage, { x: 40, y: 700 - index * 50, width: 250, height: 25 });
    }
    await page.locator("input[type=file]").setInputFiles({ name: "application-form.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
    await Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/documents/upload") && response.status() === 201),
        page.getByRole("button", { name: "Upload 1 File" }).click(),
    ]);
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/forms/fill/start") && response.ok()),
        page.getByRole("button", { name: "Run Autofill", exact: true }).click(),
    ]);
    await Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/review/approve") && response.ok()),
        page.getByRole("button", { name: "Approve Review", exact: true }).click(),
    ]);
    await Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/exports/build") && response.status() === 201),
        page.getByRole("button", { name: "Build Combined Export", exact: true }).click(),
    ]);
    const response = await request.get(`/api/workflows/${id}/exports`);
    const exported = await response.json();
    expect(exported.data.exports).toHaveLength(1);
    const zip = await request.get(exported.data.exports[0].downloadUrl);
    expect(zip.ok()).toBe(true);
    const zipBytes = await zip.body();
    const entries = unzipSync(zipBytes);
    expect(Object.keys(entries)).toContain("manifest.json");
    const filledPdfName = Object.keys(entries).find(name => name.startsWith("generated/") && name.endsWith(".pdf"));
    expect(filledPdfName).toBeTruthy();
    const filledPdf = await PDFDocument.load(entries[filledPdfName!]);
    expect(filledPdf.getForm().getTextField("business_name").getText()).toContain("Acme Bakery");
    await mkdir(".local", { recursive: true });
    await writeFile(".local/browser-restart-receipt.json", JSON.stringify({
        id, downloadUrl: exported.data.exports[0].downloadUrl,
        sha256: createHash("sha256").update(zipBytes).digest("hex")
    }));
    await page.reload();
    await page.getByRole("button", { name: "Exports", exact: true }).click();
    expect(errors).toEqual([]);
});


test("persisted workflow survives application restart", async ({ page, request }) => {
    const receipt = JSON.parse(await readFile(".local/browser-restart-receipt.json", "utf8"));
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/workflows/${receipt.id}`);
    await page.getByRole("button", { name: "Exports", exact: true }).click();
    const link = page.getByRole("link", { name: "Download zip" });
    await expect(link).toHaveAttribute("href", receipt.downloadUrl);
    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    const bytes = await readFile(savedPath!);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(receipt.sha256);
    const persisted = await request.get(`/api/workflows/${receipt.id}/exports`);
    expect((await persisted.json()).data.exports).toHaveLength(1);
    expect(errors).toEqual([]);
});
