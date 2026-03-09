import { WORKFLOW_EVENTS } from "@/contracts";
import { fail, success } from "@/lib/api-utils";
import { getWorkflow } from "@/lib/db/repositories";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { runWorkflowFormsFill } from "@/lib/workflows";

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
                name: WORKFLOW_EVENTS.FORMS_FILL_STARTED,
                data: { workflowId: id },
            });
            return success({ workflowId: id, status: "forms.fill.started" });
        }

        const result = await runWorkflowFormsFill(id);
        return success({
            workflowId: id,
            status: "forms.fill.completed",
            fillCount: result.fills.length,
            gapCount: result.gaps.length,
        });
    } catch (error) {
        console.error("[api]", error);
        return fail("internal", "An unexpected error occurred");
    }
}
