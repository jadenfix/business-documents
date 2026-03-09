import { WORKFLOW_EVENTS } from "@/contracts";
import { inngest } from "./client";
import {
    handleWorkflowCreated,
    runWorkflowFormsFill,
    runWorkflowResearch,
} from "@/lib/workflows";

export const workflowCreatedPipeline = inngest.createFunction(
    {
        id: "workflow-created-pipeline",
        concurrency: [{ scope: "event", limit: 1, key: "event.data.workflowId" }],
    },
    { event: WORKFLOW_EVENTS.WORKFLOW_CREATED },
    async ({ event, step }) => {
        const { workflowId } = event.data as { workflowId: string };

        await step.run("complete-classification", async () => {
            await handleWorkflowCreated(workflowId);
        });

        await step.sendEvent("research-started", {
            name: WORKFLOW_EVENTS.RESEARCH_STARTED,
            data: { workflowId },
        });

        return { workflowId };
    }
);

export const researchPipeline = inngest.createFunction(
    {
        id: "research-pipeline",
        concurrency: [{ scope: "event", limit: 1, key: "event.data.workflowId" }],
        retries: 2,
    },
    { event: WORKFLOW_EVENTS.RESEARCH_STARTED },
    async ({ event, step }) => {
        const { workflowId } = event.data as { workflowId: string };

        const result = await step.run("run-research", async () => runWorkflowResearch(workflowId));

        await step.sendEvent("research-completed", {
            name: WORKFLOW_EVENTS.RESEARCH_COMPLETED,
            data: {
                workflowId,
                requirementsCount: result.requirements.length,
            },
        });

        await step.sendEvent("gap-generated", {
            name: WORKFLOW_EVENTS.GAP_GENERATED,
            data: {
                workflowId,
                gapCount: result.gaps.length,
            },
        });

        return {
            workflowId,
            requirementsCount: result.requirements.length,
        };
    }
);

export const formsFillPipeline = inngest.createFunction(
    {
        id: "forms-fill-pipeline",
        concurrency: [{ scope: "event", limit: 1, key: "event.data.workflowId" }],
        retries: 1,
    },
    { event: WORKFLOW_EVENTS.FORMS_FILL_STARTED },
    async ({ event, step }) => {
        const { workflowId } = event.data as { workflowId: string };

        const result = await step.run("run-forms-fill", async () => runWorkflowFormsFill(workflowId));

        await step.sendEvent("forms-fill-completed", {
            name: WORKFLOW_EVENTS.FORMS_FILL_COMPLETED,
            data: {
                workflowId,
                fillCount: result.fills.length,
            },
        });

        await step.sendEvent("gap-generated", {
            name: WORKFLOW_EVENTS.GAP_GENERATED,
            data: {
                workflowId,
                gapCount: result.gaps.length,
            },
        });

        return {
            workflowId,
            fillCount: result.fills.length,
        };
    }
);

export const allFunctions = [
    workflowCreatedPipeline,
    researchPipeline,
    formsFillPipeline,
];
