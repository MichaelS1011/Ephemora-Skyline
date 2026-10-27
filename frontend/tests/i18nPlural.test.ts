import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { DICT, t, plural, formatCount, type DictKey, type Lang } from "../src/i18n";

const keys = Object.keys(DICT) as DictKey[];

/**
 * Every line of shipped source, for the "is this key ever called" check —
 * MINUS the two files that only DECLARE key literals. `i18n/dict.ts` prints
 * every key as its own definition and `components/startCopy.ts` mirrors some
 * of them in its BRIDGE, so with either inside the set a branch proves its
 * own call site. Measured 2026-10-26: with dict.ts in the set all 52 `*One`
 * keys match their definition and the orphan count is structurally 0; with
 * both declaration-only files out, the set sees call sites only.
 */
function sourceFiles(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, into);
    else if (/\.(ts|tsx)$/.test(entry.name)) into.push(full);
  }
  return into;
}
const CALL_SRC = sourceFiles(path.resolve(import.meta.dirname, "../src"))
  .filter((f) => !/i18n[/\\]dict\.ts$/.test(f) && !/[/\\]startCopy\.ts$/.test(f))
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");

/**
 * The text pass (plan §5): every key carries both languages, and a count that
 * shows a noun or a verb has a singular branch. Measured before: the severity
 * chip announced "Kritisch: 1 Funde" (`hud.sevAriaOff`, audit finding 10).
 */
describe("i18n coverage after the text pass", () => {
  it("has a non-empty English and German value for every key", () => {
    for (const key of keys) {
      expect(DICT[key]!.en.trim(), `en is empty for "${key}"`).not.toBe("");
      expect(DICT[key]!.de.trim(), `de is empty for "${key}"`).not.toBe("");
    }
  });

  it("ships the plan §5 keys in both languages", () => {
    const required = [
      "stage.enumerating",
      "stage.parsing",
      "stage.deepscan",
      "stage.deps",
      "stage.osv",
      "stage.git",
      "stage.dupes",
      "stage.coverage",
      "stage.final",
      "stage.done",
      "scan.reading",
      "scan.readingOf",
      "scan.uploading",
      "scan.elapsed",
      // `scan.etaHint` ("usually about {s} s") stood here until #39 removed it:
      // no screen ever printed it, and nothing in the payload carries a
      // duration a scan could promise. A key that no surface reads is not a
      // plan requirement — it is a sentence waiting to be a lie.
      "scan.cancelled",
      "cap.filesFound",
      "cap.hint",
      "cap.excludeLabel",
      "cap.excludePlaceholder",
      "drop.rejected",
      "drop.skipped",
      "drop.unread",
      "limit.hit",
      "limit.waiting",
      "panel.noFindingsUnchecked",
      "panel.noFindingsChecked",
      "hud.noFindingsQual",
      "district.underground",
    ] as const;
    for (const key of required) {
      expect(DICT[key], `missing key "${key}"`).toBeDefined();
    }
  });

  it("keeps every singular branch paired with a plural one", () => {
    const dict = DICT as Record<string, { en: string; de: string } | undefined>;
    const singles = keys.filter((k) => k.endsWith("One"));
    expect(singles.length).toBeGreaterThan(20);
    for (const key of singles) {
      const base = key.slice(0, -"One".length);
      expect(dict[base] ?? dict[`${base}Many`], `"${key}" has no plural sibling`).toBeDefined();
    }
  });

  /**
   * A branch in the dictionary is not a branch in the program. Measured before:
   * `actions.triageOpenTitleOne` and `actions.findingsOne` sat there complete,
   * in both languages, while the dock called the plural form unconditionally —
   * the sentence the user read was "1 findings in this queue still need a
   * verdict". This is the check that would have caught it.
   */
  /**
   * Scoped exceptions, decided and measured in the hardening round of
   * 2026-10-26. A NEW orphan still turns this test red, and an entry whose
   * branch gained a caller goes red too — the list cannot rot silently.
   * The two real n=1 defects (panel.moreSectionsOne, layout.drawnHereOne)
   * were fixed at their call sites, not whitelisted here.
   */
  const SCOPED_ORPHANS: Record<string, string> = {
    // refuseOverCap fires only when plan.found > MAX_FILES = 10_000
    // (src/hooks/useLocalAnalysis.ts:141,337,701-703), so the One branch of
    // capLine (line 358) can never be reached at n === 1.
    "cap.filesFoundOne": "unreachable singular: only shown past the 10 000-file cap",
    // Dead family: no component calls "drop.rejected" either — the live row
    // is drop.rejectedNoMax* (ScanSummary.tsx:60). Dies with the dictionary trim.
    "drop.rejectedOne": "dead family: neither side of the pair has a call site",
    // Dead family: the plural is called by nothing in src/ either — only
    // tests/i18n.test.ts:38 lists it. Dies with the dictionary trim.
    "landing.progressCollectingOne": "dead family: neither side of the pair has a call site",
  };
  it("calls every singular branch it ships", () => {
    const orphans = keys.filter((k) => k.endsWith("One") && !CALL_SRC.includes(`"${k}"`));
    const unjustified = orphans.filter((k) => !(k in SCOPED_ORPHANS));
    expect(unjustified, `singular branches nobody calls: ${unjustified.join(", ")}`).toEqual([]);
    for (const [key, reason] of Object.entries(SCOPED_ORPHANS)) {
      expect(reason.trim(), `scoped orphan "${key}" carries no reason`).not.toBe("");
      expect(
        orphans.includes(key as DictKey),
        `"${key}" has a caller again — delete its SCOPED_ORPHANS entry`,
      ).toBe(true);
    }
  });
});

describe("plural()", () => {
  it("takes the singular only at exactly 1, in both languages", () => {
    expect(plural("de", 1, "Fund", "Funde")).toBe("1 Fund");
    expect(plural("de", 2, "Fund", "Funde")).toBe("2 Funde");
    expect(plural("de", 5, "Fund", "Funde")).toBe("5 Funde");
    expect(plural("en", 1, "finding", "findings")).toBe("1 finding");
    expect(plural("en", 2, "finding", "findings")).toBe("2 findings");
    expect(plural("en", 5, "finding", "findings")).toBe("5 findings");
    // 0 and a measured fraction stay plural — they are never written as "no Fund".
    expect(plural("de", 0, "Fund", "Funde")).toBe("0 Funde");
    expect(plural("en", 0, "finding", "findings")).toBe("0 findings");
    expect(plural("de", 0.5, "Fund", "Funde")).toBe("0,5 Funde");
    expect(plural("en", 0.5, "finding", "findings")).toBe("0.5 findings");
  });

  it("groups thousands by the language of the sentence", () => {
    expect(formatCount("de", 3300)).toBe("3.300");
    expect(formatCount("en", 3300)).toBe("3,300");
    expect(plural("de", 3300, "Datei", "Dateien")).toBe("3.300 Dateien");
    expect(plural("en", 3300, "file", "files")).toBe("3,300 files");
  });

  it("is what fixes the announced severity chip", () => {
    const chip = (lang: Lang, count: number) =>
      t(lang, count === 1 ? "hud.sevAriaOffOne" : "hud.sevAriaOff", {
        label: t(lang, "hud.sevCritical"),
        count,
      });
    expect(chip("de", 1)).toBe("Kritisch: 1 Fund. Stadt filtern");
    expect(chip("de", 2)).toBe("Kritisch: 2 Funde. Stadt filtern");
    expect(chip("en", 1)).toBe("Critical finding: 1. Filter city");
  });
});
