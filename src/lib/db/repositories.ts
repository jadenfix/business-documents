import { eq, desc, and } from "drizzle-orm";
import { db, schema } from "./index";
import type { ClassificationResult } from "@/contracts";

/* ---------- Workflows ---------- */

export async function createWorkflow(prompt: string, classification: ClassificationResult) {
    const id = crypto.randomUUID();
    await db.insert(schema.workflows).values({
        id,
        prompt,
        permitType: classification.permitType,
        jurisdiction: classification.jurisdiction,
        entityType: classification.entityType,
        confidence: classification.confidence,
        status: "created",
    });
    return getWorkflow(id);
}

export async function getWorkflow(id: string) {
    const rows = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, id))
        .limit(1);
    return rows[0] ?? null;
}

export async function updateWorkflowStatus(id: string, status: string) {
    const current = await getWorkflow(id);
    if (!current) throw new Error(`Workflow ${id} not found`);

    await db.insert(schema.workflowStatusHistory).values({
        workflowId: id,
        fromStatus: current.status,
        toStatus: status,
    });

    await db
        .update(schema.workflows)
        .set({ status, updatedAt: new Date().toISOString() })
        .where(eq(schema.workflows.id, id));
}

export async function approveWorkflow(id: string) {
    await db
        .update(schema.workflows)
        .set({
            status: "review.approved",
            reviewApprovedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.workflows.id, id));
}

export async function getWorkflowTimeline(workflowId: string) {
    return db
        .select()
        .from(schema.workflowStatusHistory)
        .where(eq(schema.workflowStatusHistory.workflowId, workflowId))
        .orderBy(desc(schema.workflowStatusHistory.createdAt));
}

/* ---------- Requirements ---------- */

export async function addRequirements(
    workflowId: string,
    items: Array<{
        title: string;
        description: string;
        sourceUrl: string;
        sourceType: string;
        required: boolean;
        fee?: string;
        dueDate?: string;
        confidence: number;
    }>
) {
    if (items.length === 0) return [];
    const values = items.map((item) => ({
        id: crypto.randomUUID(),
        workflowId,
        ...item,
    }));
    await db.insert(schema.requirements).values(values);
    return values;
}

export async function getRequirements(workflowId: string) {
    return db
        .select()
        .from(schema.requirements)
        .where(eq(schema.requirements.workflowId, workflowId));
}

/* ---------- Citations ---------- */

export async function addCitations(
    items: Array<{
        requirementId: string;
        url: string;
        title: string;
        snippet?: string;
        isOfficial: boolean;
    }>
) {
    if (items.length === 0) return;
    await db.insert(schema.citations).values(items);
}

/* ---------- Documents ---------- */

export async function addDocument(doc: {
    workflowId: string;
    kind: string;
    blobPath: string;
    mimeType: string;
    checksum: string;
}) {
    const id = crypto.randomUUID();
    await db.insert(schema.documents).values({ id, ...doc });
    return { id, ...doc, status: "uploaded" };
}

export async function getDocuments(workflowId: string) {
    return db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.workflowId, workflowId));
}

export async function updateDocumentStatus(id: string, status: string) {
    await db
        .update(schema.documents)
        .set({ status })
        .where(eq(schema.documents.id, id));
}

/* ---------- Form Templates + Fills ---------- */

export async function addFormTemplate(tpl: {
    workflowId: string;
    documentId: string;
    name: string;
    fieldCount: number;
}) {
    const id = crypto.randomUUID();
    await db.insert(schema.formTemplates).values({ id, ...tpl });
    return id;
}

export async function addFormFields(
    templateId: string,
    fields: Array<{ fieldName: string; fieldType: string; required: boolean }>
) {
    if (fields.length === 0) return;
    await db.insert(schema.formFields).values(
        fields.map((f) => ({ ...f, templateId }))
    );
}

export async function addFormFills(
    fills: Array<{
        workflowId: string;
        templateId: string;
        fieldName: string;
        sourceKey: string;
        value: string;
        confidence: number;
        method: string;
        reviewFlag: boolean;
    }>
) {
    if (fills.length === 0) return;
    await db.insert(schema.formFills).values(fills);
}

export async function getFormFills(workflowId: string) {
    return db
        .select()
        .from(schema.formFills)
        .where(eq(schema.formFills.workflowId, workflowId));
}

export async function getFormTemplates(workflowId: string) {
    return db
        .select()
        .from(schema.formTemplates)
        .where(eq(schema.formTemplates.workflowId, workflowId));
}

/* ---------- Gaps ---------- */

export async function addGaps(
    items: Array<{
        workflowId: string;
        category: string;
        message: string;
        requiredAction: string;
        blocking: boolean;
    }>
) {
    if (items.length === 0) return;
    await db.insert(schema.gaps).values(items);
}

export async function getGaps(workflowId: string) {
    return db.select().from(schema.gaps).where(eq(schema.gaps.workflowId, workflowId));
}

export async function getBlockingGaps(workflowId: string) {
    return db
        .select()
        .from(schema.gaps)
        .where(
            and(eq(schema.gaps.workflowId, workflowId), eq(schema.gaps.blocking, true))
        );
}

/* ---------- Exports ---------- */

export async function addExport(exp: {
    workflowId: string;
    type: string;
    blobPath: string;
    manifestPath: string;
}) {
    const id = crypto.randomUUID();
    await db.insert(schema.exports_).values({ id, ...exp });
    return { id, ...exp };
}

export async function getExports(workflowId: string) {
    return db
        .select()
        .from(schema.exports_)
        .where(eq(schema.exports_.workflowId, workflowId))
        .orderBy(desc(schema.exports_.createdAt));
}

/* ---------- Idempotency ---------- */

export async function getIdempotentResponse(key: string) {
    const rows = await db
        .select()
        .from(schema.idempotencyKeys)
        .where(eq(schema.idempotencyKeys.key, key))
        .limit(1);
    if (!rows[0]) return null;
    if (new Date(rows[0].expiresAt) < new Date()) return null;
    return { response: JSON.parse(rows[0].response), statusCode: rows[0].statusCode };
}

export async function setIdempotentResponse(
    key: string,
    response: unknown,
    statusCode: number,
    ttlMs = 3600_000
) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await db
        .insert(schema.idempotencyKeys)
        .values({
            key,
            response: JSON.stringify(response),
            statusCode,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: schema.idempotencyKeys.key,
            set: {
                response: JSON.stringify(response),
                statusCode,
                expiresAt,
            },
        });
}
