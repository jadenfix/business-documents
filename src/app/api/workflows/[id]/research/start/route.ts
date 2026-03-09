import { WORKFLOW_EVENTS } from "@/contracts";
import { fail, success } from "@/lib/api-utils";
import { getWorkflow } from "@/lib/db/repositories";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { runWorkflowResearch } from "@/lib/workflows";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await getWorkflow(id);
        if (!workflow) {
            return fail("not_found", "Workflow not found", 404);
        }

        if (isInngestConfigured()) {
            await sendEvent({
                name: WORKFLOW_EVENTS.RESEARCH_STARTED,
                data: { workflowId: id },
            });
            return success({ workflowId: id, status: "research.started" });
        }

        const result = await runWorkflowResearch(id);
        return success({
            workflowId: id,
            status: "research.completed",
            requirementsCount: result.requirements.length,
            gapCount: result.gaps.length,
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
