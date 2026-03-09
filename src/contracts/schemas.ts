import { z } from "zod";

export const IntakeRequestSchema = z.object({
  prompt: z.string().min(10),
  businessProfileId: z.string().uuid().optional(),
  preferredJurisdiction: z.string().min(2).optional()
});

export const ClassificationResultSchema = z.object({
  permitType: z.string().min(2),
  jurisdiction: z.string().min(2),
  entityType: z.string().min(2),
  confidence: z.number().min(0).max(1)
});

export const RequirementItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["official", "advisory"]),
  required: z.boolean(),
  fee: z.string().optional(),
  dueDate: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export const DocumentRecordSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["form", "supporting", "identification", "other"]),
  blobPath: z.string(),
  mimeType: z.string(),
  checksum: z.string(),
  status: z.enum(["uploaded", "processed", "failed"])
});

export const FormFieldMappingSchema = z.object({
  formId: z.string().uuid(),
  fieldName: z.string(),
  sourceKey: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  method: z.enum(["deterministic", "vision-assisted", "manual"])
});

export const GapItemSchema = z.object({
  id: z.string(),
  category: z.enum(["requirement", "document", "field", "review"]),
  message: z.string(),
  requiredAction: z.string(),
  blocking: z.boolean()
});

export const ExportBundleSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["combined-all", "separate-files", "unfilled-only"]),
  blobPath: z.string(),
  manifestPath: z.string(),
  createdAt: z.string()
});

export const WorkflowStageSchema = z.enum([
  "created",
  "classification.completed",
  "research.started",
  "research.completed",
  "documents.processed",
  "forms.fill.completed",
  "gaps.generated",
  "review.approved",
  "exports.ready"
]);

export const WorkflowSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  permitType: z.string(),
  jurisdiction: z.string(),
  entityType: z.string(),
  confidence: z.number().min(0).max(1),
  status: WorkflowStageSchema,
  reviewApprovedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const WorkflowCreateSchema = z.object({
  prompt: z.string().min(10),
  classification: ClassificationResultSchema
});

export const ReviewApprovalSchema = z.object({
  approver: z.string().min(2).default("owner"),
  note: z.string().max(1000).optional(),
  approveLowConfidence: z.boolean().default(false)
});

export const ExportBuildSchema = z.object({
  type: z.enum(["combined-all", "separate-files", "unfilled-only"]).optional()
});

export type IntakeRequest = z.infer<typeof IntakeRequestSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
export type RequirementItem = z.infer<typeof RequirementItemSchema>;
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
export type FormFieldMapping = z.infer<typeof FormFieldMappingSchema>;
export type GapItem = z.infer<typeof GapItemSchema>;
export type ExportBundle = z.infer<typeof ExportBundleSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
