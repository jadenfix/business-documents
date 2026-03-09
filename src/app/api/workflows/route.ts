import { WORKFLOW_EVENTS, WorkflowCreateSchema } from "@/contracts";
import { handler, parseBody, success } from "@/lib/api-utils";
import { createWorkflow, listWorkflows } from "@/lib/db/repositories";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { handleWorkflowCreated, runWorkflowResearch } from "@/lib/workflows";

export const GET = handler(async () => {
    const workflows = await listWorkflows();
    return success({ workflows });
});

export const POST = handler(async (req) => {
    const body = await parseBody(req, WorkflowCreateSchema);
    const workflow = await createWorkflow(body.prompt, body.classification);

    if (workflow) {
        if (isInngestConfigured()) {
            await sendEvent({
                name: WORKFLOW_EVENTS.WORKFLOW_CREATED,
                data: { workflowId: workflow.id },
            });
        } else {
            await handleWorkflowCreated(workflow.id);
            await runWorkflowResearch(workflow.id);
        }
    }

    return success(workflow, 201);
});
