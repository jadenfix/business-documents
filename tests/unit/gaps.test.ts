import { describe, expect, it } from "vitest";
import { analyzeGaps, canExport, hasBlockingGaps } from "@/lib/gaps";

describe("gap analysis", () => {
    it("flags missing forms as blocking", () => {
        const gaps = analyzeGaps({
            requirements: [
                { id: "1", title: "License", required: true, sourceType: "official" },
            ],
            documents: [],
            formFields: [],
            formFills: [],
        });

        expect(gaps.some((gap) => gap.blocking && gap.category === "document")).toBe(true);
        expect(hasBlockingGaps(gaps)).toBe(true);
    });

    it("flags missing required fields as blocking", () => {
        const gaps = analyzeGaps({
            requirements: [],
            documents: [{ id: "d1", kind: "form", status: "processed" }],
            formFields: [
                {
                    templateId: "t1",
                    fieldName: "business_name",
                    required: true,
                },
            ],
            formFills: [],
        });

        expect(gaps.some((gap) => gap.blocking && gap.category === "field")).toBe(true);
    });

    it("flags low-confidence fields as blocking", () => {
        const gaps = analyzeGaps({
            requirements: [],
            documents: [{ id: "d1", kind: "form", status: "processed" }],
            formFields: [],
            formFills: [
                {
                    id: "f1",
                    templateId: "t1",
                    fieldName: "business_name",
                    confidence: 0.3,
                    approvedAt: null,
                },
            ],
        });

        expect(gaps.some((gap) => gap.blocking && gap.category === "field")).toBe(true);
    });

    it("does not block when low-confidence fields are approved", () => {
        const gaps = analyzeGaps({
            requirements: [],
            documents: [{ id: "d1", kind: "form", status: "processed" }],
            formFields: [],
            formFills: [
                {
                    id: "f1",
                    templateId: "t1",
                    fieldName: "business_name",
                    confidence: 0.3,
                    approvedAt: "2025-01-01",
                },
            ],
        });

        const fieldGaps = gaps.filter((gap) => gap.category === "field" && gap.blocking);
        expect(fieldGaps.length).toBe(0);
    });

    it("flags failed documents as blocking", () => {
        const gaps = analyzeGaps({
            requirements: [],
            documents: [{ id: "d1", kind: "form", status: "failed" }],
            formFields: [],
            formFills: [],
        });

        expect(gaps.some((gap) => gap.blocking && gap.category === "document")).toBe(true);
    });

    it("advisory sources are non-blocking", () => {
        const gaps = analyzeGaps({
            requirements: [
                { id: "1", title: "Guide", required: false, sourceType: "advisory" },
            ],
            documents: [{ id: "d1", kind: "form", status: "processed" }],
            formFields: [],
            formFills: [],
        });

        const advisoryGaps = gaps.filter(
            (gap) => gap.category === "requirement" && !gap.blocking
        );
        expect(advisoryGaps.length).toBeGreaterThan(0);
    });

    it("canExport requires approval and no blocking gaps", () => {
        expect(canExport([], null)).toBe(false);
        expect(canExport([], "2025-01-01")).toBe(true);
        expect(
            canExport(
                [
                    {
                        category: "field",
                        message: "test",
                        requiredAction: "fix",
                        blocking: true,
                    },
                ],
                "2025-01-01"
            )
        ).toBe(false);
    });
});
