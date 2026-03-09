import { PDFDocument } from "pdf-lib";
import { complete } from "@/lib/llm";

/* ---------- PDF field extraction ---------- */

export interface ExtractedField {
    fieldName: string;
    fieldType: string;
    required: boolean;
}

export async function extractFormFields(
    pdfBytes: Buffer
): Promise<{ fields: ExtractedField[]; isFillable: boolean }> {
    try {
        const pdfDoc = await PDFDocument.load(pdfBytes, {
            ignoreEncryption: true,
        });
        const form = pdfDoc.getForm();
        const pdfFields = form.getFields();

        if (pdfFields.length === 0) {
            return { fields: [], isFillable: false };
        }

        const fields: ExtractedField[] = pdfFields.map((f) => ({
            fieldName: f.getName(),
            fieldType: f.constructor.name.replace("PDF", "").toLowerCase(),
            required: false, // PDF spec doesn't reliably indicate required
        }));

        return { fields, isFillable: true };
    } catch {
        return { fields: [], isFillable: false };
    }
}

/* ---------- Field mapping ---------- */

export interface FieldMapping {
    fieldName: string;
    sourceKey: string;
    value: string;
    confidence: number;
    method: "deterministic" | "vision-assisted" | "manual";
}

// Deterministic mappings for common fields
const DETERMINISTIC_MAP: Record<string, string> = {
    business_name: "businessName",
    "business name": "businessName",
    applicant_name: "applicantName",
    "applicant name": "applicantName",
    address: "address",
    "business address": "address",
    city: "city",
    state: "state",
    zip: "zip",
    "zip code": "zip",
    phone: "phone",
    "phone number": "phone",
    email: "email",
    "email address": "email",
    date: "date",
    signature: "signature",
    "entity type": "entityType",
    "business type": "entityType",
    ein: "ein",
    ssn: "ssn",
    "tax id": "taxId",
};

export function mapFieldsDeterministic(
    fields: ExtractedField[],
    data: Record<string, string>
): FieldMapping[] {
    const results: FieldMapping[] = [];
    for (const f of fields) {
        const normalizedName = f.fieldName.toLowerCase().replace(/[_\-\.]/g, " ").trim();
        const sourceKey = DETERMINISTIC_MAP[normalizedName];
        if (sourceKey && data[sourceKey]) {
            results.push({
                fieldName: f.fieldName,
                sourceKey,
                value: data[sourceKey],
                confidence: 1.0,
                method: "deterministic",
            });
        }
    }
    return results;
}

/* ---------- Vision-assisted mapping ---------- */

export async function mapFieldsVisionAssisted(
    unmappedFields: ExtractedField[],
    data: Record<string, string>,
    documentContext: string
): Promise<FieldMapping[]> {
    if (unmappedFields.length === 0) return [];

    const prompt = `Given these form fields that need to be filled:
${unmappedFields.map((f) => `- "${f.fieldName}" (${f.fieldType})`).join("\n")}

And this available data:
${Object.entries(data)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join("\n")}

Document context: ${documentContext}

Map each field to the most appropriate data key. Respond ONLY with JSON array:
[{"fieldName":"...","sourceKey":"...","value":"...","confidence":0.X}]

Only include fields where you have reasonable confidence (>0.4). Set confidence based on how certain the mapping is.`;

    const { text } = await complete(prompt, { temperature: 0.1 });

    try {
        const parsed = JSON.parse(text) as Array<{
            fieldName: string;
            sourceKey: string;
            value: string;
            confidence: number;
        }>;
        return parsed.map((m) => ({
            ...m,
            method: "vision-assisted" as const,
        }));
    } catch {
        return [];
    }
}

/* ---------- Fill PDF ---------- */

export async function fillPdf(
    pdfBytes: Buffer,
    mappings: FieldMapping[]
): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();

    for (const mapping of mappings) {
        try {
            const field = form.getTextField(mapping.fieldName);
            field.setText(mapping.value);
        } catch {
            // Field might not be a text field or might not exist
            continue;
        }
    }

    const filledBytes = await pdfDoc.save();
    return Buffer.from(filledBytes);
}

/* ---------- Confidence threshold ---------- */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function flagLowConfidence(mappings: FieldMapping[]): FieldMapping[] {
    return mappings.filter((m) => m.confidence < LOW_CONFIDENCE_THRESHOLD);
}
