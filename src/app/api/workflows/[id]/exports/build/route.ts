import { success, fail, parseBody } from "@/lib/api-utils";
import { ExportBuildSchema } from "@/contracts";
import {
    getWorkflow,
    getDocuments,
    getRequirements,
    getBlockingGaps,
    addExport,
} from "@/lib/db/repositories";
import { buildExportBundle } from "@/lib/exports";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);

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

        const [documents, requirements] = await Promise.all([
            getDocuments(id),
            getRequirements(id),
        ]);

        const result = await buildExportBundle({
            workflowId: id,
            bundleType,
            documents: documents.map((d) => ({
                id: d.id,
                blobPath: d.blobPath,
                mimeType: d.mimeType,
                kind: d.kind,
                status: d.status,
            })),
            filledForms: [],
            requirements: requirements.map((r) => ({
                title: r.title,
                description: r.description,
                sourceType: r.sourceType,
                required: r.required,
            })),
        });

        const exp = await addExport({
            workflowId: id,
            type: bundleType,
            blobPath: result.blobPath,
            manifestPath: result.manifestPath,
        });

        return success(exp, 201);
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
