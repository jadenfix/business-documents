import { WORKFLOW_EVENTS } from "@/contracts";
import { fail, success } from "@/lib/api-utils";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { processWorkflowDocumentUpload } from "@/lib/workflows";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const formData = await req.formData();
        const file = formData.get("file");
        const kind = String(formData.get("kind") ?? "other");

        if (!(file instanceof File)) {
            return fail("validation", "No file provided", 400);
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await processWorkflowDocumentUpload({
            workflowId: id,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            kind,
            buffer,
        });

        if (isInngestConfigured()) {
            await sendEvent({
                name: WORKFLOW_EVENTS.DOCUMENTS_PROCESSED,
                data: {
                    workflowId: id,
                    documentId: result.document.id,
                },
            });
            await sendEvent({
                name: WORKFLOW_EVENTS.GAP_GENERATED,
                data: {
                    workflowId: id,
                    gapCount: result.gaps.length,
                },
            });
        }

        return success(result, 201);
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
