import { IntakeRequestSchema } from "@/contracts";
import { handler, parseBody, success } from "@/lib/api-utils";
import { createWorkflow, getWorkflow } from "@/lib/db/repositories";
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client";
import { classifyPermit } from "@/lib/llm";
import { handleWorkflowCreated, runWorkflowResearch } from "@/lib/workflows";
import { WORKFLOW_EVENTS } from "@/contracts";

export const POST = handler(async (req) => {
    const body = await parseBody(req, IntakeRequestSchema);
    const classification = await classifyPermit(body.prompt);

    if (body.preferredJurisdiction) {
        classification.jurisdiction = body.preferredJurisdiction;
    }

    const workflow = await createWorkflow(body.prompt, classification);

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

    return success(
        {
            workflow: workflow ? await getWorkflow(workflow.id) : workflow,
            classification,
        },
        201
    );
});
