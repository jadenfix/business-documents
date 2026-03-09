import { fail, success } from "@/lib/api-utils";
import { getWorkflow } from "@/lib/db/repositories";
import { recomputeWorkflowGaps } from "@/lib/workflows";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) {
            return fail("not_found", "Workflow not found", 404);
        }

        const gaps = await recomputeWorkflowGaps(id);
        const blocking = gaps.filter((gap) => gap.blocking);
        const nonBlocking = gaps.filter((gap) => !gap.blocking);

        return success({
            workflowId: id,
            blocking,
            nonBlocking,
            canExport: blocking.length === 0 && Boolean(workflow.reviewApprovedAt),
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
