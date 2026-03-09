import { PDFDocument } from "pdf-lib";
import { complete, hasAnthropicAccess } from "@/lib/llm";

export interface ExtractedField {
    fieldName: string;
    fieldType: string;
    required: boolean;
}

export interface FieldMapping {
    fieldName: string;
    sourceKey: string;
    value: string;
    confidence: number;
    method: "deterministic" | "vision-assisted" | "manual";
}

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

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

        const fields: ExtractedField[] = pdfFields.map((field) => ({
            fieldName: field.getName(),
            fieldType: field.constructor.name.replace("PDF", "").toLowerCase(),
            required: false,
        }));

        return { fields, isFillable: true };
    } catch {
        return { fields: [], isFillable: false };
    }
}

export function buildScannedFallbackFields(): ExtractedField[] {
    return [
        { fieldName: "business_name", fieldType: "scanned-text", required: true },
        { fieldName: "applicant_name", fieldType: "scanned-text", required: true },
        { fieldName: "address", fieldType: "scanned-text", required: true },
        { fieldName: "city", fieldType: "scanned-text", required: true },
        { fieldName: "state", fieldType: "scanned-text", required: true },
        { fieldName: "zip", fieldType: "scanned-text", required: false },
        { fieldName: "phone", fieldType: "scanned-text", required: false },
        { fieldName: "email", fieldType: "scanned-text", required: false },
        { fieldName: "entity_type", fieldType: "scanned-text", required: true },
        { fieldName: "signature", fieldType: "scanned-text", required: true },
        { fieldName: "date", fieldType: "scanned-text", required: true },
    ];
}

function normalizeFieldName(value: string) {
    return value.toLowerCase().replace(/[_\-\.]/g, " ").trim();
}

export function mapFieldsDeterministic(
    fields: ExtractedField[],
    data: Record<string, string>
): FieldMapping[] {
    const results: FieldMapping[] = [];

    for (const field of fields) {
        const sourceKey = DETERMINISTIC_MAP[normalizeFieldName(field.fieldName)];
        if (!sourceKey || !data[sourceKey]) continue;

        results.push({
            fieldName: field.fieldName,
            sourceKey,
            value: data[sourceKey],
            confidence: 1,
            method: "deterministic",
        });
    }

    return results;
}

function scoreCandidate(fieldName: string, key: string) {
    const fieldTokens = new Set(normalizeFieldName(fieldName).split(/\s+/));
    const keyTokens = new Set(normalizeFieldName(key).split(/\s+/));
    const overlap = [...fieldTokens].filter((token) => keyTokens.has(token)).length;

    if (overlap === 0) return 0;

    const maxSize = Math.max(fieldTokens.size, keyTokens.size, 1);
    return overlap / maxSize;
}

function fallbackVisionMappings(
    unmappedFields: ExtractedField[],
    data: Record<string, string>
): FieldMapping[] {
    const mappings: FieldMapping[] = [];

    for (const field of unmappedFields) {
        let bestKey = "";
        let bestScore = 0;

        for (const key of Object.keys(data)) {
            const score = scoreCandidate(field.fieldName, key);
            if (score > bestScore) {
                bestKey = key;
                bestScore = score;
            }
        }

        if (!bestKey || bestScore < 0.34) continue;

        mappings.push({
            fieldName: field.fieldName,
            sourceKey: bestKey,
            value: data[bestKey],
            confidence: Number(Math.min(0.65, Math.max(0.45, bestScore + 0.2)).toFixed(2)),
            method: "vision-assisted",
        });
    }

    return mappings;
}

export async function mapFieldsVisionAssisted(
    unmappedFields: ExtractedField[],
    data: Record<string, string>,
    documentContext: string
): Promise<FieldMapping[]> {
    if (unmappedFields.length === 0) return [];
    if (!hasAnthropicAccess()) return fallbackVisionMappings(unmappedFields, data);

    const prompt = `Given these form fields that need to be filled:
${unmappedFields.map((field) => `- "${field.fieldName}" (${field.fieldType})`).join("\n")}

And this available data:
${Object.entries(data)
    .map(([key, value]) => `- ${key}: ${value}`)
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

        return parsed.map((mapping) => ({
            ...mapping,
            method: "vision-assisted" as const,
        }));
    } catch {
        return fallbackVisionMappings(unmappedFields, data);
    }
}

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
            continue;
        }
    }

    const filledBytes = await pdfDoc.save();
    return Buffer.from(filledBytes);
}

export function flagLowConfidence(mappings: FieldMapping[]) {
    return mappings.filter((mapping) => mapping.confidence < LOW_CONFIDENCE_THRESHOLD);
}
