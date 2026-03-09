import { describe, expect, it } from "vitest";
import { normalizeResearch, type ResearchCitation } from "@/lib/research";

describe("research normalization", () => {
    it("keeps a per-requirement audit trail and prefers official citations", () => {
        const citations: ResearchCitation[] = [
            {
                url: "https://planning.lacity.gov/zoning/adult-entertainment-clearance",
                title: "Adult entertainment zoning clearance",
                snippet: "Zoning review requirements for adult entertainment businesses.",
                isOfficial: true,
            },
            {
                url: "https://example-consultant.com/adult-business-zoning-guide",
                title: "Adult business zoning guide",
                snippet: "Consultant checklist for adult business applicants.",
                isOfficial: false,
            },
        ];

        const result = normalizeResearch(
            [
                {
                    title: "Zoning clearance",
                    description: "Confirm zoning approval for an adult entertainment venue.",
                    primaryCitationIndex: 1,
                    supportingCitationIndexes: [0],
                    required: true,
                    confidence: 0.82,
                },
            ],
            citations
        );

        expect(result.requirements).toHaveLength(1);
        expect(result.requirements[0].sourceUrl).toBe(citations[0].url);
        expect(result.requirements[0].sourceType).toBe("official");
        expect(result.requirements[0].citations.map((citation) => citation.url)).toEqual([
            citations[0].url,
            citations[1].url,
        ]);
    });

    it("falls back to the best matching official citation when indexes are invalid", () => {
        const citations: ResearchCitation[] = [
            {
                url: "https://lafd.org/fire-inspection/assembly-occupancy",
                title: "Assembly occupancy fire inspection",
                snippet: "Inspection steps for public assembly venues.",
                isOfficial: true,
            },
            {
                url: "https://planning.lacity.gov/zoning/general-business",
                title: "General business zoning",
                snippet: "General zoning guidance.",
                isOfficial: true,
            },
        ];

        const result = normalizeResearch(
            [
                {
                    title: "Fire inspection",
                    description: "Schedule the required fire inspection for the venue.",
                    primaryCitationIndex: 99,
                    supportingCitationIndexes: [42],
                    required: true,
                    confidence: 0.91,
                },
            ],
            citations
        );

        expect(result.requirements).toHaveLength(1);
        expect(result.requirements[0].sourceUrl).toBe(citations[0].url);
        expect(result.requirements[0].citations).toHaveLength(1);
    });
});
