// The card's text is the user's voice in public, so two rules hold it: it
// quotes only numbers the scan produced, and while the operator's link
// constant is empty it names no destination and asks for no star.
import { describe, it, expect } from "vitest";
import { captionsFor, measuredFacts } from "../src/share/captions";
import { SHARE_LINK } from "../src/share/config";
import type { CityData } from "../src/city/types";

const city = {
  repo: { owner: "local", name: "solarlayout", branch: "main" },
  analysisId: "scan-9",
  totalFiles: 214,
  renderedFiles: 35,
  totalLines: 41250,
  codeLines: 38000,
  unverifiedFiles: 61,
  languages: { Python: 22000, TypeScript: 14000, Markdown: 1250 },
  findingsBySeverity: { P0: 2, P1: 5, P2: 9 },
  fileConnections: [],
  dirConnections: [],
  meta: {},
  tree: {
    name: "solarlayout",
    path: "",
    children: [
      { name: "grid", path: "grid" },
      { name: "tariffs", path: "tariffs" },
    ],
    detailFiles: [],
    districtFiles: [],
    remainingFiles: 0,
  },
} as unknown as CityData;

const facts = measuredFacts(city);
const digits = (text: string): string[] => text.match(/\d[\d.,]*/g) ?? [];

describe("measured facts", () => {
  it("come out of the payload and nothing else", () => {
    expect(facts).toMatchObject({
      files: 214,
      codeLines: 38000,
      codeLinesOnly: true,
      findings: 16,
      p0: 2,
      languages: 3,
      districts: 2,
      unverified: 61,
      rendered: 35,
    });
  });

  it("fall back to read text and say so when the payload has no code split", () => {
    const bare = measuredFacts({ ...city, codeLines: undefined } as unknown as CityData);
    expect(bare.codeLines).toBe(41250);
    expect(bare.codeLinesOnly).toBe(false);
    expect(captionsFor(bare, "en", "")[0]!.text).toContain("lines of read text");
  });

  it("are all zero for no city at all", () => {
    expect(measuredFacts(null).files).toBe(0);
  });
});

describe("the three caption tones", () => {
  it("carry the four measured numbers in every tone and language", () => {
    for (const lang of ["en", "de"] as const) {
      const all = captionsFor(facts, lang, SHARE_LINK);
      expect(all).toHaveLength(3);
      for (const caption of all) {
        expect(caption.text).toContain(lang === "de" ? "214 Dateien" : "214 files");
        expect(caption.text).toContain(lang === "de" ? "38.000" : "38,000");
        expect(caption.text).toContain(
          lang === "de" ? "16 Scanner-Funde zur Prüfung" : "16 scanner findings to review",
        );
        expect(caption.text).toContain(lang === "de" ? "3 Sprachen" : "3 languages");
      }
    }
  });

  it("quote no number the payload does not carry", () => {
    const allowed = new Set([
      "214", // files
      "38000", // code lines
      "16", // findings
      "3", // languages
      "61", // unverified files
      "2", // districts, and P0
      "35", // rendered buildings
    ]);
    for (const lang of ["en", "de"] as const) {
      for (const caption of captionsFor(facts, lang, SHARE_LINK)) {
        for (const token of digits(caption.text)) {
          const bare = token.replace(lang === "de" ? /\./g : /,/g, "");
          expect(allowed.has(bare)).toBe(true);
        }
      }
    }
  });

  it("say the grey buildings are grey because nothing checked them", () => {
    const de = captionsFor(facts, "de", SHARE_LINK)[0]!.text;
    expect(de).toContain("61");
    expect(de).toContain("grau");
  });

  it("name no project, folder or file", () => {
    for (const lang of ["en", "de"] as const) {
      const text = captionsFor(facts, lang, "https://example.org")
        .map((c) => c.text)
        .join(" ");
      expect(text).not.toContain("solarlayout");
      expect(text).not.toContain("tariffs");
      expect(text).not.toContain("grid");
    }
  });

  it("ask nothing while the operator's link is empty", () => {
    expect(SHARE_LINK).toBe("");
    for (const lang of ["en", "de"] as const) {
      const text = captionsFor(facts, lang, SHARE_LINK)
        .map((c) => c.text)
        .join(" ")
        .toLowerCase();
      expect(text).not.toContain("http");
      expect(text).not.toContain("github");
      expect(text).not.toContain(lang === "de" ? "stern" : "star");
    }
  });

  it("puts the link in the text without speaking a star request in the user's voice", () => {
    const withLink = captionsFor(facts, "de", "https://skyline.ephemora.example");
    for (const caption of withLink) {
      expect(caption.text).toContain("https://skyline.ephemora.example");
    }
    expect(withLink[1]!.text).not.toContain("Stern");
  });

  it("speak about an unscanned city without inventing a clean bill", () => {
    const clean = measuredFacts({
      ...city,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      unverifiedFiles: 0,
    } as unknown as CityData);
    expect(captionsFor(clean, "en", "")[0]!.text).toContain("No scanner findings");
    expect(captionsFor(clean, "de", "")[0]!.text).toContain("Keine Scanner-Funde");
  });
});
