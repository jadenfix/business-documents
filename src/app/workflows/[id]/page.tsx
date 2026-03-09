"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
} from "react";
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
    dueDate?: string | null;
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

interface DocumentRecord {
    id: string;
    kind: UploadKind;
    blobPath: string;
    mimeType: string;
    status: string;
    createdAt: string;
    fileName: string;
    downloadUrl: string;
}

interface FormFill {
    id: string;
    templateId: string;
    fieldName: string;
    sourceKey: string;
    value: string;
    confidence: number;
    method: string;
    approvedAt: string | null;
    reviewFlag: boolean;
}

interface FormTemplate {
    id: string;
    documentId: string;
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
type UploadKind = "form" | "supporting" | "identification" | "other";

const UPLOAD_KIND_OPTIONS: Array<{
    value: UploadKind;
    label: string;
    description: string;
}> = [
    { value: "form", label: "Form", description: "Applications, worksheets, and filing packets" },
    { value: "supporting", label: "Supporting", description: "Leases, insurance, registrations, proof" },
    { value: "identification", label: "ID", description: "Owner ID, business license, tax ID scans" },
    { value: "other", label: "Other", description: "Anything that does not fit the buckets above" },
];

function formatLabel(value: string) {
    return value
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatFieldName(value: string) {
    return value.replace(/[_.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getHostname(url: string) {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trimText(value: string, maxLength = 84) {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 1)}…`;
}

function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function inferUploadKind(file: File): UploadKind {
    const name = file.name.toLowerCase();

    if (/(passport|driver|license|identification|id-card|id_)/.test(name)) {
        return "identification";
    }

    if (/(insurance|lease|registration|certificate|ein|tax)/.test(name)) {
        return "supporting";
    }

    if (/(form|application|permit|worksheet)/.test(name) || file.type.includes("pdf")) {
        return "form";
    }

    return "other";
}

function canPreviewPdf(document: DocumentRecord) {
    return (
        document.mimeType.includes("pdf") || document.fileName.toLowerCase().endsWith(".pdf")
    );
}

function canPreviewImage(document: DocumentRecord) {
    return document.mimeType.startsWith("image/");
}

function getRequirementAuditTrail(requirementId: string, citations: Citation[]) {
    return citations
        .filter((citation) => citation.requirementId === requirementId)
        .sort((left, right) => Number(right.isOfficial) - Number(left.isOfficial));
}

function getTemplateMetrics(template: FormTemplate) {
    const mappedCount = template.fields.filter((field) =>
        template.fills.some((fill) => fill.fieldName === field.fieldName)
    ).length;
    const requiredMissingCount = template.fields.filter(
        (field) =>
            field.required &&
            !template.fills.some((fill) => fill.fieldName === field.fieldName)
    ).length;
    const reviewCount = template.fills.filter(
        (fill) => fill.reviewFlag || (fill.confidence < 0.7 && !fill.approvedAt)
    ).length;

    return {
        mappedCount,
        requiredMissingCount,
        reviewCount,
        totalCount: template.fields.length,
        coverage: template.fields.length === 0 ? 0 : mappedCount / template.fields.length,
    };
}

function getFieldState(
    field: FormTemplate["fields"][number],
    fill?: FormFill
): "missing" | "review" | "approved" | "mapped" | "open" {
    if (!fill) {
        return field.required ? "missing" : "open";
    }

    if (fill.reviewFlag || (fill.confidence < 0.7 && !fill.approvedAt)) {
        return "review";
    }

    if (fill.approvedAt) {
        return "approved";
    }

    return "mapped";
}

function getFieldStateLabel(state: ReturnType<typeof getFieldState>) {
    if (state === "missing") return "Needs value";
    if (state === "review") return "Review";
    if (state === "approved") return "Approved";
    if (state === "mapped") return "Mapped";
    return "Open";
}

function sortTemplateFields(template: FormTemplate) {
    return [...template.fields].sort((left, right) => {
        const leftFill = template.fills.find((fill) => fill.fieldName === left.fieldName);
        const rightFill = template.fills.find((fill) => fill.fieldName === right.fieldName);
        const leftState = getFieldState(left, leftFill);
        const rightState = getFieldState(right, rightFill);

        const rank: Record<ReturnType<typeof getFieldState>, number> = {
            missing: 0,
            review: 1,
            open: 2,
            mapped: 3,
            approved: 4,
        };

        if (rank[leftState] !== rank[rightState]) {
            return rank[leftState] - rank[rightState];
        }

        return left.fieldName.localeCompare(right.fieldName);
    });
}

export default function WorkflowDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [citations, setCitations] = useState<Citation[]>([]);
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [templates, setTemplates] = useState<FormTemplate[]>([]);
    const [fills, setFills] = useState<FormFill[]>([]);
    const [exports, setExports] = useState<ExportRecord[]>([]);
    const [gaps, setGaps] = useState<GapData | null>(null);
    const [tab, setTab] = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState("");
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadKind, setUploadKind] = useState<UploadKind>("form");
    const [dragActive, setDragActive] = useState(false);
    const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
    const [uploadFeedback, setUploadFeedback] = useState<{
        tone: "success" | "error";
        message: string;
    } | null>(null);

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
                setDocuments(formsJson.data.documents ?? []);
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

    useEffect(() => {
        if (documents.length === 0) {
            setActiveDocumentId(null);
            return;
        }

        if (activeDocumentId && documents.some((document) => document.id === activeDocumentId)) {
            return;
        }

        setActiveDocumentId(
            documents.find((document) => document.status === "processed")?.id ?? documents[0].id
        );
    }, [activeDocumentId, documents]);

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

    function queueFiles(nextFiles: File[]) {
        if (nextFiles.length === 0) {
            return;
        }

        setUploadFeedback(null);
        setUploadFiles((current) => {
            const existing = new Set(current.map((file) => fileKey(file)));
            const queued = [...current];

            for (const file of nextFiles) {
                const key = fileKey(file);
                if (!existing.has(key)) {
                    queued.push(file);
                    existing.add(key);
                }
            }

            return queued;
        });

        if (uploadFiles.length === 0 && nextFiles.length === 1) {
            setUploadKind(inferUploadKind(nextFiles[0]));
        }
    }

    function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
        queueFiles(Array.from(event.target.files ?? []));
    }

    function handleDragEnter(event: DragEvent<HTMLButtonElement>) {
        event.preventDefault();
        setDragActive(true);
    }

    function handleDragOver(event: DragEvent<HTMLButtonElement>) {
        event.preventDefault();
        setDragActive(true);
    }

    function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
        event.preventDefault();
        setDragActive(false);
    }

    function handleDrop(event: DragEvent<HTMLButtonElement>) {
        event.preventDefault();
        setDragActive(false);
        queueFiles(Array.from(event.dataTransfer.files ?? []));
    }

    function removeQueuedFile(target: File) {
        setUploadFiles((current) =>
            current.filter((file) => fileKey(file) !== fileKey(target))
        );
    }

    async function handleUpload() {
        if (uploadFiles.length === 0) {
            return;
        }

        setActionLoading("upload");
        setUploadFeedback(null);

        const failedKeys = new Set<string>();
        const failedNames: string[] = [];
        let uploadedCount = 0;

        try {
            for (const file of uploadFiles) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("kind", uploadKind);

                try {
                    const response = await fetch(`/api/workflows/${id}/documents/upload`, {
                        method: "POST",
                        body: formData,
                    });
                    const json = await response.json();

                    if (!response.ok || !json.ok) {
                        throw new Error(json.error?.message ?? "Upload failed");
                    }

                    uploadedCount += 1;
                } catch {
                    failedKeys.add(fileKey(file));
                    failedNames.push(file.name);
                }
            }

            setUploadFiles((current) =>
                current.filter((file) => failedKeys.has(fileKey(file)))
            );

            if (failedNames.length === 0) {
                setUploadFeedback({
                    tone: "success",
                    message: `Uploaded ${uploadedCount} ${uploadedCount === 1 ? "file" : "files"}.`,
                });
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            } else {
                setUploadFeedback({
                    tone: "error",
                    message:
                        uploadedCount > 0
                            ? `Uploaded ${uploadedCount} files. Retry: ${failedNames.join(", ")}.`
                            : `Upload failed for ${failedNames.join(", ")}.`,
                });
            }

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
    const officialRequirements = requirements.filter(
        (requirement) => requirement.sourceType === "official"
    ).length;
    const advisoryRequirements = requirements.length - officialRequirements;
    const evidenceLinks = new Set(citations.map((citation) => citation.url)).size;
    const processedDocuments = documents.filter((document) => document.status === "processed").length;
    const mappedCoverage =
        templates.length === 0
            ? 0
            : Math.round(
                  (templates.reduce(
                      (sum, template) => sum + getTemplateMetrics(template).coverage,
                      0
                  ) /
                      templates.length) *
                      100
              );
    const documentsById = new Map(documents.map((document) => [document.id, document]));
    const templatesById = new Map(templates.map((template) => [template.id, template]));
    const activeDocumentIndex = documents.findIndex((document) => document.id === activeDocumentId);
    const activeDocument =
        activeDocumentIndex >= 0 ? documents[activeDocumentIndex] : documents[0] ?? null;

    function moveDocumentPreview(direction: -1 | 1) {
        if (!activeDocument) {
            return;
        }

        const nextIndex = activeDocumentIndex + direction;
        if (nextIndex < 0 || nextIndex >= documents.length) {
            return;
        }

        setActiveDocumentId(documents[nextIndex].id);
    }

    return (
        <main>
            <div className="page-header">
                <h1>
                    {workflow.permitType}{" "}
                    <span className="badge badge-stage">{formatLabel(workflow.status)}</span>
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
                            {formatLabel(entry)}
                        </button>
                    )
                )}
            </div>

            {tab === "overview" && (
                <div className="grid grid-2">
                    <div className="card">
                        <h3>Prompt</h3>
                        <p className="card-copy">{workflow.prompt}</p>
                    </div>

                    <div className="card">
                        <h3>Timeline</h3>
                        {timeline.length === 0 ? (
                            <p className="muted-copy">No transitions yet</p>
                        ) : (
                            <div className="timeline">
                                {timeline.map((entry, index) => (
                                    <div key={`${entry.toStatus}-${index}`} className="timeline-item">
                                        <div className="stage">{formatLabel(entry.toStatus)}</div>
                                        <div className="time">{formatDateTime(entry.createdAt)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ gridColumn: "1 / -1" }}>
                        <h3>Actions</h3>
                        <div className="action-row">
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
                        Research Trail <span className="count">{requirements.length}</span>
                    </div>

                    {requirements.length === 0 ? (
                        <div className="empty-state">
                            <p>No requirements yet. Start research to discover them.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-3" style={{ marginBottom: 24 }}>
                                <div className="card metric-card">
                                    <span className="metric-label">Official requirements</span>
                                    <strong className="metric-value">{officialRequirements}</strong>
                                    <span className="metric-caption">Blocking items should come from official sources.</span>
                                </div>
                                <div className="card metric-card">
                                    <span className="metric-label">Supporting advisories</span>
                                    <strong className="metric-value">{advisoryRequirements}</strong>
                                    <span className="metric-caption">Useful context, but not treated as filing authority.</span>
                                </div>
                                <div className="card metric-card">
                                    <span className="metric-label">Saved evidence links</span>
                                    <strong className="metric-value">{evidenceLinks}</strong>
                                    <span className="metric-caption">Each requirement stores its own citation trail.</span>
                                </div>
                            </div>

                            <div className="grid">
                                {requirements.map((requirement) => {
                                    const auditTrail = getRequirementAuditTrail(
                                        requirement.id,
                                        citations
                                    );
                                    const fallbackAuditTrail =
                                        auditTrail.length > 0
                                            ? auditTrail
                                            : [
                                                  {
                                                      id: `fallback-${requirement.id}`,
                                                      requirementId: requirement.id,
                                                      url: requirement.sourceUrl,
                                                      title: requirement.sourceUrl,
                                                      snippet: null,
                                                      isOfficial:
                                                          requirement.sourceType === "official",
                                                  },
                                              ];

                                    return (
                                        <article key={requirement.id} className="card requirement-card">
                                            <div className="requirement-header">
                                                <div>
                                                    <h3>{requirement.title}</h3>
                                                    <p className="card-copy">{requirement.description}</p>
                                                </div>
                                                <div className="badge-row">
                                                    <span
                                                        className={`badge ${
                                                            requirement.sourceType === "official"
                                                                ? "badge-official"
                                                                : "badge-advisory"
                                                        }`}
                                                    >
                                                        {requirement.sourceType}
                                                    </span>
                                                    <span className="badge badge-stage">
                                                        {(requirement.confidence * 100).toFixed(0)}% confidence
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="fact-row">
                                                <span>{requirement.required ? "Required" : "Optional"}</span>
                                                {requirement.fee ? <span>Fee: {requirement.fee}</span> : null}
                                                {requirement.dueDate ? (
                                                    <span>Due: {requirement.dueDate}</span>
                                                ) : null}
                                                <span>{fallbackAuditTrail.length} linked sources</span>
                                            </div>

                                            <div className="audit-list">
                                                {fallbackAuditTrail.map((citation, index) => (
                                                    <a
                                                        key={citation.id}
                                                        className="audit-item"
                                                        href={citation.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <div className="audit-item-top">
                                                            <span
                                                                className={`badge ${
                                                                    citation.isOfficial
                                                                        ? "badge-official"
                                                                        : "badge-advisory"
                                                                }`}
                                                            >
                                                                {index === 0 ? "primary" : "supporting"}
                                                            </span>
                                                            <span className="audit-domain">
                                                                {getHostname(citation.url)}
                                                            </span>
                                                        </div>
                                                        <div className="audit-title">
                                                            {citation.title}
                                                        </div>
                                                        {citation.snippet ? (
                                                            <p className="audit-snippet">
                                                                {citation.snippet}
                                                            </p>
                                                        ) : (
                                                            <p className="audit-snippet">
                                                                Open the saved source record.
                                                            </p>
                                                        )}
                                                    </a>
                                                ))}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "documents" && (
                <div className="section">
                    <div className="section-title">
                        Documents & Mapping <span className="count">{documents.length}</span>
                    </div>

                    <div className="grid grid-2" style={{ marginBottom: 24 }}>
                        <div className="card upload-card">
                            <div className="upload-header">
                                <div>
                                    <h3>Upload Center</h3>
                                    <p className="card-copy">
                                        Drag files in, queue several at once, then upload them under the right document bucket.
                                    </p>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    id="upload-file"
                                    type="file"
                                    className="sr-only"
                                    multiple
                                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                    onChange={handleFileSelection}
                                />
                            </div>

                            <div className="kind-grid">
                                {UPLOAD_KIND_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`kind-chip ${
                                            uploadKind === option.value ? "active" : ""
                                        }`}
                                        onClick={() => setUploadKind(option.value)}
                                    >
                                        <span className="kind-label">{option.label}</span>
                                        <span className="kind-description">
                                            {option.description}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                className={`upload-zone ${dragActive ? "active" : ""}`}
                                onClick={() => fileInputRef.current?.click()}
                                onDragEnter={handleDragEnter}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <div className="icon">+</div>
                                <strong>Drop files here or browse</strong>
                                <p>PDFs work best. The queue accepts multiple files per upload pass.</p>
                            </button>

                            {uploadFeedback ? (
                                <div className={`notice notice-${uploadFeedback.tone}`}>
                                    {uploadFeedback.message}
                                </div>
                            ) : null}

                            {uploadFiles.length > 0 ? (
                                <div className="upload-queue">
                                    {uploadFiles.map((file) => (
                                        <div key={fileKey(file)} className="upload-queue-item">
                                            <div>
                                                <div className="upload-file-name">{file.name}</div>
                                                <div className="upload-file-meta">
                                                    {formatBytes(file.size)} · Suggested {formatLabel(
                                                        inferUploadKind(file)
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => removeQueuedFile(file)}
                                                disabled={actionLoading === "upload"}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="helper-copy">
                                    No files queued. Drop several forms or supporting docs here and upload them in one pass.
                                </p>
                            )}

                            <div className="action-row">
                                <button
                                    className="btn btn-primary"
                                    onClick={handleUpload}
                                    disabled={uploadFiles.length === 0 || actionLoading === "upload"}
                                >
                                    {actionLoading === "upload" ? (
                                        <span className="spinner" />
                                    ) : (
                                        `Upload ${uploadFiles.length > 0 ? uploadFiles.length : ""} ${
                                            uploadFiles.length === 1 ? "File" : "Files"
                                        }`.trim()
                                    )}
                                </button>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => setUploadFiles([])}
                                    disabled={uploadFiles.length === 0 || actionLoading === "upload"}
                                >
                                    Clear Queue
                                </button>
                            </div>
                        </div>

                        <div className="card phase-summary-card">
                            <h3>Phase 2 Snapshot</h3>
                            <div className="summary-metrics">
                                <div className="summary-metric">
                                    <span className="metric-label">Processed docs</span>
                                    <strong className="metric-value">
                                        {processedDocuments}/{documents.length || 0}
                                    </strong>
                                </div>
                                <div className="summary-metric">
                                    <span className="metric-label">Templates extracted</span>
                                    <strong className="metric-value">{templates.length}</strong>
                                </div>
                                <div className="summary-metric">
                                    <span className="metric-label">Average mapping</span>
                                    <strong className="metric-value">{mappedCoverage}%</strong>
                                </div>
                                <div className="summary-metric">
                                    <span className="metric-label">Needs review</span>
                                    <strong className="metric-value">{lowConfidenceFills.length}</strong>
                                </div>
                            </div>
                            <p className="card-copy">
                                Fillable PDFs create direct field maps. Scanned files stay visible in the review queue so you can see what still needs attention.
                            </p>
                        </div>
                    </div>

                    <div className="section" style={{ marginTop: 24 }}>
                        <div className="section-title">
                            Document Viewer <span className="count">{documents.length}</span>
                        </div>

                        {documents.length === 0 ? (
                            <div className="empty-state">
                                <p>No documents uploaded yet.</p>
                            </div>
                        ) : (
                            <div className="document-browser">
                                <div className="document-rail">
                                    {documents.map((document) => {
                                        const linkedTemplate = templates.find(
                                            (template) => template.documentId === document.id
                                        );

                                        return (
                                            <button
                                                key={document.id}
                                                type="button"
                                                className={`document-nav-card ${
                                                    activeDocument?.id === document.id ? "active" : ""
                                                }`}
                                                onClick={() => setActiveDocumentId(document.id)}
                                            >
                                                <div className="document-card-top">
                                                    <div>
                                                        <div className="document-nav-title">
                                                            {document.fileName}
                                                        </div>
                                                        <div className="upload-file-meta">
                                                            {formatLabel(document.kind)} ·{" "}
                                                            {formatLabel(document.status)}
                                                        </div>
                                                    </div>
                                                    <span className="badge badge-stage">
                                                        {canPreviewPdf(document)
                                                            ? "PDF"
                                                            : canPreviewImage(document)
                                                              ? "Image"
                                                              : "File"}
                                                    </span>
                                                </div>

                                                <div className="fact-row">
                                                    <span>{formatDateTime(document.createdAt)}</span>
                                                    <span>
                                                        {linkedTemplate
                                                            ? `${linkedTemplate.fieldCount} fields`
                                                            : "No map yet"}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {activeDocument ? (
                                    <div className="card document-preview-card">
                                        <div className="preview-toolbar">
                                            <div>
                                                <h3>{activeDocument.fileName}</h3>
                                                <p className="muted-copy">
                                                    {formatLabel(activeDocument.kind)} ·{" "}
                                                    {activeDocument.mimeType}
                                                </p>
                                            </div>
                                            <div className="preview-actions">
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => moveDocumentPreview(-1)}
                                                    disabled={activeDocumentIndex <= 0}
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => moveDocumentPreview(1)}
                                                    disabled={
                                                        activeDocumentIndex < 0 ||
                                                        activeDocumentIndex >= documents.length - 1
                                                    }
                                                >
                                                    Next
                                                </button>
                                                <a
                                                    className="btn btn-primary btn-sm"
                                                    href={activeDocument.downloadUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Open File
                                                </a>
                                            </div>
                                        </div>

                                        <div className="fact-row" style={{ marginBottom: 16 }}>
                                            <span>
                                                Added {formatDateTime(activeDocument.createdAt)}
                                            </span>
                                            <span>{formatLabel(activeDocument.status)}</span>
                                        </div>

                                        <div className="document-preview-stage">
                                            {canPreviewPdf(activeDocument) ? (
                                                <iframe
                                                    key={activeDocument.id}
                                                    title={activeDocument.fileName}
                                                    src={activeDocument.downloadUrl}
                                                    className="document-frame"
                                                />
                                            ) : canPreviewImage(activeDocument) ? (
                                                <img
                                                    key={activeDocument.id}
                                                    src={activeDocument.downloadUrl}
                                                    alt={activeDocument.fileName}
                                                    className="document-image"
                                                />
                                            ) : (
                                                <div className="preview-empty">
                                                    <p>
                                                        Inline preview is not available for this file type.
                                                    </p>
                                                    <a
                                                        href={activeDocument.downloadUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        Open the file in a new tab ↗
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className="section" style={{ marginTop: 24 }}>
                        <div className="section-title">
                            Field Mapping <span className="count">{templates.length}</span>
                        </div>

                        {templates.length === 0 ? (
                            <div className="empty-state">
                                <p>No templates yet. Upload a form PDF to start mapping.</p>
                            </div>
                        ) : (
                            <div className="grid">
                                {templates.map((template) => {
                                    const metrics = getTemplateMetrics(template);
                                    const sourceDocument = documentsById.get(template.documentId);

                                    return (
                                        <div key={template.id} className="card mapping-card">
                                            <div className="mapping-card-top">
                                                <div>
                                                    <h3>{template.name}</h3>
                                                    <p className="card-copy">
                                                        {sourceDocument?.fileName ?? template.name} ·{" "}
                                                        {formatLabel(template.sourceMode)}
                                                    </p>
                                                </div>
                                                <span className="badge badge-stage">
                                                    {metrics.mappedCount}/{metrics.totalCount} mapped
                                                </span>
                                            </div>

                                            <div className="progress-meta">
                                                <span>Coverage</span>
                                                <strong>{Math.round(metrics.coverage * 100)}%</strong>
                                            </div>
                                            <div className="progress-track">
                                                <div
                                                    className="progress-fill"
                                                    style={{
                                                        width: `${Math.max(
                                                            6,
                                                            Math.round(metrics.coverage * 100)
                                                        )}%`,
                                                    }}
                                                />
                                            </div>

                                            <div className="summary-metrics compact">
                                                <div className="summary-metric">
                                                    <span className="metric-label">Required missing</span>
                                                    <strong className="metric-value">
                                                        {metrics.requiredMissingCount}
                                                    </strong>
                                                </div>
                                                <div className="summary-metric">
                                                    <span className="metric-label">Review items</span>
                                                    <strong className="metric-value">
                                                        {metrics.reviewCount}
                                                    </strong>
                                                </div>
                                                <div className="summary-metric">
                                                    <span className="metric-label">Mode</span>
                                                    <strong className="metric-value">
                                                        {formatLabel(template.sourceMode)}
                                                    </strong>
                                                </div>
                                            </div>

                                            <div className="field-list">
                                                {sortTemplateFields(template).map((field) => {
                                                    const fill = template.fills.find(
                                                        (entry) => entry.fieldName === field.fieldName
                                                    );
                                                    const state = getFieldState(field, fill);

                                                    return (
                                                        <div
                                                            key={field.id}
                                                            className={`field-row field-row-${state}`}
                                                        >
                                                            <div>
                                                                <div className="field-title">
                                                                    {formatFieldName(field.fieldName)}
                                                                    {field.required ? (
                                                                        <span className="field-required">
                                                                            required
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                <div className="field-caption">
                                                                    {fill ? (
                                                                        <>
                                                                            {trimText(fill.value)} · from{" "}
                                                                            {formatFieldName(fill.sourceKey)}
                                                                        </>
                                                                    ) : field.required ? (
                                                                        "No mapped value yet."
                                                                    ) : (
                                                                        "Optional field still open."
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="field-meta">
                                                                <span className={`state-chip state-chip-${state}`}>
                                                                    {getFieldStateLabel(state)}
                                                                </span>
                                                                {fill ? (
                                                                    <span className="confidence-chip">
                                                                        {Math.round(fill.confidence * 100)}%
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {lowConfidenceFills.length > 0 && (
                        <div className="section" style={{ marginTop: 24 }}>
                            <div className="section-title">
                                Review Queue <span className="count">{lowConfidenceFills.length}</span>
                            </div>
                            <div className="grid grid-2">
                                {lowConfidenceFills.map((fill) => (
                                    <div key={fill.id} className="card review-card">
                                        <div className="document-card-top">
                                            <div>
                                                <h3>{formatFieldName(fill.fieldName)}</h3>
                                                <p className="muted-copy">
                                                    {templatesById.get(fill.templateId)?.name ?? "Mapped field"}
                                                </p>
                                            </div>
                                            <span className="badge badge-blocking">
                                                {Math.round(fill.confidence * 100)}%
                                            </span>
                                        </div>
                                        <p className="card-copy">{fill.value}</p>
                                        <div className="fact-row">
                                            <span>Source: {formatFieldName(fill.sourceKey)}</span>
                                            <span>{formatLabel(fill.method)}</span>
                                        </div>
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
                                        <span className="badge badge-stage">{formatLabel(gap.category)}</span>
                                    </div>
                                    <p style={{ marginTop: 8 }}>{gap.message}</p>
                                    <p className="helper-copy">Action: {gap.requiredAction}</p>
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
                                        <span className="badge badge-advisory">
                                            {formatLabel(gap.category)}
                                        </span>
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
                                    <h3>{formatLabel(bundleType)}</h3>
                                    <p className="card-copy" style={{ marginBottom: 16 }}>
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
                                        <div className="document-card-top">
                                            <h3>{formatLabel(record.type)}</h3>
                                            <span className="badge badge-stage">
                                                {new Date(record.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {record.downloadUrl ? (
                                            <a
                                                href={record.downloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Download zip ↗
                                            </a>
                                        ) : null}
                                        <div style={{ marginTop: 12 }}>
                                            {record.files.map((file) => (
                                                <div key={file.pathname} className="export-file">
                                                    <a
                                                        href={file.downloadUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {file.pathname}
                                                    </a>
                                                    <span>{formatBytes(file.size)}</span>
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
