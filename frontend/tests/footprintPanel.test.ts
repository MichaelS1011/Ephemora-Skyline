import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { t, type DictKey } from "../src/i18n";

/**
 * The privacy note on the entry screen is a claim about the machine, so it has
 * to carry the number and the two buttons that make the number smaller. These
 * are wiring checks: the block must read the server's footprint, offer the
 * sweep, and name every browser bucket it owns. It owns two: the verdicts, and
 * since EPHE-AI EA-03 the resident names. A disclosure that lists one and not
 * the other is a promise with a hole in it, so both prefixes appear below.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const landing = readFileSync(path.join(REPO, "frontend/src/components/Landing.tsx"), "utf-8");

const KEYS: DictKey[] = [
  "landing.footprintLead",
  "landing.footprintPath",
  "landing.footprintCopies",
  "landing.footprintStale",
  "landing.footprintNone",
  "landing.footprintPurge",
  "landing.footprintRefresh",
  "landing.footprintReset",
  "landing.footprintNames",
  "landing.footprintNamesOne",
  "landing.footprintNamesNone",
  "landing.footprintNamesUnreadable",
  "landing.footprintResetNames",
  "landing.footprintLook",
  "landing.footprintLookNone",
  "landing.footprintResetLook",
  "landing.footprintLookDone",
  "landing.footprintNamesDone",
  "landing.footprintNamesDoneUnreadable",
  "landing.footprintPurged",
  "landing.footprintResetDone",
  "landing.footprintError",
];

describe("the footprint block", () => {
  it("reads the footprint and offers both removals", () => {
    expect(landing).toContain('fetch("/api/footprint")');
    expect(landing).toContain('fetch("/api/footprint/purge", { method: "POST" })');
    expect(landing).toContain('k.startsWith("codecity-reviews:")');
    expect(landing).toContain('k.startsWith("codecity-ephe-names:")');
    expect(landing).toMatch(/localStorage\.removeItem\(k\)/);
  });

  it("names the stored look and gives the reader a way back", () => {
    // §04.09 — the third key. Reading whether a key EXISTS is `hasStoredLook`
    // (the clear door needs it even over corrupt bytes); reading WHAT the key
    // holds is `readEpheLookRead`, whose `unreadable` state the block now
    // names in words (task #8, storage-read class). Deleting is
    // `clearEpheLook`, and the button is disabled when there is nothing to lose.
    expect(landing).toContain(
      'import { clearEpheLook, hasStoredLook, readEpheLookRead } from "../epheLook"',
    );
    expect(landing).toContain("setLookSaved(hasStoredLook())");
    expect(landing).toContain('readEpheLookRead().state === "unreadable"');
    expect(landing).toContain("disabled={!lookSaved}");
    expect(landing).toContain(
      't(lang, lookSaved ? "landing.footprintLook" : "landing.footprintLookNone")',
    );
  });

  it("counts the names it keeps, and opens the removal door over any of them", () => {
    // Three states ride this line (Auftrag #13): the count answers with the
    // readable part AND with whether a bucket refused to read — through the
    // class reader, not a hand-parsed loop whose `catch` called unreadable
    // bytes "never named". Auftrag #22 opened the door: `disabled` now fires
    // only when NOTHING of this class is there — readable zero AND unreadable
    // false — because a corrupt bucket is exactly the bytes the sweep exists
    // for. The done line counts what it deletes: readable names as a number
    // (both branches below), the unreadable rest as a word, never a sum.
    expect(landing).toContain("const names = countStoredNames();");
    expect(landing).toContain("setNameCount(names.names)");
    expect(landing).toContain("setNamesUnreadable(names.unreadable)");
    expect(landing).toContain("readStoredJson<Record<string, string>>(k, honouredNames)");
    expect(landing).toMatch(/disabled=\{nameCount === 0 && !namesUnreadable\}/);
    expect(landing).toContain(
      'ts(lang, "landing.footprintNamesDoneUnreadable", { n: names.names })',
    );
    // The screen's copy is cleared with the storage, or the card would go on
    // showing a name the reader just deleted.
    expect(landing).toContain(
      "useStore.setState({ residentNames: {}, residentNamesBlocked: false })",
    );
  });

  it("refuses to sweep when the server says nothing is stale", () => {
    expect(landing).toMatch(/disabled=\{!foot \|\| foot\.stale === 0\}/);
  });

  it("keeps the numbers in the disclosure, not on the first paint", () => {
    const details = landing.slice(landing.indexOf('className="landing-network"'));
    const end = details.indexOf("</details>");
    expect(details.slice(0, end)).toContain("landing-footprint");
    expect(details.slice(0, end)).toContain('role="status"');
  });

  it("speaks both languages, and does not fake it", () => {
    for (const key of KEYS) {
      const en = t("en", key);
      const de = t("de", key);
      expect(en.length, `${key} has no English`).toBeGreaterThan(3);
      expect(de.length, `${key} has no German`).toBeGreaterThan(3);
      expect(de, `${key} is copied, not translated`).not.toBe(en);
    }
  });

  it("reports a missing server instead of showing nothing", () => {
    expect(landing).toContain("setFootError(true)");
    expect(landing).toContain('t(lang, "landing.footprintError")');
  });
});
