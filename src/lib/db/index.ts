import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };

const bootstrapStatements = [
    `CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY NOT NULL,
        prompt TEXT NOT NULL,
        permit_type TEXT NOT NULL DEFAULT 'unknown',
        jurisdiction TEXT NOT NULL DEFAULT 'unknown',
        entity_type TEXT NOT NULL DEFAULT 'unknown',
        confidence REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'created',
        review_approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_status_history (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS requirements (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_url TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'official',
        required INTEGER NOT NULL DEFAULT 1,
        fee TEXT,
        due_date TEXT,
        confidence REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS citations (
        id TEXT PRIMARY KEY NOT NULL,
        requirement_id TEXT NOT NULL REFERENCES requirements(id),
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        snippet TEXT,
        is_official INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        kind TEXT NOT NULL DEFAULT 'other',
        blob_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        checksum TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploaded',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS form_templates (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        document_id TEXT NOT NULL REFERENCES documents(id),
        name TEXT NOT NULL,
        source_mode TEXT NOT NULL DEFAULT 'fillable',
        field_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS form_fields (
        id TEXT PRIMARY KEY NOT NULL,
        template_id TEXT NOT NULL REFERENCES form_templates(id),
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL DEFAULT 'text',
        required INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS form_fills (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        template_id TEXT NOT NULL REFERENCES form_templates(id),
        field_name TEXT NOT NULL,
        source_key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'deterministic',
        review_flag INTEGER NOT NULL DEFAULT 0,
        approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS gaps (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        required_action TEXT NOT NULL,
        blocking INTEGER NOT NULL DEFAULT 1,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS exports (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        type TEXT NOT NULL,
        blob_path TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS review_decisions (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        form_fill_id TEXT REFERENCES form_fills(id),
        decision_type TEXT NOT NULL,
        approver TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY NOT NULL,
        response TEXT NOT NULL,
        status_code INTEGER NOT NULL DEFAULT 200,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_history_workflow ON workflow_status_history(workflow_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_requirements_workflow ON requirements(workflow_id)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_workflow ON documents(workflow_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_form_templates_workflow ON form_templates(workflow_id)`,
    `CREATE INDEX IF NOT EXISTS idx_form_fields_template ON form_fields(template_id)`,
    `CREATE INDEX IF NOT EXISTS idx_form_fills_workflow ON form_fills(workflow_id, template_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gaps_workflow ON gaps(workflow_id, blocking)`,
    `CREATE INDEX IF NOT EXISTS idx_exports_workflow ON exports(workflow_id, created_at DESC)`,
];

let bootstrapPromise: Promise<void> | null = null;

export async function ensureDatabaseInitialized() {
    if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
            for (const statement of bootstrapStatements) {
                await client.execute(statement);
            }
        })();
    }

    await bootstrapPromise;
}
