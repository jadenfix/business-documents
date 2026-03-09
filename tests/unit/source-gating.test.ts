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
