import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient() {
    if (!client) {
        client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    return client;
}

export interface LLMOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}

export function hasAnthropicAccess() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function complete(prompt: string, options: LLMOptions = {}) {
    if (!hasAnthropicAccess()) {
        throw new Error("Anthropic API key is not configured");
    }

    const {
        model = "claude-sonnet-4-20250514",
        maxTokens = 4096,
        temperature = 0.3,
        systemPrompt,
    } = options;

    const response = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

    return { text, usage: response.usage };
}

function inferJurisdiction(prompt: string) {
    const jurisdictionMatch = prompt.match(
        /\b(?:in|at|for)\s+([A-Z][A-Za-z.\s]+,\s*[A-Z]{2}|[A-Z][A-Za-z.\s]+,\s*[A-Z][A-Za-z.\s]+)\b/
    );

    return jurisdictionMatch?.[1]?.trim() ?? "unknown";
}

function inferEntityType(prompt: string) {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("llc")) return "LLC";
    if (normalized.includes("corporation") || normalized.includes("corp")) return "corporation";
    if (normalized.includes("sole propriet")) return "sole proprietorship";
    if (normalized.includes("partnership")) return "partnership";
    return "business";
}

function inferPermitType(prompt: string) {
    const normalized = prompt.toLowerCase();

    if (normalized.includes("bakery") || normalized.includes("restaurant") || normalized.includes("coffee")) {
        return "food service permit";
    }
    if (normalized.includes("construction") || normalized.includes("remodel")) {
        return "building permit";
    }
    if (normalized.includes("retail") || normalized.includes("store")) {
        return "business license";
    }

    return "business license";
}

export async function classifyPermit(prompt: string) {
    if (!hasAnthropicAccess()) {
        return {
            permitType: inferPermitType(prompt),
            jurisdiction: inferJurisdiction(prompt),
            entityType: inferEntityType(prompt),
            confidence: 0.62,
        };
    }

    const systemPrompt = `You are a permit classification expert. Given a business description, identify:
1. permitType - the type of permit needed
2. jurisdiction - the governing jurisdiction
3. entityType - the business entity type
4. confidence - your confidence score from 0.0 to 1.0

Respond ONLY with valid JSON: {"permitType":"...","jurisdiction":"...","entityType":"...","confidence":0.X}`;

    const { text } = await complete(prompt, { systemPrompt, temperature: 0.1 });

    try {
        return JSON.parse(text) as {
            permitType: string;
            jurisdiction: string;
            entityType: string;
            confidence: number;
        };
    } catch {
        return {
            permitType: inferPermitType(prompt),
            jurisdiction: inferJurisdiction(prompt),
            entityType: inferEntityType(prompt),
            confidence: 0.5,
        };
    }
}
