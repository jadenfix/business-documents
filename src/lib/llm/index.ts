import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient() {
    if (!_client) {
        _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return _client;
}

export interface LLMOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}

export async function complete(prompt: string, options: LLMOptions = {}) {
    const client = getClient();
    const {
        model = "claude-sonnet-4-20250514",
        maxTokens = 4096,
        temperature = 0.3,
        systemPrompt,
    } = options;

    const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

    return { text, usage: response.usage };
}

export async function classifyPermit(prompt: string) {
    const systemPrompt = `You are a permit classification expert. Given a business description, identify:
1. permitType - the type of permit needed (e.g., "business license", "food service permit", "building permit")
2. jurisdiction - the governing jurisdiction (city/county/state)
3. entityType - the business entity type (e.g., "LLC", "sole proprietorship", "corporation")
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
            permitType: "unknown",
            jurisdiction: "unknown",
            entityType: "unknown",
            confidence: 0,
        };
    }
}
