import { WORKFLOW_EVENTS, ExportBuildSchema } from "@/contracts";
import { fail, parseBody, success } from "@/lib/api-utils";
import {
    addExport,
    getBlockingGaps,
    getDocuments,
    getRequirements,
    getWorkflow,
} from "@/lib/db/repositories";
import { buildExportBundle } from "@/lib/exports";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { buildFilledArtifactsForWorkflow } from "@/lib/workflows";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) {
            return fail("not_found", "Workflow not found", 404);
        }

        if (!workflow.reviewApprovedAt) {
            return fail("policy", "Workflow must be approved before export", 422);
        }

        const blockingGaps = await getBlockingGaps(id);
        if (blockingGaps.length > 0) {
            return fail(
                "policy",
                "All blocking gaps must be resolved before export",
                422,
                { gaps: blockingGaps }
            );
        }

        const body = await parseBody(req, ExportBuildSchema);
        const bundleType = body.type ?? "combined-all";

        const [documents, requirements, filledArtifacts] = await Promise.all([
            getDocuments(id),
            getRequirements(id),
            buildFilledArtifactsForWorkflow(id),
        ]);

        const result = await buildExportBundle({
            workflowId: id,
            bundleType,
            documents: documents.map((document) => ({
                id: document.id,
                blobPath: document.blobPath,
                mimeType: document.mimeType,
                kind: document.kind,
                status: document.status,
            })),
            filledArtifacts,
            requirements: requirements.map((requirement) => ({
                title: requirement.title,
                description: requirement.description,
                sourceType: requirement.sourceType,
                required: requirement.required,
            })),
        });

        const exportRecord = await addExport({
            workflowId: id,
            type: bundleType,
            blobPath: result.blobPath,
            manifestPath: result.manifestPath,
        });

        if (isInngestConfigured()) {
            await sendEvent({
                name: WORKFLOW_EVENTS.EXPORTS_READY,
                data: {
                    workflowId: id,
                    exportId: exportRecord.id,
                    bundleType,
                },
            });
        }

        return success(
            {
                ...exportRecord,
                files: result.files,
                downloadUrl: result.downloadUrl,
            },
            201
        );
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
