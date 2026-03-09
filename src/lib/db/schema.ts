import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* ---------- helpers ---------- */
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (col: string) =>
    text(col)
        .notNull()
        .default(sql`(datetime('now'))`);

/* ---------- workflows ---------- */
export const workflows = sqliteTable("workflows", {
    id: id(),
    prompt: text("prompt").notNull(),
    permitType: text("permit_type").notNull().default("unknown"),
    jurisdiction: text("jurisdiction").notNull().default("unknown"),
    entityType: text("entity_type").notNull().default("unknown"),
    confidence: real("confidence").notNull().default(0),
    status: text("status").notNull().default("created"),
    reviewApprovedAt: text("review_approved_at"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
});

export const workflowStatusHistory = sqliteTable("workflow_status_history", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    createdAt: ts("created_at"),
});

/* ---------- requirements ---------- */
export const requirements = sqliteTable("requirements", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type").notNull().default("official"),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    fee: text("fee"),
    dueDate: text("due_date"),
    confidence: real("confidence").notNull().default(0),
    createdAt: ts("created_at"),
});

export const citations = sqliteTable("citations", {
    id: id(),
    requirementId: text("requirement_id")
        .notNull()
        .references(() => requirements.id),
    url: text("url").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    isOfficial: integer("is_official", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at"),
});

/* ---------- documents ---------- */
export const documents = sqliteTable("documents", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    kind: text("kind").notNull().default("other"),
    blobPath: text("blob_path").notNull(),
    mimeType: text("mime_type").notNull(),
    checksum: text("checksum").notNull(),
    status: text("status").notNull().default("uploaded"),
    createdAt: ts("created_at"),
});

/* ---------- forms ---------- */
export const formTemplates = sqliteTable("form_templates", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    documentId: text("document_id")
        .notNull()
        .references(() => documents.id),
    name: text("name").notNull(),
    fieldCount: integer("field_count").notNull().default(0),
    createdAt: ts("created_at"),
});

export const formFields = sqliteTable("form_fields", {
    id: id(),
    templateId: text("template_id")
        .notNull()
        .references(() => formTemplates.id),
    fieldName: text("field_name").notNull(),
    fieldType: text("field_type").notNull().default("text"),
    required: integer("required", { mode: "boolean" }).notNull().default(false),
});

export const formFills = sqliteTable("form_fills", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    templateId: text("template_id")
        .notNull()
        .references(() => formTemplates.id),
    fieldName: text("field_name").notNull(),
    sourceKey: text("source_key").notNull(),
    value: text("value").notNull(),
    confidence: real("confidence").notNull().default(0),
    method: text("method").notNull().default("deterministic"),
    reviewFlag: integer("review_flag", { mode: "boolean" }).notNull().default(false),
    approvedAt: text("approved_at"),
    createdAt: ts("created_at"),
});

/* ---------- gaps ---------- */
export const gaps = sqliteTable("gaps", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    category: text("category").notNull(),
    message: text("message").notNull(),
    requiredAction: text("required_action").notNull(),
    blocking: integer("blocking", { mode: "boolean" }).notNull().default(true),
    resolvedAt: text("resolved_at"),
    createdAt: ts("created_at"),
});

/* ---------- exports ---------- */
export const exports_ = sqliteTable("exports", {
    id: id(),
    workflowId: text("workflow_id")
        .notNull()
        .references(() => workflows.id),
    type: text("type").notNull(),
    blobPath: text("blob_path").notNull(),
    manifestPath: text("manifest_path").notNull(),
    createdAt: ts("created_at"),
});

/* ---------- idempotency ---------- */
export const idempotencyKeys = sqliteTable("idempotency_keys", {
    key: text("key").primaryKey(),
    response: text("response").notNull(),
    statusCode: integer("status_code").notNull().default(200),
    expiresAt: text("expires_at").notNull(),
    createdAt: ts("created_at"),
});
