"use client";

import { useEffect, useState } from "react";

interface Workflow {
    id: string;
    prompt: string;
    permitType: string;
    jurisdiction: string;
    status: string;
    createdAt: string;
}

export default function WorkflowsPage() {
    const [workflows] = useState<Workflow[]>([]);

    return (
        <main>
            <div className="page-header">
                <h1>Workflows</h1>
                <p>Track your active permit application workflows.</p>
            </div>

            {workflows.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">📋</div>
                    <p>No workflows yet. Start one from the intake page.</p>
                    <a href="/" className="btn btn-primary" style={{ marginTop: 16 }}>
                        Start New Workflow
                    </a>
                </div>
            ) : (
                <div className="grid grid-2">
                    {workflows.map((wf) => (
                        <a
                            key={wf.id}
                            href={`/workflows/${wf.id}`}
                            style={{ textDecoration: "none", color: "inherit" }}
                        >
                            <div className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <h3>{wf.permitType}</h3>
                                    <span className="badge badge-stage">{wf.status}</span>
                                </div>
                                <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                                    {wf.jurisdiction}
                                </p>
                                <p
                                    style={{
                                        color: "var(--text-muted)",
                                        fontSize: 12,
                                        marginTop: 8,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {wf.prompt}
                                </p>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </main>
    );
}
