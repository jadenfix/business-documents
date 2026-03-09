export const WORKFLOW_EVENTS = {
  WORKFLOW_CREATED: "workflow.created",
  RESEARCH_STARTED: "research.started",
  RESEARCH_COMPLETED: "research.completed",
  DOCUMENTS_PROCESSED: "documents.processed",
  FORMS_FILL_STARTED: "forms.fill.started",
  FORMS_FILL_COMPLETED: "forms.fill.completed",
  GAP_GENERATED: "gap.generated",
  REVIEW_APPROVED: "review.approved",
  EXPORTS_READY: "exports.ready"
} as const;

export type WorkflowEventName = (typeof WORKFLOW_EVENTS)[keyof typeof WORKFLOW_EVENTS];
