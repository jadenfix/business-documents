import { complete } from "@/lib/llm";

/* ---------- Source gating ---------- */
const OFFICIAL_DOMAINS = [
    ".gov",
    ".us",
    ".state.",
    "ca.gov",
    "ny.gov",
    "permits.",
    "licensing.",
];

export function isOfficialSource(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return OFFICIAL_DOMAINS.some(
            (d) => hostname.endsWith(d) || hostname.includes(d)
        );
    } catch {
        return false;
    }
}

export function gateSource(url: string): "official" | "advisory" {
    return isOfficialSource(url) ? "official" : "advisory";
}

/* ---------- Perplexity research ---------- */

interface PerplexityResult {
    answer: string;
    citations: Array<{ url: string; title: string; snippet?: string }>;
}

async function queryPerplexity(query: string): Promise<PerplexityResult> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        // Fallback to LLM-based research when Perplexity is unavailable
        const { text } = await complete(
            `Research the following permit requirements and provide citations with URLs:\n\n${query}`,
            {
                systemPrompt:
                    "You are a permit research assistant. Provide structured research results with source URLs. Respond in JSON: {\"answer\":\"...\",\"citations\":[{\"url\":\"...\",\"title\":\"...\",\"snippet\":\"...\"}]}",
            }
        );
        try {
            return JSON.parse(text);
        } catch {
            return { answer: text, citations: [] };
        }
    }

    const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "sonar",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a permit research assistant. Focus on official government sources. Provide specific requirements with source URLs.",
                },
                { role: "user", content: query },
            ],
        }),
    });

    if (!res.ok) {
        throw new Error(`Perplexity API error: ${res.status}`);
    }

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content ?? "";
    const rawCitations = data.citations ?? [];

    return {
        answer,
        citations: rawCitations.map((url: string) => ({
            url,
            title: new URL(url).hostname,
            snippet: undefined,
        })),
    };
}

/* ---------- Research pipeline ---------- */

export interface ResearchResult {
    requirements: Array<{
        title: string;
        description: string;
        sourceUrl: string;
        sourceType: "official" | "advisory";
        required: boolean;
        fee?: string;
        dueDate?: string;
        confidence: number;
    }>;
    citations: Array<{
        url: string;
        title: string;
        snippet?: string;
        isOfficial: boolean;
    }>;
}

export async function runResearch(
    jurisdiction: string,
    permitType: string,
    entityType: string
): Promise<ResearchResult> {
    const query = `What are the specific requirements for obtaining a ${permitType} in ${jurisdiction} for a ${entityType}? Include fees, deadlines, required documents, and links to official government pages.`;

    const perplexityResult = await queryPerplexity(query);

    // Parse structured requirements from the research
    const { text } = await complete(
        `Given the following research about permit requirements, extract structured requirements.

Research:
${perplexityResult.answer}

Citations:
${perplexityResult.citations.map((c) => `- ${c.url}: ${c.title}`).join("\n")}

Extract each requirement as JSON array. For sourceUrl, use the most relevant citation URL.
Respond ONLY with a JSON array of objects: [{"title":"...","description":"...","sourceUrl":"...","required":true/false,"fee":"...or null","dueDate":"...or null","confidence":0.X}]`,
        { temperature: 0.1 }
    );

    let parsedReqs: Array<{
        title: string;
        description: string;
        sourceUrl: string;
        required: boolean;
        fee?: string;
        dueDate?: string;
        confidence: number;
    }> = [];

    try {
        parsedReqs = JSON.parse(text);
    } catch {
        parsedReqs = [];
    }

    // Apply source gating
    const requirements = parsedReqs.map((r) => ({
        ...r,
        sourceType: gateSource(r.sourceUrl),
        // Non-official sources get demoted: not counted as required
        required: gateSource(r.sourceUrl) === "official" ? r.required : false,
    }));

    const citations = perplexityResult.citations.map((c) => ({
        ...c,
        isOfficial: isOfficialSource(c.url),
    }));

    return { requirements, citations };
}

/* ---------- Cache key ---------- */
export function researchCacheKey(
    jurisdiction: string,
    permitType: string,
    entityType: string
) {
    return `research:${jurisdiction}:${permitType}:${entityType}`.toLowerCase();
}
