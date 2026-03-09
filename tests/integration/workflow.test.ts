import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { POST as approveReview } from "@/app/api/workflows/[id]/review/approve/route";
import { POST as buildExport } from "@/app/api/workflows/[id]/exports/build/route";
import { POST as uploadDocument } from "@/app/api/workflows/[id]/documents/upload/route";
import { db, ensureDatabaseInitialized, schema } from "@/lib/db";
import {
    createWorkflow,
    getExports,
    getFormFills,
    getGaps,
    getWorkflow,
} from "@/lib/db/repositories";
import {
    handleWorkflowCreated,
    runWorkflowFormsFill,
    runWorkflowResearch,
} from "@/lib/workflows";

async function createFillablePdf() {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const form = pdfDoc.getForm();

    const businessName = form.createTextField("business_name");
    businessName.addToPage(page, { x: 50, y: 700, width: 220, height: 24 });

    const address = form.createTextField("address");
    address.addToPage(page, { x: 50, y: 660, width: 220, height: 24 });

    const entityType = form.createTextField("entity_type");
    entityType.addToPage(page, { x: 50, y: 620, width: 220, height: 24 });

    const bytes = await pdfDoc.save();
    return new File([Buffer.from(bytes)], "fillable-form.pdf", {
        type: "application/pdf",
    });
}

async function createScannedPdf() {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const bytes = await pdfDoc.save();

    return new File([Buffer.from(bytes)], "scanned-form.pdf", {
        type: "application/pdf",
    });
}

async function clearDatabase() {
    await ensureDatabaseInitialized();

    await db.delete(schema.reviewDecisions);
    await db.delete(schema.formFills);
    await db.delete(schema.formFields);
    await db.delete(schema.formTemplates);
    await db.delete(schema.citations);
    await db.delete(schema.requirements);
    await db.delete(schema.exports_);
    await db.delete(schema.gaps);
    await db.delete(schema.documents);
    await db.delete(schema.workflowStatusHistory);
    await db.delete(schema.idempotencyKeys);
    await db.delete(schema.workflows);
}

beforeEach(async () => {
    await clearDatabase();
    await fs.rm(path.join(process.cwd(), ".local"), {
        force: true,
        recursive: true,
    });
});

describe("workflow acceptance path", () => {
    it("processes research, one fillable PDF, one scanned PDF, approval, and export", async () => {
        const workflow = await createWorkflow(
            "Acme Bakery LLC is opening at 123 Main Street in Austin, TX 78701. Contact owner@acme.test or 555-0100.",
            {
                permitType: "food service permit",
                jurisdiction: "Austin, TX",
                entityType: "LLC",
                confidence: 0.9,
            }
        );

        expect(workflow).toBeTruthy();
        if (!workflow) {
            throw new Error("workflow should exist");
        }

        await handleWorkflowCreated(workflow.id);
        await runWorkflowResearch(workflow.id);

        const fillableForm = new FormData();
        fillableForm.append("file", await createFillablePdf());
        fillableForm.append("kind", "form");

        const fillableResponse = await uploadDocument(
            new Request("http://localhost/api/upload", {
                method: "POST",
                body: fillableForm,
            }),
            { params: Promise.resolve({ id: workflow.id }) }
        );
        expect(fillableResponse.status).toBe(201);

        const scannedForm = new FormData();
        scannedForm.append("file", await createScannedPdf());
        scannedForm.append("kind", "form");

        const scannedResponse = await uploadDocument(
            new Request("http://localhost/api/upload", {
                method: "POST",
                body: scannedForm,
            }),
            { params: Promise.resolve({ id: workflow.id }) }
        );
        expect(scannedResponse.status).toBe(201);

        const fillResult = await runWorkflowFormsFill(workflow.id);
        expect(fillResult.fills.length).toBeGreaterThan(0);

        const fills = await getFormFills(workflow.id);
        expect(fills.some((fill) => fill.confidence < 0.7)).toBe(true);

        const approvalResponse = await approveReview(
            new Request("http://localhost/api/review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    approver: "integration-test",
                    approveLowConfidence: true,
                }),
            }),
            { params: Promise.resolve({ id: workflow.id }) }
        );
        expect(approvalResponse.status).toBe(200);

        const approvedWorkflow = await getWorkflow(workflow.id);
        expect(approvedWorkflow?.reviewApprovedAt).not.toBeNull();

        const gaps = await getGaps(workflow.id);
        expect(gaps.filter((gap) => gap.blocking).length).toBe(0);

        const exportResponse = await buildExport(
            new Request("http://localhost/api/exports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "combined-all" }),
            }),
            { params: Promise.resolve({ id: workflow.id }) }
        );
        expect(exportResponse.status).toBe(201);

        const exportJson = await exportResponse.json();
        expect(exportJson.ok).toBe(true);
        expect(exportJson.data.downloadUrl).toContain("/api/blob/");

        const exports = await getExports(workflow.id);
        expect(exports.length).toBe(1);
    });
});
