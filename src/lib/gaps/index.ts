import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/forms";

export interface GapInput {
    requirements: Array<{
        id: string;
        title: string;
        required: boolean;
        sourceType: string;
    }>;
    documents: Array<{ id: string; kind: string; status: string }>;
    formFields: Array<{
        templateId: string;
        fieldName: string;
        required: boolean;
    }>;
    formFills: Array<{
        id: string;
        templateId: string;
        fieldName: string;
        confidence: number;
        approvedAt: string | null;
    }>;
}

export interface Gap {
    category: "requirement" | "document" | "field" | "review";
    message: string;
    requiredAction: string;
    blocking: boolean;
}

export function analyzeGaps(input: GapInput): Gap[] {
    const gaps: Gap[] = [];

    const officialReqs = input.requirements.filter(
        (requirement) => requirement.required && requirement.sourceType === "official"
    );

    if (officialReqs.length === 0 && input.requirements.length > 0) {
        gaps.push({
            category: "requirement",
            message: "No official-source requirements found",
            requiredAction: "Verify requirements against official government sources",
            blocking: true,
        });
    }

    const hasForm = input.documents.some((document) => document.kind === "form");
    if (!hasForm && officialReqs.length > 0) {
        gaps.push({
            category: "document",
            message: "No form documents uploaded",
            requiredAction: "Upload required permit application forms",
            blocking: true,
        });
    }

    for (const document of input.documents.filter((item) => item.status === "failed")) {
        gaps.push({
            category: "document",
            message: `Document ${document.id} failed processing`,
            requiredAction: "Re-upload or replace the failed document",
            blocking: true,
        });
    }

    const filledFieldKeys = new Set(
        input.formFills.map((fill) => `${fill.templateId}:${fill.fieldName}`.toLowerCase())
    );

    for (const field of input.formFields.filter((item) => item.required)) {
        const key = `${field.templateId}:${field.fieldName}`.toLowerCase();
        if (filledFieldKeys.has(key)) continue;

        gaps.push({
            category: "field",
            message: `Required field "${field.fieldName}" has not been mapped`,
            requiredAction: `Provide or confirm a value for "${field.fieldName}" before review`,
            blocking: true,
        });
    }

    for (const fill of input.formFills.filter(
        (item) => item.confidence < LOW_CONFIDENCE_THRESHOLD && !item.approvedAt
    )) {
        gaps.push({
            category: "field",
            message: `Field "${fill.fieldName}" has low confidence (${(fill.confidence * 100).toFixed(0)}%)`,
            requiredAction: `Review and approve or correct the value for "${fill.fieldName}"`,
            blocking: true,
        });
    }

    const advisoryOnly = input.requirements.filter(
        (requirement) => requirement.sourceType === "advisory"
    );
    if (advisoryOnly.length > 0) {
        gaps.push({
            category: "requirement",
            message: `${advisoryOnly.length} requirement(s) come from advisory sources`,
            requiredAction: "Review advisory requirements for completeness",
            blocking: false,
        });
    }

    return gaps;
}

export function hasBlockingGaps(gaps: Gap[]) {
    return gaps.some((gap) => gap.blocking);
}

export function canExport(gaps: Gap[], reviewApprovedAt: string | null) {
    if (!reviewApprovedAt) return false;
    return !hasBlockingGaps(gaps);
}
