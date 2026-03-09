import { and, desc, eq, inArray } from "drizzle-orm";
import type { ClassificationResult } from "@/contracts";
import { db, ensureDatabaseInitialized, schema } from "./index";

async function ready() {
    await ensureDatabaseInitialized();
}

/* ---------- Workflows ---------- */

export async function listWorkflows(limit = 50) {
    await ready();
    return db
        .select()
        .from(schema.workflows)
        .orderBy(desc(schema.workflows.updatedAt))
        .limit(limit);
}

export async function createWorkflow(prompt: string, classification: ClassificationResult) {
    await ready();
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
    await ready();
    const rows = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, id))
        .limit(1);
    return rows[0] ?? null;
}

export async function updateWorkflowStatus(id: string, status: string) {
    await ready();
    const current = await getWorkflow(id);
    if (!current) throw new Error(`Workflow ${id} not found`);
    if (current.status === status) return current;

    await db.insert(schema.workflowStatusHistory).values({
        workflowId: id,
        fromStatus: current.status,
        toStatus: status,
    });

    await db
        .update(schema.workflows)
        .set({ status, updatedAt: new Date().toISOString() })
        .where(eq(schema.workflows.id, id));

    return getWorkflow(id);
}

export async function approveWorkflow(id: string) {
    await ready();
    const current = await getWorkflow(id);
    if (!current) throw new Error(`Workflow ${id} not found`);

    await db.insert(schema.workflowStatusHistory).values({
        workflowId: id,
        fromStatus: current.status,
        toStatus: "review.approved",
    });

    await db
        .update(schema.workflows)
        .set({
            status: "review.approved",
            reviewApprovedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.workflows.id, id));

    return getWorkflow(id);
}

export async function getWorkflowTimeline(workflowId: string) {
    await ready();
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
    await ready();
    if (items.length === 0) return [];

    const values = items.map((item) => ({
        id: crypto.randomUUID(),
        workflowId,
        ...item,
    }));

    await db.insert(schema.requirements).values(values);
    return values;
}

export async function clearRequirements(workflowId: string) {
    await ready();
    const requirementRows = await db
        .select({ id: schema.requirements.id })
        .from(schema.requirements)
        .where(eq(schema.requirements.workflowId, workflowId));

    if (requirementRows.length > 0) {
        await db
            .delete(schema.citations)
            .where(inArray(schema.citations.requirementId, requirementRows.map((row) => row.id)));
    }

    await db.delete(schema.requirements).where(eq(schema.requirements.workflowId, workflowId));
}

export async function getRequirements(workflowId: string) {
    await ready();
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
    await ready();
    if (items.length === 0) return;
    await db.insert(schema.citations).values(items);
}

export async function getCitationsForWorkflow(workflowId: string) {
    await ready();
    const rows = await db
        .select({
            id: schema.citations.id,
            requirementId: schema.citations.requirementId,
            url: schema.citations.url,
            title: schema.citations.title,
            snippet: schema.citations.snippet,
            isOfficial: schema.citations.isOfficial,
        })
        .from(schema.citations)
        .innerJoin(
            schema.requirements,
            eq(schema.citations.requirementId, schema.requirements.id)
        )
        .where(eq(schema.requirements.workflowId, workflowId));

    return rows.map((row) => ({
        id: row.id,
        requirementId: row.requirementId,
        url: row.url,
        title: row.title,
        snippet: row.snippet,
        isOfficial: row.isOfficial,
    }));
}

/* ---------- Documents ---------- */

export async function addDocument(doc: {
    workflowId: string;
    kind: string;
    blobPath: string;
    mimeType: string;
    checksum: string;
}) {
    await ready();
    const id = crypto.randomUUID();
    await db.insert(schema.documents).values({ id, ...doc });
    return { id, ...doc, status: "uploaded" as const };
}

export async function getDocument(id: string) {
    await ready();
    const rows = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, id))
        .limit(1);
    return rows[0] ?? null;
}

export async function getDocuments(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.workflowId, workflowId))
        .orderBy(desc(schema.documents.createdAt));
}

export async function updateDocumentStatus(id: string, status: string) {
    await ready();
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
    sourceMode: string;
    fieldCount: number;
}) {
    await ready();
    const id = crypto.randomUUID();
    await db.insert(schema.formTemplates).values({ id, ...tpl });
    return {
        id,
        ...tpl,
    };
}

export async function addFormFields(
    templateId: string,
    fields: Array<{ fieldName: string; fieldType: string; required: boolean }>
) {
    await ready();
    if (fields.length === 0) return [];

    const values = fields.map((field) => ({
        id: crypto.randomUUID(),
        templateId,
        ...field,
    }));

    await db.insert(schema.formFields).values(values);
    return values;
}

export async function getFormFields(templateId: string) {
    await ready();
    return db
        .select()
        .from(schema.formFields)
        .where(eq(schema.formFields.templateId, templateId));
}

export async function getFormTemplates(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.formTemplates)
        .where(eq(schema.formTemplates.workflowId, workflowId))
        .orderBy(desc(schema.formTemplates.createdAt));
}

export async function getFormTemplatesWithFields(workflowId: string) {
    await ready();
    const templates = await getFormTemplates(workflowId);
    const fields = await Promise.all(
        templates.map(async (template) => ({
            template,
            fields: await getFormFields(template.id),
        }))
    );

    return fields;
}

export async function clearFormFills(workflowId: string) {
    await ready();
    await db.delete(schema.formFills).where(eq(schema.formFills.workflowId, workflowId));
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
    await ready();
    if (fills.length === 0) return [];

    const values = fills.map((fill) => ({
        id: crypto.randomUUID(),
        ...fill,
    }));

    await db.insert(schema.formFills).values(values);
    return values;
}

export async function getFormFills(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.formFills)
        .where(eq(schema.formFills.workflowId, workflowId))
        .orderBy(desc(schema.formFills.createdAt));
}

export async function approveFormFills(
    workflowId: string,
    fillIds: string[],
    approver: string,
    note?: string
) {
    await ready();
    if (fillIds.length === 0) return;

    const approvedAt = new Date().toISOString();

    await db
        .update(schema.formFills)
        .set({ approvedAt, reviewFlag: false })
        .where(
            and(
                eq(schema.formFills.workflowId, workflowId),
                inArray(schema.formFills.id, fillIds)
            )
        );

    await db.insert(schema.reviewDecisions).values(
        fillIds.map((formFillId) => ({
            id: crypto.randomUUID(),
            workflowId,
            formFillId,
            decisionType: "low-confidence-approval",
            approver,
            note,
        }))
    );
}

/* ---------- Gaps ---------- */

export async function replaceGaps(
    workflowId: string,
    items: Array<{
        category: string;
        message: string;
        requiredAction: string;
        blocking: boolean;
    }>
) {
    await ready();
    await db.delete(schema.gaps).where(eq(schema.gaps.workflowId, workflowId));
    if (items.length === 0) return [];

    const values = items.map((item) => ({
        id: crypto.randomUUID(),
        workflowId,
        ...item,
    }));

    await db.insert(schema.gaps).values(values);
    return values;
}

export async function getGaps(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.gaps)
        .where(eq(schema.gaps.workflowId, workflowId))
        .orderBy(desc(schema.gaps.createdAt));
}

export async function getBlockingGaps(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.gaps)
        .where(and(eq(schema.gaps.workflowId, workflowId), eq(schema.gaps.blocking, true)));
}

/* ---------- Exports ---------- */

export async function addExport(exp: {
    workflowId: string;
    type: string;
    blobPath: string;
    manifestPath: string;
}) {
    await ready();
    const id = crypto.randomUUID();
    await db.insert(schema.exports_).values({ id, ...exp });
    return { id, ...exp };
}

export async function getExports(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.exports_)
        .where(eq(schema.exports_.workflowId, workflowId))
        .orderBy(desc(schema.exports_.createdAt));
}

/* ---------- Review Decisions ---------- */

export async function addWorkflowReviewDecision(
    workflowId: string,
    approver: string,
    note?: string
) {
    await ready();
    await db.insert(schema.reviewDecisions).values({
        id: crypto.randomUUID(),
        workflowId,
        decisionType: "workflow-approval",
        approver,
        note,
    });
}

export async function getReviewDecisions(workflowId: string) {
    await ready();
    return db
        .select()
        .from(schema.reviewDecisions)
        .where(eq(schema.reviewDecisions.workflowId, workflowId))
        .orderBy(desc(schema.reviewDecisions.createdAt));
}

/* ---------- Idempotency ---------- */

export async function getIdempotentResponse(key: string) {
    await ready();
    const rows = await db
        .select()
        .from(schema.idempotencyKeys)
        .where(eq(schema.idempotencyKeys.key, key))
        .limit(1);

    if (!rows[0]) return null;
    if (new Date(rows[0].expiresAt) < new Date()) return null;

    return {
        response: JSON.parse(rows[0].response),
        statusCode: rows[0].statusCode,
    };
}

export async function setIdempotentResponse(
    key: string,
    response: unknown,
    statusCode: number,
    ttlMs = 3_600_000
) {
    await ready();
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
