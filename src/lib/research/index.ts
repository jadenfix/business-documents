import { complete, hasAnthropicAccess } from "@/lib/llm";

const OFFICIAL_DOMAINS = [
    ".gov",
    ".us",
    ".state.",
    "ca.gov",
    "ny.gov",
    "permits.",
    "licensing.",
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const researchCache = new Map<string, { expiresAt: number; value: ResearchResult }>();

export function isOfficialSource(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return OFFICIAL_DOMAINS.some(
            (domain) => hostname.endsWith(domain) || hostname.includes(domain)
        );
    } catch {
        return false;
    }
}

export function gateSource(url: string): "official" | "advisory" {
    return isOfficialSource(url) ? "official" : "advisory";
}

interface PerplexityResult {
    answer: string;
    citations: Array<{ url: string; title: string; snippet?: string }>;
}

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

async function queryPerplexity(query: string): Promise<PerplexityResult> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error("Perplexity API key is not configured");
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
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
                        "You are a permit research assistant. Focus on official government sources and provide specific requirements with source URLs.",
                },
                { role: "user", content: query },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? "";
    const rawCitations = data.citations ?? [];

    return {
        answer,
        citations: rawCitations.map((url: string) => ({
            url,
            title: new URL(url).hostname,
        })),
    };
}

function buildFallbackResearch(
    jurisdiction: string,
    permitType: string,
    entityType: string
): ResearchResult {
    const officialSource = "https://www.usa.gov/business-permits-licenses";
    const sbaSource = "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits";
    const advisorySource = "https://www.score.org/resource/business-licensing-checklist";

    const requirements = [
        {
            title: `${permitType} application`,
            description: `Prepare and file the primary ${permitType} application for the ${jurisdiction} ${entityType}.`,
            sourceUrl: officialSource,
            sourceType: "official" as const,
            required: true,
            confidence: 0.72,
        },
        {
            title: "Entity registration verification",
            description: "Confirm the business entity is registered and in good standing before filing.",
            sourceUrl: sbaSource,
            sourceType: "official" as const,
            required: true,
            confidence: 0.69,
        },
        {
            title: "Zoning or occupancy confirmation",
            description: "Verify the business address is approved for the intended use before submission.",
            sourceUrl: officialSource,
            sourceType: "official" as const,
            required: true,
            confidence: 0.63,
        },
        {
            title: "Advisory filing checklist",
            description: "Use a non-official checklist to review missing supporting documents before final export.",
            sourceUrl: advisorySource,
            sourceType: "advisory" as const,
            required: false,
            confidence: 0.4,
        },
    ];

    const citations = [officialSource, sbaSource, advisorySource].map((url) => ({
        url,
        title: new URL(url).hostname,
        isOfficial: isOfficialSource(url),
    }));

    return { requirements, citations };
}

function normalizeResearch(
    rawRequirements: Array<{
        title: string;
        description: string;
        sourceUrl: string;
        required: boolean;
        fee?: string | null;
        dueDate?: string | null;
        confidence: number;
    }>,
    citations: Array<{ url: string; title: string; snippet?: string }>
): ResearchResult {
    const deduped = new Map<string, ResearchResult["requirements"][number]>();

    for (const item of rawRequirements) {
        const sourceType = gateSource(item.sourceUrl);
        const key = `${item.title}:${item.sourceUrl}`.toLowerCase();

        deduped.set(key, {
            title: item.title,
            description: item.description,
            sourceUrl: item.sourceUrl,
            sourceType,
            required: sourceType === "official" ? item.required : false,
            fee: item.fee ?? undefined,
            dueDate: item.dueDate ?? undefined,
            confidence: item.confidence,
        });
    }

    return {
        requirements: [...deduped.values()],
        citations: citations.map((citation) => ({
            ...citation,
            isOfficial: isOfficialSource(citation.url),
        })),
    };
}

async function runLiveResearch(
    jurisdiction: string,
    permitType: string,
    entityType: string
) {
    const query = `What are the specific requirements for obtaining a ${permitType} in ${jurisdiction} for a ${entityType}? Include fees, deadlines, required documents, and links to official government pages.`;
    const perplexityResult = await queryPerplexity(query);

    const { text } = await complete(
        `Given the following research about permit requirements, extract structured requirements.

Research:
${perplexityResult.answer}

Citations:
${perplexityResult.citations.map((citation) => `- ${citation.url}: ${citation.title}`).join("\n")}

Extract each requirement as a JSON array. For sourceUrl, use the most relevant citation URL.
Respond ONLY with a JSON array of objects: [{"title":"...","description":"...","sourceUrl":"...","required":true,"fee":"...or null","dueDate":"...or null","confidence":0.75}]`,
        { temperature: 0.1 }
    );

    const parsed = JSON.parse(text) as Array<{
        title: string;
        description: string;
        sourceUrl: string;
        required: boolean;
        fee?: string | null;
        dueDate?: string | null;
        confidence: number;
    }>;

    return normalizeResearch(parsed, perplexityResult.citations);
}

export function researchCacheKey(
    jurisdiction: string,
    permitType: string,
    entityType: string
) {
    return `research:${jurisdiction}:${permitType}:${entityType}`.toLowerCase();
}

export async function runResearch(
    jurisdiction: string,
    permitType: string,
    entityType: string
): Promise<ResearchResult> {
    const cacheKey = researchCacheKey(jurisdiction, permitType, entityType);
    const cached = researchCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    let result: ResearchResult;

    if (!process.env.PERPLEXITY_API_KEY || !hasAnthropicAccess()) {
        result = buildFallbackResearch(jurisdiction, permitType, entityType);
    } else {
        try {
            result = await runLiveResearch(jurisdiction, permitType, entityType);
        } catch {
            result = buildFallbackResearch(jurisdiction, permitType, entityType);
        }
    }

    researchCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
}
