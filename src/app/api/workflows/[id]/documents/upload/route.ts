import { success, fail } from "@/lib/api-utils";
import { getWorkflow, addDocument } from "@/lib/db/repositories";
import { uploadBlob } from "@/lib/blob";
import { createHash } from "crypto";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const kind = (formData.get("kind") as string) || "other";

        if (!file) return fail("validation", "No file provided", 400);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const checksum = createHash("sha256").update(buffer).digest("hex");

        const blobPath = `workflows/${id}/uploads/${file.name}`;
        await uploadBlob(blobPath, buffer, file.type);

        const doc = await addDocument({
            workflowId: id,
            kind,
            blobPath,
            mimeType: file.type,
            checksum,
        });

        return success(doc, 201);
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
