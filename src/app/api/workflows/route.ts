import { handler, parseBody, success } from "@/lib/api-utils";
import { WorkflowCreateSchema } from "@/contracts";
import { createWorkflow } from "@/lib/db/repositories";
import { inngest } from "@/lib/inngest";
import { WORKFLOW_EVENTS } from "@/contracts";

export const POST = handler(async (req) => {
    const body = await parseBody(req, WorkflowCreateSchema);
    const workflow = await createWorkflow(body.prompt, body.classification);

    await inngest.send({
        name: WORKFLOW_EVENTS.WORKFLOW_CREATED,
        data: { workflowId: workflow!.id },
    });

    return success(workflow, 201);
});
