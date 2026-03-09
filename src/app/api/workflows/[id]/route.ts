import { fail, success } from "@/lib/api-utils";
import {
    getReviewDecisions,
    getWorkflow,
    getWorkflowTimeline,
} from "@/lib/db/repositories";

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

        const [timeline, reviewDecisions] = await Promise.all([
            getWorkflowTimeline(id),
            getReviewDecisions(id),
        ]);

        return success({
            workflow,
            timeline,
            reviewDecisions,
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
