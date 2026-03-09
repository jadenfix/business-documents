import { handler, parseBody, success } from "@/lib/api-utils";
import { IntakeRequestSchema } from "@/contracts";
import { classifyPermit } from "@/lib/llm";
import { createWorkflow } from "@/lib/db/repositories";
import { inngest } from "@/lib/inngest";
import { WORKFLOW_EVENTS } from "@/contracts";

export const POST = handler(async (req) => {
    const body = await parseBody(req, IntakeRequestSchema);

    // Classify the permit using LLM
    const classification = await classifyPermit(body.prompt);

    // Merge with any user-provided jurisdiction override
    if (body.preferredJurisdiction) {
        classification.jurisdiction = body.preferredJurisdiction;
    }

    // Create workflow
    const workflow = await createWorkflow(body.prompt, classification);

    // Send event to Inngest
    await inngest.send({
        name: WORKFLOW_EVENTS.WORKFLOW_CREATED,
        data: { workflowId: workflow!.id },
    });

    return success(
        { workflow, classification },
        201
    );
});
