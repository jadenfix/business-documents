"use client";

import { useEffect, useState, useCallback } from "react";
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
    fee: string | null;
    confidence: number;
}

interface GapData {
    blocking: Array<{ category: string; message: string; requiredAction: string }>;
    nonBlocking: Array<{ category: string; message: string; requiredAction: string }>;
    canExport: boolean;
}

type Tab = "overview" | "requirements" | "documents" | "gaps" | "exports";

export default function WorkflowDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [gaps, setGaps] = useState<GapData | null>(null);
    const [tab, setTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState("");

    const fetchData = useCallback(async () => {
        try {
            const [wfRes, reqRes, gapRes] = await Promise.all([
                fetch(`/api/workflows/${id}`),
                fetch(`/api/workflows/${id}/research`),
                fetch(`/api/workflows/${id}/gaps`),
            ]);
            const [wfJson, reqJson, gapJson] = await Promise.all([
                wfRes.json(),
                reqRes.json(),
                gapRes.json(),
            ]);

            if (wfJson.ok) {
                setWorkflow(wfJson.data.workflow);
                setTimeline(wfJson.data.timeline ?? []);
            }
            if (reqJson.ok) setRequirements(reqJson.data.requirements ?? []);
            if (gapJson.ok) setGaps(gapJson.data);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    async function handleAction(action: string) {
        setActionLoading(action);
        try {
            let url = "";
            let body = {};
            if (action === "research") url = `/api/workflows/${id}/research/start`;
            else if (action === "approve") {
                url = `/api/workflows/${id}/review/approve`;
                body = { approver: "owner", approveLowConfidence: true };
            } else if (action === "export") {
                url = `/api/workflows/${id}/exports/build`;
                body = { type: "combined-all" };
            }

            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
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

            {/* Tabs */}
            <div className="tabs">
                {(["overview", "requirements", "documents", "gaps", "exports"] as Tab[]).map(
                    (t) => (
                        <button
                            key={t}
                            className={`tab ${tab === t ? "active" : ""}`}
                            onClick={() => setTab(t)}
                        >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    )
                )}
            </div>

            {/* Overview Tab */}
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
                                {timeline.map((t, i) => (
                                    <div key={i} className="timeline-item">
                                        <div className="stage">{t.toStatus}</div>
                                        <div className="time">
                                            {new Date(t.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ gridColumn: "1 / -1" }}>
                        <h3>Actions</h3>
                        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleAction("research")}
                                disabled={!!actionLoading}
                            >
                                {actionLoading === "research" ? (
                                    <span className="spinner" />
                                ) : (
                                    "🔬"
                                )}{" "}
                                Start Research
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => handleAction("approve")}
                                disabled={!!actionLoading}
                            >
                                {actionLoading === "approve" ? (
                                    <span className="spinner" />
                                ) : (
                                    "✅"
                                )}{" "}
                                Approve Review
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => handleAction("export")}
                                disabled={!!actionLoading || !gaps?.canExport}
                            >
                                {actionLoading === "export" ? (
                                    <span className="spinner" />
                                ) : (
                                    "📦"
                                )}{" "}
                                Build Export
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Requirements Tab */}
            {tab === "requirements" && (
                <div className="section">
                    <div className="section-title">
                        Requirements{" "}
                        <span className="count">{requirements.length}</span>
                    </div>
                    {requirements.length === 0 ? (
                        <div className="empty-state">
                            <p>No requirements yet. Start research to discover them.</p>
                        </div>
                    ) : (
                        <div className="grid">
                            {requirements.map((req) => (
                                <div key={req.id} className="card">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <h3>{req.title}</h3>
                                        <span
                                            className={`badge ${req.sourceType === "official"
                                                    ? "badge-official"
                                                    : "badge-advisory"
                                                }`}
                                        >
                                            {req.sourceType}
                                        </span>
                                    </div>
                                    <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "8px 0" }}>
                                        {req.description}
                                    </p>
                                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)" }}>
                                        {req.fee && <span>Fee: {req.fee}</span>}
                                        <span>
                                            Confidence: {(req.confidence * 100).toFixed(0)}%
                                        </span>
                                        <a href={req.sourceUrl} target="_blank" rel="noopener noreferrer">
                                            Source ↗
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Documents Tab */}
            {tab === "documents" && (
                <div className="section">
                    <div className="section-title">Documents</div>
                    <div className="upload-zone">
                        <div className="icon">📄</div>
                        <p>
                            Drag &amp; drop files or click to upload permit forms and
                            supporting documents
                        </p>
                    </div>
                </div>
            )}

            {/* Gaps Tab */}
            {tab === "gaps" && gaps && (
                <div className="section">
                    <div className="section-title">
                        Blocking Issues{" "}
                        <span className="count">{gaps.blocking.length}</span>
                    </div>
                    {gaps.blocking.length === 0 ? (
                        <div className="card" style={{ borderColor: "rgba(16,185,129,0.3)" }}>
                            <p style={{ color: "var(--success)" }}>
                                ✅ No blocking issues — ready for review
                            </p>
                        </div>
                    ) : (
                        <div className="grid">
                            {gaps.blocking.map((g, i) => (
                                <div key={i} className="card">
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <span className="badge badge-blocking">blocking</span>
                                        <span className="badge badge-stage">{g.category}</span>
                                    </div>
                                    <p style={{ marginTop: 8 }}>{g.message}</p>
                                    <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                                        Action: {g.requiredAction}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {gaps.nonBlocking.length > 0 && (
                        <>
                            <div className="section-title" style={{ marginTop: 24 }}>
                                Advisories{" "}
                                <span className="count">{gaps.nonBlocking.length}</span>
                            </div>
                            <div className="grid">
                                {gaps.nonBlocking.map((g, i) => (
                                    <div key={i} className="card">
                                        <span className="badge badge-advisory">{g.category}</span>
                                        <p style={{ marginTop: 8 }}>{g.message}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Exports Tab */}
            {tab === "exports" && (
                <div className="section">
                    <div className="section-title">Export Center</div>
                    <div className="grid grid-3">
                        {(["combined-all", "separate-files", "unfilled-only"] as const).map(
                            (type) => (
                                <div key={type} className="card" style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>
                                        {type === "combined-all"
                                            ? "📦"
                                            : type === "separate-files"
                                                ? "📂"
                                                : "📝"}
                                    </div>
                                    <h3 style={{ textTransform: "capitalize" }}>
                                        {type.replace(/-/g, " ")}
                                    </h3>
                                    <p
                                        style={{
                                            color: "var(--text-secondary)",
                                            fontSize: 12,
                                            margin: "8px 0",
                                        }}
                                    >
                                        {type === "combined-all"
                                            ? "All documents in one package"
                                            : type === "separate-files"
                                                ? "Individual files organized by type"
                                                : "Blank forms for manual completion"}
                                    </p>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        disabled={!gaps?.canExport}
                                        onClick={async () => {
                                            await fetch(`/api/workflows/${id}/exports/build`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ type }),
                                            });
                                            fetchData();
                                        }}
                                    >
                                        Build Bundle
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
