"use client";

import Link from "next/link";
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
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function loadWorkflows() {
            try {
                const response = await fetch("/api/workflows");
                const json = await response.json();

                if (!cancelled && json.ok) {
                    setWorkflows(json.data.workflows ?? []);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadWorkflows();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <main>
            <div className="page-header">
                <h1>Workflows</h1>
                <p>Track your active permit application workflows.</p>
            </div>

            {loading ? (
                <div className="empty-state">
                    <div className="spinner" style={{ margin: "0 auto" }} />
                    <p style={{ marginTop: 16 }}>Loading workflows...</p>
                </div>
            ) : workflows.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">📋</div>
                    <p>No workflows yet. Start one from the intake page.</p>
                    <Link href="/" className="btn btn-primary" style={{ marginTop: 16 }}>
                        Start New Workflow
                    </Link>
                </div>
            ) : (
                <div className="grid grid-2">
                    {workflows.map((workflow) => (
                        <Link
                            key={workflow.id}
                            href={`/workflows/${workflow.id}`}
                            style={{ textDecoration: "none", color: "inherit" }}
                        >
                            <div className="card">
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <h3>{workflow.permitType}</h3>
                                    <span className="badge badge-stage">{workflow.status}</span>
                                </div>
                                <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                                    {workflow.jurisdiction}
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
                                    {workflow.prompt}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
