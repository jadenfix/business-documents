import { describe, it, expect } from "vitest";
import { mapFieldsDeterministic, flagLowConfidence, LOW_CONFIDENCE_THRESHOLD } from "@/lib/forms";
import type { ExtractedField, FieldMapping } from "@/lib/forms";

describe("form field mapping", () => {
    const testFields: ExtractedField[] = [
        { fieldName: "business_name", fieldType: "text", required: true },
        { fieldName: "email_address", fieldType: "text", required: true },
        { fieldName: "phone", fieldType: "text", required: false },
        { fieldName: "unknown_field_xyz", fieldType: "text", required: false },
    ];

    const testData: Record<string, string> = {
        businessName: "Acme LLC",
        email: "owner@acme.com",
        phone: "555-0100",
    };

    it("maps known fields deterministically with confidence 1.0", () => {
        const mappings = mapFieldsDeterministic(testFields, testData);

        const bizName = mappings.find((m) => m.fieldName === "business_name");
        expect(bizName).toBeDefined();
        expect(bizName!.value).toBe("Acme LLC");
        expect(bizName!.confidence).toBe(1.0);
        expect(bizName!.method).toBe("deterministic");
    });

    it("maps email_address to email key", () => {
        const mappings = mapFieldsDeterministic(testFields, testData);
        const emailField = mappings.find((m) => m.fieldName === "email_address");
        expect(emailField).toBeDefined();
        expect(emailField!.value).toBe("owner@acme.com");
    });

    it("skips unknown fields", () => {
        const mappings = mapFieldsDeterministic(testFields, testData);
        const unknown = mappings.find((m) => m.fieldName === "unknown_field_xyz");
        expect(unknown).toBeUndefined();
    });

    it("skips fields with no matching data", () => {
        const mappings = mapFieldsDeterministic(testFields, {});
        expect(mappings.length).toBe(0);
    });
});

describe("confidence scoring", () => {
    it("flags low-confidence mappings", () => {
        const mappings: FieldMapping[] = [
            { fieldName: "a", sourceKey: "x", value: "v", confidence: 0.9, method: "deterministic" },
            { fieldName: "b", sourceKey: "y", value: "v", confidence: 0.5, method: "vision-assisted" },
            { fieldName: "c", sourceKey: "z", value: "v", confidence: 0.3, method: "vision-assisted" },
        ];

        const flagged = flagLowConfidence(mappings);
        expect(flagged.length).toBe(2);
        expect(flagged.every((m) => m.confidence < LOW_CONFIDENCE_THRESHOLD)).toBe(
            true
        );
    });

    it("threshold is 0.7", () => {
        expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.7);
    });
});
