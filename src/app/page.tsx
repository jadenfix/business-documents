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
        <main className="intake-page">
            <section className="intake-hero">
                <div className="card hero-panel motion-enter">
                    <span className="eyebrow">Permit intake workspace</span>
                    <h1 className="intake-title">Start a Permit Application</h1>
                    <p className="intake-summary">
                        Describe your business and we&apos;ll research the permits you
                        need, fill out forms, and prepare a submission-ready package.
                    </p>

                    <div className="hero-feature-grid">
                        <div className="hero-feature">
                            <strong>Research trail</strong>
                            <span>Capture the permits, evidence links, and filing steps.</span>
                        </div>
                        <div className="hero-feature">
                            <strong>Form mapping</strong>
                            <span>Use the intake brief to drive downstream autofill work.</span>
                        </div>
                        <div className="hero-feature">
                            <strong>Submission prep</strong>
                            <span>Package final documents once review is complete.</span>
                        </div>
                    </div>
                </div>

                <aside className="card intake-flow-card motion-enter motion-delay-1">
                    <div className="flow-card-head">
                        <h2>Workflow sequence</h2>
                        <p>
                            The page motion mirrors this order so the next step is always
                            visually obvious.
                        </p>
                    </div>

                    <div className="flow-list">
                        <div className="flow-step flow-step-current">
                            <div className="flow-step-number">01</div>
                            <div className="flow-step-copy">
                                <strong>Describe the business</strong>
                                <span>
                                    Start with what the company does, where it operates, and
                                    any regulated activity.
                                </span>
                            </div>
                        </div>
                        <div className="flow-step">
                            <div className="flow-step-number">02</div>
                            <div className="flow-step-copy">
                                <strong>Narrow the jurisdiction</strong>
                                <span>
                                    Add the city or county if you already know the filing
                                    destination.
                                </span>
                            </div>
                        </div>
                        <div className="flow-step">
                            <div className="flow-step-number">03</div>
                            <div className="flow-step-copy">
                                <strong>Launch the workflow</strong>
                                <span>
                                    We translate the intake into research, forms, review, and
                                    export tasks.
                                </span>
                            </div>
                        </div>
                    </div>
                </aside>
            </section>

            <form onSubmit={handleSubmit} className="motion-enter motion-delay-2">
                <section className="card intake-panel">
                    <div className="intake-panel-head">
                        <div className="intake-panel-copy">
                            <span className="eyebrow">Application brief</span>
                            <h2>Build the intake package</h2>
                            <p>
                                Enter the business description first. If the jurisdiction is
                                already known, include it so the workflow starts with a tighter
                                research scope.
                            </p>
                        </div>

                        <div className="intake-panel-status">
                            <strong>Next output</strong>
                            <span>
                                This brief becomes the first workflow record for research,
                                document mapping, and final export review.
                            </span>
                        </div>
                    </div>

                    <div className="intake-form-grid">
                        <div className="intake-field">
                            <div className="intake-label-row">
                                <label htmlFor="prompt">Business description</label>
                                <span className="field-tag">Required</span>
                            </div>
                            <textarea
                                id="prompt"
                                className="textarea"
                                placeholder="e.g., I'm opening a small bakery in downtown Austin, TX. We'll sell bread, pastries, and coffee. It's an LLC with 3 employees..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                rows={6}
                            />
                            <p className="field-help">
                                Lead with the business type, location, ownership structure,
                                staffing, and anything that could require inspection or
                                licensing.
                            </p>
                        </div>

                        <div className="intake-field">
                            <div className="intake-label-row">
                                <label htmlFor="jurisdiction">
                                    Preferred jurisdiction
                                </label>
                                <span className="field-tag">Optional</span>
                            </div>
                            <input
                                id="jurisdiction"
                                className="input"
                                type="text"
                                placeholder="e.g., Austin, TX or San Francisco, CA"
                                value={jurisdiction}
                                onChange={(e) => setJurisdiction(e.target.value)}
                            />
                            <p className="field-help">
                                Add a city, county, or agency location if you want the first
                                research pass anchored to a known jurisdiction.
                            </p>
                        </div>
                    </div>

                    {error && <div className="notice notice-error field-error">{error}</div>}

                    <div className="form-actions">
                        <p className="form-actions-copy">
                            The interface reads top to bottom: describe the business, narrow
                            the jurisdiction if needed, then launch the workflow.
                        </p>

                        <button
                            type="submit"
                            className="btn btn-primary intake-submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" /> Analyzing workflow...
                                </>
                            ) : (
                                "Analyze and Start Workflow"
                            )}
                        </button>
                    </div>
                </section>
            </form>
        </main>
    );
}
