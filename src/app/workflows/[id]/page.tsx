"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Workflow {
    id: string;
    prompt: string;
    permitType: string;
    jurisdiction: string;
    entityType: string;
    confidence: number;
    status: string;
    reviewApprovedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface TimelineEntry {
    fromStatus: string;
    toStatus: string;
    createdAt: string;
}

interface Requirement {
    id: string;
    title: string;
    description: string;
    sourceUrl: string;
    sourceType: string;
    required: boolean;
    fee?: string | null;
    confidence: number;
}

interface Citation {
    id: string;
    requirementId: string;
    url: string;
    title: string;
    snippet?: string | null;
    isOfficial: boolean;
}

interface FormFill {
    id: string;
    templateId: string;
    fieldName: string;
    value: string;
    confidence: number;
    method: string;
    approvedAt: string | null;
    reviewFlag: boolean;
}

interface FormTemplate {
    id: string;
    name: string;
    sourceMode: string;
    fieldCount: number;
    fields: Array<{ id: string; fieldName: string; required: boolean }>;
    fills: FormFill[];
}

interface GapData {
    blocking: Array<{ category: string; message: string; requiredAction: string }>;
    nonBlocking: Array<{ category: string; message: string; requiredAction: string }>;
    canExport: boolean;
}

interface ExportRecord {
    id: string;
    type: string;
    createdAt: string;
    downloadUrl: string | null;
    files: Array<{
        pathname: string;
        downloadUrl: string;
        size: number;
    }>;
}

type Tab = "overview" | "requirements" | "documents" | "gaps" | "exports";

export default function WorkflowDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [citations, setCitations] = useState<Citation[]>([]);
    const [templates, setTemplates] = useState<FormTemplate[]>([]);
    const [fills, setFills] = useState<FormFill[]>([]);
    const [exports, setExports] = useState<ExportRecord[]>([]);
    const [gaps, setGaps] = useState<GapData | null>(null);
    const [tab, setTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState("");
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadKind, setUploadKind] = useState("form");

    const fetchData = useCallback(async () => {
        try {
            const [workflowRes, researchRes, formsRes, gapsRes, exportsRes] =
                await Promise.all([
                    fetch(`/api/workflows/${id}`),
                    fetch(`/api/workflows/${id}/research`),
                    fetch(`/api/workflows/${id}/forms`),
                    fetch(`/api/workflows/${id}/gaps`),
                    fetch(`/api/workflows/${id}/exports`),
                ]);

            const [workflowJson, researchJson, formsJson, gapsJson, exportsJson] =
                await Promise.all([
                    workflowRes.json(),
                    researchRes.json(),
                    formsRes.json(),
                    gapsRes.json(),
                    exportsRes.json(),
                ]);

            if (workflowJson.ok) {
                setWorkflow(workflowJson.data.workflow);
                setTimeline(workflowJson.data.timeline ?? []);
            }
            if (researchJson.ok) {
                setRequirements(researchJson.data.requirements ?? []);
                setCitations(researchJson.data.citations ?? []);
            }
            if (formsJson.ok) {
                setTemplates(formsJson.data.templates ?? []);
                setFills(formsJson.data.fills ?? []);
            }
            if (gapsJson.ok) {
                setGaps(gapsJson.data);
            }
            if (exportsJson.ok) {
                setExports(exportsJson.data.exports ?? []);
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void fetchData();
        const interval = window.setInterval(() => {
            void fetchData();
        }, 5000);

        return () => {
            window.clearInterval(interval);
        };
    }, [fetchData]);

    async function triggerAction(action: string, payload: Record<string, unknown> = {}) {
        setActionLoading(action);

        try {
            const urlMap: Record<string, string> = {
                approve: `/api/workflows/${id}/review/approve`,
                export: `/api/workflows/${id}/exports/build`,
                fill: `/api/workflows/${id}/forms/fill/start`,
                research: `/api/workflows/${id}/research/start`,
            };

            await fetch(urlMap[action], {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            await fetchData();
        } finally {
            setActionLoading("");
        }
    }

    async function handleUpload() {
        if (!uploadFile) return;

        setActionLoading("upload");

        try {
            const formData = new FormData();
            formData.append("file", uploadFile);
            formData.append("kind", uploadKind);

            await fetch(`/api/workflows/${id}/documents/upload`, {
                method: "POST",
                body: formData,
            });

            setUploadFile(null);
            await fetchData();
        } finally {
            setActionLoading("");
        }
    }

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ margin: "0 auto" }} />
                <p style={{ marginTop: 16 }}>Loading workflow...</p>
            </div>
        );
    }

    if (!workflow) {
        return (
            <div className="empty-state">
                <div className="icon">❌</div>
                <p>Workflow not found.</p>
            </div>
        );
    }

    const lowConfidenceFills = fills.filter(
        (fill) => fill.reviewFlag || (fill.confidence < 0.7 && !fill.approvedAt)
    );

    return (
        <main>
            <div className="page-header">
                <h1>
                    {workflow.permitType}{" "}
                    <span className="badge badge-stage">{workflow.status}</span>
                </h1>
                <p>
                    {workflow.jurisdiction} · {workflow.entityType} · Confidence:{" "}
                    {(workflow.confidence * 100).toFixed(0)}%
                </p>
            </div>

            <div className="tabs">
                {(["overview", "requirements", "documents", "gaps", "exports"] as Tab[]).map(
                    (entry) => (
                        <button
                            key={entry}
                            className={`tab ${tab === entry ? "active" : ""}`}
                            onClick={() => setTab(entry)}
                        >
                            {entry.charAt(0).toUpperCase() + entry.slice(1)}
                        </button>
                    )
                )}
            </div>

            {tab === "overview" && (
                <div className="grid grid-2">
                    <div className="card">
                        <h3>Prompt</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                            {workflow.prompt}
                        </p>
                    </div>

                    <div className="card">
                        <h3>Timeline</h3>
                        {timeline.length === 0 ? (
                            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                                No transitions yet
                            </p>
                        ) : (
                            <div className="timeline">
                                {timeline.map((entry, index) => (
                                    <div key={`${entry.toStatus}-${index}`} className="timeline-item">
                                        <div className="stage">{entry.toStatus}</div>
                                        <div className="time">
                                            {new Date(entry.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ gridColumn: "1 / -1" }}>
                        <h3>Actions</h3>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 12,
                                marginTop: 12,
                            }}
                        >
                            <button
                                className="btn btn-primary"
                                onClick={() => triggerAction("research")}
                                disabled={Boolean(actionLoading)}
                            >
                                {actionLoading === "research" ? <span className="spinner" /> : "Research"}
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => triggerAction("fill")}
                                disabled={Boolean(actionLoading)}
                            >
                                {actionLoading === "fill" ? <span className="spinner" /> : "Fill Forms"}
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() =>
                                    triggerAction("approve", {
                                        approver: "owner",
                                        approveLowConfidence: true,
                                    })
                                }
                                disabled={Boolean(actionLoading)}
                            >
                                {actionLoading === "approve" ? (
                                    <span className="spinner" />
                                ) : (
                                    "Approve Review"
                                )}
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => triggerAction("export", { type: "combined-all" })}
                                disabled={Boolean(actionLoading) || !gaps?.canExport}
                            >
                                {actionLoading === "export" ? (
                                    <span className="spinner" />
                                ) : (
                                    "Build Combined Export"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {tab === "requirements" && (
                <div className="section">
                    <div className="section-title">
                        Requirements <span className="count">{requirements.length}</span>
                    </div>
                    {requirements.length === 0 ? (
                        <div className="empty-state">
                            <p>No requirements yet. Start research to discover them.</p>
                        </div>
                    ) : (
                        <div className="grid">
                            {requirements.map((requirement) => (
                                <div key={requirement.id} className="card">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <h3>{requirement.title}</h3>
                                        <span
                                            className={`badge ${
                                                requirement.sourceType === "official"
                                                    ? "badge-official"
                                                    : "badge-advisory"
                                            }`}
                                        >
                                            {requirement.sourceType}
                                        </span>
                                    </div>
                                    <p
                                        style={{
                                            color: "var(--text-secondary)",
                                            fontSize: 13,
                                            margin: "8px 0",
                                        }}
                                    >
                                        {requirement.description}
                                    </p>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 12,
                                            fontSize: 12,
                                            color: "var(--text-muted)",
                                        }}
                                    >
                                        {requirement.required ? <span>Required</span> : <span>Optional</span>}
                                        <span>Confidence: {(requirement.confidence * 100).toFixed(0)}%</span>
                                        <a
                                            href={requirement.sourceUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Source ↗
                                        </a>
                                    </div>
                                    <div style={{ marginTop: 12 }}>
                                        {citations
                                            .filter((citation) => citation.requirementId === requirement.id)
                                            .map((citation) => (
                                                <div key={citation.id} style={{ fontSize: 12, marginTop: 6 }}>
                                                    <span
                                                        className={`badge ${
                                                            citation.isOfficial
                                                                ? "badge-official"
                                                                : "badge-advisory"
                                                        }`}
                                                    >
                                                        {citation.isOfficial ? "official" : "advisory"}
                                                    </span>{" "}
                                                    <a
                                                        href={citation.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {citation.title}
                                                    </a>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === "documents" && (
                <div className="section">
                    <div className="section-title">
                        Documents & Forms <span className="count">{templates.length}</span>
                    </div>

                    <div className="card" style={{ marginBottom: 24 }}>
                        <h3>Upload</h3>
                        <div className="form-group" style={{ marginTop: 16 }}>
                            <label htmlFor="upload-kind">Document Type</label>
                            <select
                                id="upload-kind"
                                className="input"
                                value={uploadKind}
                                onChange={(event) => setUploadKind(event.target.value)}
                            >
                                <option value="form">Form</option>
                                <option value="supporting">Supporting</option>
                                <option value="identification">Identification</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="upload-file">File</label>
                            <input
                                id="upload-file"
                                className="input"
                                type="file"
                                onChange={(event) =>
                                    setUploadFile(event.target.files?.[0] ?? null)
                                }
                            />
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleUpload}
                            disabled={!uploadFile || actionLoading === "upload"}
                        >
                            {actionLoading === "upload" ? <span className="spinner" /> : "Upload"}
                        </button>
                    </div>

                    <div className="grid">
                        {templates.map((template) => (
                            <div key={template.id} className="card">
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <h3>{template.name}</h3>
                                    <span className="badge badge-stage">{template.sourceMode}</span>
                                </div>
                                <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                                    {template.fieldCount} fields · {template.fills.length} mapped values
                                </p>
                                <div style={{ marginTop: 12 }}>
                                    {template.fields.map((field) => {
                                        const fill = template.fills.find(
                                            (entry) => entry.fieldName === field.fieldName
                                        );

                                        return (
                                            <div
                                                key={field.id}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    fontSize: 12,
                                                    marginTop: 6,
                                                }}
                                            >
                                                <span>
                                                    {field.fieldName}
                                                    {field.required ? " *" : ""}
                                                </span>
                                                <span style={{ color: "var(--text-muted)" }}>
                                                    {fill
                                                        ? `${Math.round(fill.confidence * 100)}%`
                                                        : "unmapped"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {lowConfidenceFills.length > 0 && (
                        <div className="section" style={{ marginTop: 24 }}>
                            <div className="section-title">
                                Review Queue <span className="count">{lowConfidenceFills.length}</span>
                            </div>
                            <div className="grid">
                                {lowConfidenceFills.map((fill) => (
                                    <div key={fill.id} className="card">
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                            }}
                                        >
                                            <h3>{fill.fieldName}</h3>
                                            <span className="badge badge-blocking">
                                                {Math.round(fill.confidence * 100)}%
                                            </span>
                                        </div>
                                        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                                            {fill.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === "gaps" && gaps && (
                <div className="section">
                    <div className="section-title">
                        Blocking Issues <span className="count">{gaps.blocking.length}</span>
                    </div>
                    {gaps.blocking.length === 0 ? (
                        <div className="card" style={{ borderColor: "rgba(16,185,129,0.3)" }}>
                            <p style={{ color: "var(--success)" }}>
                                No blocking issues. Review approval can unlock exports.
                            </p>
                        </div>
                    ) : (
                        <div className="grid">
                            {gaps.blocking.map((gap, index) => (
                                <div key={`${gap.category}-${index}`} className="card">
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <span className="badge badge-blocking">blocking</span>
                                        <span className="badge badge-stage">{gap.category}</span>
                                    </div>
                                    <p style={{ marginTop: 8 }}>{gap.message}</p>
                                    <p
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: 12,
                                            marginTop: 4,
                                        }}
                                    >
                                        Action: {gap.requiredAction}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {gaps.nonBlocking.length > 0 && (
                        <>
                            <div className="section-title" style={{ marginTop: 24 }}>
                                Advisories <span className="count">{gaps.nonBlocking.length}</span>
                            </div>
                            <div className="grid">
                                {gaps.nonBlocking.map((gap, index) => (
                                    <div key={`${gap.category}-notice-${index}`} className="card">
                                        <span className="badge badge-advisory">{gap.category}</span>
                                        <p style={{ marginTop: 8 }}>{gap.message}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "exports" && (
                <div className="section">
                    <div className="section-title">Export Center</div>
                    <div className="grid grid-3">
                        {(["combined-all", "separate-files", "unfilled-only"] as const).map(
                            (bundleType) => (
                                <div key={bundleType} className="card">
                                    <h3 style={{ textTransform: "capitalize" }}>
                                        {bundleType.replace(/-/g, " ")}
                                    </h3>
                                    <p
                                        style={{
                                            color: "var(--text-secondary)",
                                            fontSize: 12,
                                            margin: "8px 0 16px",
                                        }}
                                    >
                                        {bundleType === "combined-all"
                                            ? "Includes source docs, generated outputs, manifest, and a zip."
                                            : bundleType === "separate-files"
                                              ? "Exports structured folders plus a bundle zip."
                                              : "Keeps only original unfilled form files and reports."}
                                    </p>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        disabled={!gaps?.canExport || Boolean(actionLoading)}
                                        onClick={() =>
                                            triggerAction("export", { type: bundleType })
                                        }
                                    >
                                        Build Bundle
                                    </button>
                                </div>
                            )
                        )}
                    </div>

                    <div className="section" style={{ marginTop: 24 }}>
                        <div className="section-title">
                            Built Exports <span className="count">{exports.length}</span>
                        </div>
                        {exports.length === 0 ? (
                            <div className="empty-state">
                                <p>No export bundles yet.</p>
                            </div>
                        ) : (
                            <div className="grid">
                                {exports.map((record) => (
                                    <div key={record.id} className="card">
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                            }}
                                        >
                                            <h3>{record.type}</h3>
                                            <span className="badge badge-stage">
                                                {new Date(record.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {record.downloadUrl && (
                                            <a
                                                href={record.downloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Download zip ↗
                                            </a>
                                        )}
                                        <div style={{ marginTop: 12 }}>
                                            {record.files.map((file) => (
                                                <div key={file.pathname} style={{ fontSize: 12, marginTop: 6 }}>
                                                    <a
                                                        href={file.downloadUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {file.pathname}
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
