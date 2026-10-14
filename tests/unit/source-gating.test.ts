import { describe, it, expect } from "vitest";
import { isOfficialSource, gateSource } from "@/lib/research";

describe("source gating", () => {
    it("classifies .gov domains as official", () => {
        expect(isOfficialSource("https://www.nyc.gov/permits")).toBe(true);
        expect(isOfficialSource("https://permits.ca.gov/apply")).toBe(true);
        expect(isOfficialSource("https://licensing.state.tx.us/forms")).toBe(true);
    });

    it("classifies non-gov domains as advisory", () => {
        expect(isOfficialSource("https://www.example.com/permits")).toBe(false);
        expect(isOfficialSource("https://blog.startup.io/guide")).toBe(false);
    });

    it("gateSource returns correct type", () => {
        expect(gateSource("https://permits.ca.gov/form")).toBe("official");
        expect(gateSource("https://yelp.com/biz")).toBe("advisory");
    });

    it("handles invalid URLs gracefully", () => {
        expect(isOfficialSource("not-a-url")).toBe(false);
        expect(gateSource("not-a-url")).toBe("advisory");
    });
});


describe("official domain boundaries", () => {
    it.each([
        "https://nyc.gov.attacker.com/form",
        "https://permits.attacker.com/form",
        "https://licensing.attacker.com/form",
        "https://fake.state.attacker.com/form",
        "https://private-business.us/form",
        "https://notca.gov.example.org/form",
        "https://nyc.gov@attacker.com/form",
        "ftp://nyc.gov/form",
    ])("does not certify %s", (url) => {
        expect(isOfficialSource(url)).toBe(false);
        expect(gateSource(url)).toBe("advisory");
    });
    it("handles canonical trailing-dot government domains", () => {
        expect(isOfficialSource("https://www.nyc.gov./form")).toBe(true);
    });
});
