"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IntakePage() {
    const [prompt, setPrompt] = useState("");
    const [jurisdiction, setJurisdiction] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (prompt.length < 10) {
            setError("Please describe your business in at least 10 characters.");
            return;
        }
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/intake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    ...(jurisdiction ? { preferredJurisdiction: jurisdiction } : {}),
                }),
            });
            const json = await res.json();
            if (!json.ok) {
                setError(json.error?.message ?? "Something went wrong");
                return;
            }
            router.push(`/workflows/${json.data.workflow.id}`);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main>
            <div className="page-header">
                <h1>Start a Permit Application</h1>
                <p>
                    Describe your business and we&apos;ll research the permits you need,
                    fill out forms, and prepare your submission package.
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card" style={{ maxWidth: 700 }}>
                    <div className="form-group">
                        <label htmlFor="prompt">Business Description</label>
                        <textarea
                            id="prompt"
                            className="textarea"
                            placeholder="e.g., I'm opening a small bakery in downtown Austin, TX. We'll sell bread, pastries, and coffee. It's an LLC with 3 employees..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={5}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="jurisdiction">
                            Preferred Jurisdiction (optional)
                        </label>
                        <input
                            id="jurisdiction"
                            className="input"
                            type="text"
                            placeholder="e.g., Austin, TX or San Francisco, CA"
                            value={jurisdiction}
                            onChange={(e) => setJurisdiction(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: "100%" }}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" /> Analyzing...
                            </>
                        ) : (
                            "🔍 Analyze & Start Workflow"
                        )}
                    </button>
                </div>
            </form>
        </main>
    );
}
