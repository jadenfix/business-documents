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

const STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "at",
    "business",
    "for",
    "in",
    "license",
    "of",
    "on",
    "or",
    "permit",
    "the",
    "to",
]);

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
    citations: ResearchCitation[];
}

export interface ResearchCitation {
    url: string;
    title: string;
    snippet?: string;
    isOfficial: boolean;
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
        citations: ResearchCitation[];
    }>;
    citations: ResearchCitation[];
}

interface RawResearchRequirement {
    title: string;
    description: string;
    primaryCitationIndex?: number | null;
    supportingCitationIndexes?: number[] | null;
    required: boolean;
    fee?: string | null;
    dueDate?: string | null;
    confidence: number;
}

function sanitizeUrl(url: string) {
    try {
        const parsed = new URL(url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return null;
        }

        parsed.hash = "";
        return parsed.toString();
    } catch {
        return null;
    }
}

function formatCitationTitle(url: string) {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname
            .split("/")
            .filter(Boolean)
            .slice(-2)
            .map((segment) => segment.replace(/[-_]+/g, " "));

        if (segments.length === 0) {
            return parsed.hostname;
        }

        return `${parsed.hostname} / ${segments.join(" / ")}`;
    } catch {
        return url;
    }
}

function normalizeCitationInput(input: unknown): ResearchCitation | null {
    const candidate =
        typeof input === "string"
            ? { url: input }
            : typeof input === "object" && input
              ? (input as {
                    url?: string;
                    title?: string;
                    snippet?: string;
                })
              : null;

    const url = sanitizeUrl(candidate?.url ?? "");
    if (!url) {
        return null;
    }

    const title =
        typeof candidate?.title === "string" && candidate.title.trim().length > 0
            ? candidate.title.trim()
            : formatCitationTitle(url);
    const snippet =
        typeof candidate?.snippet === "string" && candidate.snippet.trim().length > 0
            ? candidate.snippet.trim()
            : undefined;

    return {
        url,
        title,
        snippet,
        isOfficial: isOfficialSource(url),
    };
}

function dedupeCitations(citations: ResearchCitation[]) {
    const byUrl = new Map<string, ResearchCitation>();

    for (const citation of citations) {
        const existing = byUrl.get(citation.url);
        if (!existing) {
            byUrl.set(citation.url, citation);
            continue;
        }

        byUrl.set(citation.url, {
            ...existing,
            title: existing.title === formatCitationTitle(existing.url) ? citation.title : existing.title,
            snippet: existing.snippet ?? citation.snippet,
            isOfficial: existing.isOfficial || citation.isOfficial,
        });
    }

    return [...byUrl.values()];
}

function normalizeCitations(inputs: unknown[]) {
    return dedupeCitations(
        inputs
            .map((input) => normalizeCitationInput(input))
            .filter((citation): citation is ResearchCitation => Boolean(citation))
    );
}

function tokenize(value: string) {
    return value
        .toLowerCase()
        .replace(/https?:\/\//g, " ")
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function scoreCitationForRequirement(
    requirement: Pick<RawResearchRequirement, "title" | "description">,
    citation: ResearchCitation
) {
    const requirementTokens = new Set(tokenize(`${requirement.title} ${requirement.description}`));
    if (requirementTokens.size === 0) {
        return citation.isOfficial ? 0.1 : 0;
    }

    const citationTokens = new Set(tokenize(`${citation.title} ${citation.url} ${citation.snippet ?? ""}`));
    const overlap = [...requirementTokens].filter((token) => citationTokens.has(token)).length;
    const size = Math.max(requirementTokens.size, citationTokens.size, 1);
    const coverage = overlap / size;

    return coverage + (citation.isOfficial ? 0.08 : 0);
}

function selectPrimaryCitation(
    requirement: Pick<RawResearchRequirement, "title" | "description">,
    citations: ResearchCitation[],
    requestedIndexes: number[]
) {
    const requested = requestedIndexes
        .map((index) => citations[index])
        .filter((citation): citation is ResearchCitation => Boolean(citation));

    const requestedByScore = requested
        .map((citation) => ({
            citation,
            score: scoreCitationForRequirement(requirement, citation),
        }))
        .sort((left, right) => right.score - left.score);

    const bestRequestedOfficial = requestedByScore.find((entry) => entry.citation.isOfficial)?.citation;
    if (bestRequestedOfficial) {
        return bestRequestedOfficial;
    }

    if (requestedByScore[0]) {
        return requestedByScore[0].citation;
    }

    const allByScore = citations
        .map((citation) => ({
            citation,
            score: scoreCitationForRequirement(requirement, citation),
        }))
        .sort((left, right) => right.score - left.score);

    const bestOfficial = allByScore.find((entry) => entry.citation.isOfficial)?.citation;
    if (bestOfficial) {
        return bestOfficial;
    }

    return allByScore[0]?.citation ?? null;
}

function buildRequirementCitations(
    requirement: Pick<RawResearchRequirement, "title" | "description" | "primaryCitationIndex" | "supportingCitationIndexes">,
    citations: ResearchCitation[]
) {
    const requestedIndexes = [
        ...(typeof requirement.primaryCitationIndex === "number"
            ? [requirement.primaryCitationIndex]
            : []),
        ...((requirement.supportingCitationIndexes ?? []).filter((value): value is number =>
            Number.isInteger(value)
        )),
    ];

    const primary = selectPrimaryCitation(requirement, citations, requestedIndexes);
    if (!primary) {
        return [];
    }

    const supporting = requestedIndexes
        .map((index) => citations[index])
        .filter((citation): citation is ResearchCitation => Boolean(citation))
        .sort((left, right) => Number(right.isOfficial) - Number(left.isOfficial));

    return dedupeCitations([primary, ...supporting]).slice(0, 4);
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
    const rawCitations = Array.isArray(data.citations) ? data.citations : [];

    return {
        answer,
        citations: normalizeCitations(rawCitations),
    };
}

function buildFallbackResearch(
    jurisdiction: string,
    permitType: string,
    entityType: string
): ResearchResult {
    const citations = [
        {
            url: "https://www.usa.gov/business-permits-licenses",
            title: "USA.gov / business permits and licenses",
            snippet: "Federal guidance on how to identify state and local licensing requirements.",
            isOfficial: true,
        },
        {
            url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits",
            title: "SBA / apply for licenses and permits",
            snippet: "Small Business Administration overview for license and permit research.",
            isOfficial: true,
        },
        {
            url: "https://www.score.org/resource/business-licensing-checklist",
            title: "SCORE / business licensing checklist",
            snippet: "Advisory checklist for organizing supporting documents.",
            isOfficial: false,
        },
    ] satisfies ResearchCitation[];

    const requirements = [
        {
            title: `${permitType} application`,
            description: `Prepare and file the primary ${permitType} application for the ${jurisdiction} ${entityType}.`,
            sourceUrl: citations[0].url,
            sourceType: "official" as const,
            required: true,
            confidence: 0.72,
            citations: [citations[0], citations[1]],
        },
        {
            title: "Entity registration verification",
            description: "Confirm the business entity is registered and in good standing before filing.",
            sourceUrl: citations[1].url,
            sourceType: "official" as const,
            required: true,
            confidence: 0.69,
            citations: [citations[1]],
        },
        {
            title: "Zoning or occupancy confirmation",
            description: "Verify the business address is approved for the intended use before submission.",
            sourceUrl: citations[0].url,
            sourceType: "official" as const,
            required: true,
            confidence: 0.63,
            citations: [citations[0]],
        },
        {
            title: "Advisory filing checklist",
            description: "Use a non-official checklist to review missing supporting documents before final export.",
            sourceUrl: citations[2].url,
            sourceType: "advisory" as const,
            required: false,
            confidence: 0.4,
            citations: [citations[2]],
        },
    ];

    return { requirements, citations };
}

function clampConfidence(value: number) {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function normalizeResearch(
    rawRequirements: RawResearchRequirement[],
    citations: ResearchCitation[]
): ResearchResult {
    const deduped = new Map<string, ResearchResult["requirements"][number]>();

    for (const item of rawRequirements) {
        const requirementCitations = buildRequirementCitations(item, citations);
        const primaryCitation = requirementCitations[0];

        if (!primaryCitation) {
            continue;
        }

        const sourceType = primaryCitation.isOfficial ? "official" : "advisory";
        const key = `${item.title}:${primaryCitation.url}`.toLowerCase();

        deduped.set(key, {
            title: item.title,
            description: item.description,
            sourceUrl: primaryCitation.url,
            sourceType,
            required: sourceType === "official" ? item.required : false,
            fee: item.fee ?? undefined,
            dueDate: item.dueDate ?? undefined,
            confidence: clampConfidence(item.confidence),
            citations: requirementCitations,
        });
    }

    return {
        requirements: [...deduped.values()],
        citations,
    };
}

async function runLiveResearch(
    jurisdiction: string,
    permitType: string,
    entityType: string
) {
    const query = `What are the specific requirements for obtaining a ${permitType} in ${jurisdiction} for a ${entityType}? Include fees, deadlines, required documents, and links to official government pages.`;
    const perplexityResult = await queryPerplexity(query);

    if (perplexityResult.citations.length === 0) {
        throw new Error("No citations returned from research provider");
    }

    const { text } = await complete(
        `Given the following research about permit requirements, extract structured requirements.

Research:
${perplexityResult.answer}

Citations:
${perplexityResult.citations
    .map(
        (citation, index) =>
            `[${index}] ${citation.title} - ${citation.url}${citation.snippet ? ` - ${citation.snippet}` : ""}`
    )
    .join("\n")}

Extract each requirement as a JSON array.
For every item, choose a primaryCitationIndex and optional supportingCitationIndexes from the citation list above.
Prefer official government sources when available, and never invent a URL.
Respond ONLY with a JSON array of objects:
[{"title":"...","description":"...","primaryCitationIndex":0,"supportingCitationIndexes":[0,2],"required":true,"fee":"...or null","dueDate":"...or null","confidence":0.75}]`,
        { temperature: 0.1 }
    );

    const parsed = JSON.parse(text) as RawResearchRequirement[];

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
