import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/forms";

export interface GapInput {
    requirements: Array<{
        id: string;
        title: string;
        required: boolean;
        sourceType: string;
    }>;
    documents: Array<{ id: string; kind: string; status: string }>;
    formFills: Array<{
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

    // 1. Check requirements coverage
    const officialReqs = input.requirements.filter(
        (r) => r.required && r.sourceType === "official"
    );
    if (officialReqs.length === 0 && input.requirements.length > 0) {
        gaps.push({
            category: "requirement",
            message: "No official-source requirements found",
            requiredAction: "Verify requirements against official government sources",
            blocking: true,
        });
    }

    // 2. Check document availability
    const hasForm = input.documents.some((d) => d.kind === "form");
    if (!hasForm && officialReqs.length > 0) {
        gaps.push({
            category: "document",
            message: "No form documents uploaded",
            requiredAction: "Upload required permit application forms",
            blocking: true,
        });
    }

    const failedDocs = input.documents.filter((d) => d.status === "failed");
    for (const doc of failedDocs) {
        gaps.push({
            category: "document",
            message: `Document ${doc.id} failed processing`,
            requiredAction: "Re-upload or replace the failed document",
            blocking: true,
        });
    }

    // 3. Check low-confidence form fills
    const lowConfFills = input.formFills.filter(
        (f) => f.confidence < LOW_CONFIDENCE_THRESHOLD && !f.approvedAt
    );
    for (const fill of lowConfFills) {
        gaps.push({
            category: "field",
            message: `Field "${fill.fieldName}" has low confidence (${(fill.confidence * 100).toFixed(0)}%)`,
            requiredAction: `Review and approve or correct the value for "${fill.fieldName}"`,
            blocking: true,
        });
    }

    // 4. Advisory-only notice (non-blocking)
    const advisoryOnly = input.requirements.filter(
        (r) => r.sourceType === "advisory"
    );
    if (advisoryOnly.length > 0) {
        gaps.push({
            category: "requirement",
            message: `${advisoryOnly.length} requirement(s) from advisory (non-official) sources`,
            requiredAction: "Review advisory requirements for completeness",
            blocking: false,
        });
    }

    return gaps;
}

export function hasBlockingGaps(gaps: Gap[]): boolean {
    return gaps.some((g) => g.blocking);
}

export function canExport(gaps: Gap[], reviewApprovedAt: string | null): boolean {
    if (!reviewApprovedAt) return false;
    return !hasBlockingGaps(gaps);
}
