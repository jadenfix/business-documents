import { success, fail } from "@/lib/api-utils";
import { getWorkflow, getGaps } from "@/lib/db/repositories";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) return fail("not_found", "Workflow not found", 404);

        const gaps = await getGaps(id);
        const blocking = gaps.filter((g) => g.blocking && !g.resolvedAt);
        const nonBlocking = gaps.filter((g) => !g.blocking || !!g.resolvedAt);

        return success({
            workflowId: id,
            blocking,
            nonBlocking,
            canExport: blocking.length === 0 && !!workflow.reviewApprovedAt,
        });
    } catch (err) {
        console.error("[api]", err);
        return fail("internal", "An unexpected error occurred");
    }
}
