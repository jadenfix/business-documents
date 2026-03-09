import { createHash } from "node:crypto";
import path from "node:path";
import { AppError } from "@/lib/api-utils";
import { readBlob, uploadBlob } from "@/lib/blob";
import * as repo from "@/lib/db/repositories";
import {
    buildScannedFallbackFields,
    extractFormFields,
    fillPdf,
    flagLowConfidence,
    mapFieldsDeterministic,
    mapFieldsVisionAssisted,
    type ExtractedField,
    type FieldMapping,
} from "@/lib/forms";
import { analyzeGaps } from "@/lib/gaps";
import { runResearch } from "@/lib/research";

function sanitizePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function extractFirstMatch(prompt: string, pattern: RegExp) {
    return prompt.match(pattern)?.[1]?.trim();
}

function inferBusinessName(prompt: string) {
    const match = prompt.match(
        /\b([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*)*\s+(?:LLC|Inc|Corp|Corporation|Ltd|Co\.?))\b/
    );
    if (match?.[1]) return match[1].trim();

    return (
        extractFirstMatch(prompt, /(?:called|named)\s+["']?([^"'.\n]+)["']?/i) ??
        "Applicant Business"
    );
}

function deriveWorkflowSourceData(workflow: {
    prompt: string;
    jurisdiction: string;
    entityType: string;
}) {
    const prompt = workflow.prompt;
    const email = prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
    const phone =
        prompt.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/)?.[0] ?? "";
    const zip = prompt.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? "";
    const address =
        extractFirstMatch(
            prompt,
            /(\d{1,6}\s+[A-Za-z0-9.\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr))/i
        ) ?? "";

    const [city = "", state = ""] = workflow.jurisdiction.split(",").map((part) => part.trim());
    const businessName = inferBusinessName(prompt);

    return {
        address,
        applicantName: extractFirstMatch(prompt, /owner\s+([A-Z][A-Za-z\s'-]+)/i) ?? businessName,
        businessName,
        city,
        date: new Date().toISOString().slice(0, 10),
        email,
        entityType: workflow.entityType,
        phone,
        signature: `${businessName} Representative`,
        state,
        taxId: prompt.match(/\b\d{2}-\d{7}\b/)?.[0] ?? "",
        zip,
    };
}

function dedupeMappings(mappings: FieldMapping[]) {
    const byField = new Map<string, FieldMapping>();

    for (const mapping of mappings) {
        const existing = byField.get(mapping.fieldName);
        if (!existing || mapping.confidence > existing.confidence) {
            byField.set(mapping.fieldName, mapping);
        }
    }

    return [...byField.values()];
}

async function buildTemplateMappings(
    template: { id: string; name: string; sourceMode: string },
    fields: ExtractedField[],
    sourceData: Record<string, string>,
    context: string
) {
    const deterministic = mapFieldsDeterministic(fields, sourceData);
    const mappedNames = new Set(deterministic.map((mapping) => mapping.fieldName));
    const unmapped = fields.filter((field) => !mappedNames.has(field.fieldName));
    const assisted = await mapFieldsVisionAssisted(unmapped, sourceData, context);

    let combined = dedupeMappings([...deterministic, ...assisted]);

    if (template.sourceMode === "scanned") {
        combined = combined.map((mapping) => ({
            ...mapping,
            confidence: Number(Math.min(mapping.confidence, 0.58).toFixed(2)),
            method: "vision-assisted",
        }));
    }

    return combined;
}

export async function recomputeWorkflowGaps(workflowId: string) {
    const [requirements, documents, templatesWithFields, fills] = await Promise.all([
        repo.getRequirements(workflowId),
        repo.getDocuments(workflowId),
        repo.getFormTemplatesWithFields(workflowId),
        repo.getFormFills(workflowId),
    ]);

    const gaps = analyzeGaps({
        requirements: requirements.map((requirement) => ({
            id: requirement.id,
            title: requirement.title,
            required: requirement.required,
            sourceType: requirement.sourceType,
        })),
        documents: documents.map((document) => ({
            id: document.id,
            kind: document.kind,
            status: document.status,
        })),
        formFields: templatesWithFields.flatMap(({ template, fields }) =>
            fields.map((field) => ({
                templateId: template.id,
                fieldName: field.fieldName,
                required: field.required,
            }))
        ),
        formFills: fills.map((fill) => ({
            id: fill.id,
            templateId: fill.templateId,
            fieldName: fill.fieldName,
            confidence: fill.confidence,
            approvedAt: fill.approvedAt,
        })),
    });

    await repo.replaceGaps(workflowId, gaps);
    await repo.updateWorkflowStatus(workflowId, "gaps.generated");

    return gaps;
}

export async function handleWorkflowCreated(workflowId: string) {
    await repo.updateWorkflowStatus(workflowId, "classification.completed");
    return repo.getWorkflow(workflowId);
}

export async function runWorkflowResearch(workflowId: string) {
    const workflow = await repo.getWorkflow(workflowId);
    if (!workflow) {
        throw new AppError("not_found", "Workflow not found", 404);
    }

    await repo.updateWorkflowStatus(workflowId, "research.started");

    const result = await runResearch(
        workflow.jurisdiction,
        workflow.permitType,
        workflow.entityType
    );

    await repo.clearRequirements(workflowId);
    const savedRequirements = await repo.addRequirements(workflowId, result.requirements);

    const citations = savedRequirements.flatMap((requirement) =>
        result.citations
            .filter(
                (citation) =>
                    citation.url === requirement.sourceUrl ||
                    citation.url === result.requirements.find((item) => item.title === requirement.title)?.sourceUrl
            )
            .map((citation) => ({
                requirementId: requirement.id,
                url: citation.url,
                title: citation.title,
                snippet: citation.snippet,
                isOfficial: citation.isOfficial,
            }))
    );

    await repo.addCitations(citations);
    await repo.updateWorkflowStatus(workflowId, "research.completed");

    const gaps = await recomputeWorkflowGaps(workflowId);

    return {
        requirements: savedRequirements,
        gaps,
    };
}

export async function processWorkflowDocumentUpload(input: {
    workflowId: string;
    fileName: string;
    mimeType: string;
    kind: string;
    buffer: Buffer;
}) {
    const workflow = await repo.getWorkflow(input.workflowId);
    if (!workflow) {
        throw new AppError("not_found", "Workflow not found", 404);
    }

    const safeFileName = sanitizePathSegment(path.basename(input.fileName));
    const blob = await uploadBlob(
        `workflows/${input.workflowId}/uploads/${safeFileName}`,
        input.buffer,
        input.mimeType || "application/octet-stream"
    );

    const document = await repo.addDocument({
        workflowId: input.workflowId,
        kind: input.kind,
        blobPath: blob.pathname,
        mimeType: input.mimeType || "application/octet-stream",
        checksum: createHash("sha256").update(input.buffer).digest("hex"),
    });

    try {
        let template: Awaited<ReturnType<typeof repo.addFormTemplate>> | null = null;

        if (input.mimeType.includes("pdf") || input.kind === "form") {
            const extracted = await extractFormFields(input.buffer);
            const fields = extracted.isFillable ? extracted.fields : buildScannedFallbackFields();

            if (fields.length > 0) {
                template = await repo.addFormTemplate({
                    workflowId: input.workflowId,
                    documentId: document.id,
                    name: safeFileName,
                    sourceMode: extracted.isFillable ? "fillable" : "scanned",
                    fieldCount: fields.length,
                });

                await repo.addFormFields(
                    template.id,
                    fields.map((field) => ({
                        fieldName: field.fieldName,
                        fieldType: field.fieldType,
                        required: field.required,
                    }))
                );
            }
        }

        await repo.updateDocumentStatus(document.id, "processed");
        const gaps = await recomputeWorkflowGaps(input.workflowId);

        return {
            document: {
                ...document,
                status: "processed" as const,
            },
            template,
            gaps,
        };
    } catch (error) {
        await repo.updateDocumentStatus(document.id, "failed");
        throw error;
    }
}

export async function runWorkflowFormsFill(workflowId: string) {
    const workflow = await repo.getWorkflow(workflowId);
    if (!workflow) {
        throw new AppError("not_found", "Workflow not found", 404);
    }

    const templatesWithFields = await repo.getFormTemplatesWithFields(workflowId);
    if (templatesWithFields.length === 0) {
        throw new AppError("processing", "No form templates available to fill", 422);
    }

    const sourceData = deriveWorkflowSourceData(workflow);
    await repo.clearFormFills(workflowId);

    const persistedFills = [];

    for (const { template, fields } of templatesWithFields) {
        if (fields.length === 0) continue;

        const mappings = await buildTemplateMappings(
            template,
            fields,
            sourceData,
            `${workflow.prompt}\nTemplate: ${template.name}\nMode: ${template.sourceMode}`
        );

        const lowConfidenceFields = new Set(
            flagLowConfidence(mappings).map((mapping) => mapping.fieldName)
        );

        const saved = await repo.addFormFills(
            mappings.map((mapping) => ({
                workflowId,
                templateId: template.id,
                fieldName: mapping.fieldName,
                sourceKey: mapping.sourceKey,
                value: mapping.value,
                confidence: mapping.confidence,
                method: mapping.method,
                reviewFlag: lowConfidenceFields.has(mapping.fieldName),
            }))
        );

        persistedFills.push(...saved);
    }

    await repo.updateWorkflowStatus(workflowId, "forms.fill.completed");
    const gaps = await recomputeWorkflowGaps(workflowId);

    return {
        fills: persistedFills,
        gaps,
    };
}

export async function buildFilledArtifactsForWorkflow(workflowId: string) {
    const [templates, fills, documents] = await Promise.all([
        repo.getFormTemplates(workflowId),
        repo.getFormFills(workflowId),
        repo.getDocuments(workflowId),
    ]);

    const artifacts: Array<{
        name: string;
        data: Buffer;
        mimeType: string;
        templateId: string;
        sourceMode: string;
    }> = [];

    for (const template of templates) {
        const document = documents.find((candidate) => candidate.id === template.documentId);
        if (!document) continue;

        const templateFills = fills.filter((fill) => fill.templateId === template.id);
        if (templateFills.length === 0) continue;

        if (template.sourceMode === "fillable" && document.mimeType.includes("pdf")) {
            const sourceBlob = await readBlob(document.blobPath);
            const filledPdf = await fillPdf(
                sourceBlob.data,
                templateFills.map((fill) => ({
                    fieldName: fill.fieldName,
                    sourceKey: fill.sourceKey,
                    value: fill.value,
                    confidence: fill.confidence,
                    method:
                        fill.method === "manual" ? "manual" : fill.method === "deterministic" ? "deterministic" : "vision-assisted",
                }))
            );

            artifacts.push({
                name: template.name.replace(/\.pdf$/i, "") + "-filled.pdf",
                data: filledPdf,
                mimeType: "application/pdf",
                templateId: template.id,
                sourceMode: template.sourceMode,
            });
            continue;
        }

        artifacts.push({
            name: template.name.replace(/\.pdf$/i, "") + "-review.json",
            data: Buffer.from(
                JSON.stringify(
                    {
                        templateId: template.id,
                        templateName: template.name,
                        fills: templateFills.map((fill) => ({
                            fieldName: fill.fieldName,
                            value: fill.value,
                            confidence: fill.confidence,
                            method: fill.method,
                            approvedAt: fill.approvedAt,
                        })),
                    },
                    null,
                    2
                )
            ),
            mimeType: "application/json",
            templateId: template.id,
            sourceMode: template.sourceMode,
        });
    }

    return artifacts;
}
