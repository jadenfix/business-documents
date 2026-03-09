import { inngest } from "./client";
import * as repo from "@/lib/db/repositories";
import { runResearch } from "@/lib/research";
import { analyzeGaps } from "@/lib/gaps";
import { WORKFLOW_EVENTS } from "@/contracts";

/* --------------------------------------------------------
 * 1. intake/classify – triggered by workflow.created
 * -------------------------------------------------------- */
export const intakeClassify = inngest.createFunction(
    {
        id: "intake-classify",
        concurrency: [{ scope: "fn", limit: 5 }],
    },
    { event: WORKFLOW_EVENTS.WORKFLOW_CREATED },
    async ({ event, step }) => {
        const { workflowId } = event.data as { workflowId: string };

        await step.run("mark-classification-complete", async () => {
            await repo.updateWorkflowStatus(workflowId, "classification.completed");
        });

        // Auto-trigger research
        await step.sendEvent("trigger-research", {
            name: WORKFLOW_EVENTS.RESEARCH_STARTED,
            data: { workflowId },
        });

        return { workflowId, stage: "classification.completed" };
    }
);

/* --------------------------------------------------------
 * 2. research – triggered by research.started
 * -------------------------------------------------------- */
export const researchPipeline = inngest.createFunction(
    {
        id: "research-pipeline",
        concurrency: [{ scope: "fn", limit: 3 }],
        retries: 2,
    },
    { event: WORKFLOW_EVENTS.RESEARCH_STARTED },
    async ({ event, step }) => {
        const { workflowId } = event.data as { workflowId: string };

        const workflow = await step.run("get-workflow", async () => {
            return repo.getWorkflow(workflowId);
        });

        if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

        await step.run("mark-research-started", async () => {
            await repo.updateWorkflowStatus(workflowId, "research.started");
        });

        const result = await step.run("run-research", async () => {
            return runResearch(
                workflow.jurisdiction,
                workflow.permitType,
                workflow.entityType
            );
        });

        await step.run("persist-results", async () => {
            const saved = await repo.addRequirements(
                workflowId,
                result.requirements
            );

            // Add citations for each requirement
            for (const req of saved) {
                const relatedCitations = result.citations.filter((c) =>
                    result.requirements.find(
                        (r) => r.title === req.title && r.sourceUrl === c.url
                    )
                );
                if (relatedCitations.length > 0) {
                    await repo.addCitations(
                        relatedCitations.map((c) => ({
                            requirementId: req.id,
                            ...c,
                        }))
                    );
                }
            }

            await repo.updateWorkflowStatus(workflowId, "research.completed");
        });

        await step.sendEvent("research-complete", {
            name: WORKFLOW_EVENTS.RESEARCH_COMPLETED,
            data: { workflowId },
        });

        return { workflowId, requirementsCount: result.requirements.length };
    }
);

/* --------------------------------------------------------
 * 3. gap generation – triggered by various completion events
 * -------------------------------------------------------- */
export const gapGeneration = inngest.createFunction(
    {
        id: "gap-generation",
        concurrency: [{ scope: "fn", limit: 5 }],
    },
    [
        { event: WORKFLOW_EVENTS.RESEARCH_COMPLETED },
        { event: WORKFLOW_EVENTS.DOCUMENTS_PROCESSED },
        { event: WORKFLOW_EVENTS.FORMS_FILL_COMPLETED },
    ],
    async ({ event, step }) => {
        const { workflowId } = event.data as { workflowId: string };

        const gapItems = await step.run("analyze-gaps", async () => {
            const [requirements, documents, formFills] = await Promise.all([
                repo.getRequirements(workflowId),
                repo.getDocuments(workflowId),
                repo.getFormFills(workflowId),
            ]);

            return analyzeGaps({
                requirements: requirements.map((r) => ({
                    id: r.id,
                    title: r.title,
                    required: r.required,
                    sourceType: r.sourceType,
                })),
                documents: documents.map((d) => ({
                    id: d.id,
                    kind: d.kind,
                    status: d.status,
                })),
                formFills: formFills.map((f) => ({
                    fieldName: f.fieldName,
                    confidence: f.confidence,
                    approvedAt: f.approvedAt,
                })),
            });
        });

        await step.run("persist-gaps", async () => {
            await repo.addGaps(
                gapItems.map((g) => ({ workflowId, ...g }))
            );
            await repo.updateWorkflowStatus(workflowId, "gaps.generated");
        });

        await step.sendEvent("gaps-generated", {
            name: WORKFLOW_EVENTS.GAP_GENERATED,
            data: { workflowId, gapCount: gapItems.length },
        });

        return { workflowId, gapCount: gapItems.length };
    }
);

export const allFunctions = [intakeClassify, researchPipeline, gapGeneration];
