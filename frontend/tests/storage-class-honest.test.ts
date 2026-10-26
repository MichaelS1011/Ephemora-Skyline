// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  preservedUnreadableBytes,
  quarantineKeyFor,
  readStoredJson,
  type StoredRead,
} from "../src/storageRead";
import { loadExcludes, loadExcludesRead, saveExcludes } from "../src/config/scanProfiles";
import { loadSavedPacks, loadSavedPacksRead, savePacks } from "../src/config/rulePacks";
import {
  recentCities,
  recentCitiesRead,
  recordCityVisit,
  type RecentCity,
} from "../src/recentCities";
import { loadPrefsRead, preservedUnreadablePrefs, savePrefs } from "../src/prefs";
import { loadEpheNames, loadEpheNamesRead, saveEpheName } from "../src/epheNames";
import { EPHE_DEFAULT_LOOK, readEpheLook, readEpheLookRead, saveEpheLook } from "../src/epheLook";
import {
  bucketKeyFor,
  loadReviews,
  loadReviewsForCityRead,
  loadReviewsRead,
  saveReviews,
} from "../src/reviews";
import { anchorFor, verifyAnchorsRead, verifyAnchorsUnreadable } from "../src/verify";
import { ScanExcludes } from "../src/components/ScanExcludes";
import { ProfileChips } from "../src/components/ProfileChips";
import { Landing } from "../src/components/Landing";
import { ResidentCard } from "../src/components/ResidentCard";
import { ContextCard } from "../src/components/ContextCard";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";
import { t as tDict, type Lang } from "../src/i18n";
import { DICT } from "../src/i18n/dict";

/**
 * THE STORAGE-READ CLASS, CLOSED ACROSS ITS REMAINING LOCAL-STORAGE LOADERS.
 *
 * Ledger areas `frontend/prefs-storage` and `frontend/rule-packs` closed this
 * class twice already (corrupt != absent, and unreadable bytes are kept). The
 * inventory of 2026-10-26 listed the loaders still answering a failed read
 * with a default: scanProfiles.loadExcludes, rulePacks.loadSavedPacks (the
 * STORAGE path — the network path was closed), recentCities.read. Each one is
 * a data-loss door: the default is what the screen shows AND what the next
 * save writes back, so the unreadable file is destroyed by the click the
 * failure itself invites.
 *
 * This file is the shared watch for the whole class. It counts, per loader,
 * which of the three states a read returns; it proves the quarantined bytes
 * outlive the next save; it pins the sentence onto the surface each site
 * already has (EN and DE, glyph carried, never colour alone); and it scans
 * the source so no loader in the closed set re-grows a `catch → default`
 * without a state distinction. The loaders still open are a named, countable
 * ledger — not silence.
 */

const tEn = (key: string) => tDict("en", key as never);
const tDe = (key: string) => tDict("de", key as never);

const EXCLUDE_KEY = "codecity-scan-excludes";
const PACKS_KEY = "codecity-scan-packs";
const RECENT_KEY = "codecity-recent:v1";

const ENTRY: RecentCity = {
  id: "a-1",
  folder: "alpha",
  openedAt: 1730000000000,
  findings: 2,
  files: 9,
};

function cityLike(id: string, folder: string) {
  return {
    analysisId: id,
    repo: { name: folder },
    totalFiles: 3,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    // The loaders only touch these fields; the full payload is another lane's type.
  } as never;
}

interface LoaderCase {
  name: string;
  key: string;
  read: () => StoredRead<unknown>;
  defaultValue: () => unknown;
  save: () => void;
  validRaw: string;
  validValue: unknown;
  brokenParse: string;
  wrongShape: string;
  /** What the screen-facing loader answers when the bytes refuse — per loader
   *  its own default, counted in the same cell for every row. */
  wrongShapeDefault: unknown;
}

/**
 * The eight loader doors of the class as ONE table — the tally the task asks
 * for: which loader answers which of the three states, in cells that can be
 * counted (8 rows x 5 cells below; nine closed files, `storageRead.ts` and
 * `prefs.ts` aside being the mechanism and the reference). `wrongShape` is the
 * row that used to be the quietest: bytes that parse but are not what the
 * loader stores — the old code called that "empty", and the next save called
 * it "gone". The per-project rows ride on their own bucket, so every project
 * keeps its own quarantine slot.
 */
const LOOK_KEY = "codecity-ephe-look:v1";
const ANCHOR_KEY = "codecity-verify-anchor:v1";

/** A fixture city whose bucket needs no configured workspace root. */
const BUCKET_CITY = city({
  analysisId: "scan-bucket-1",
  repo: { owner: "local", name: "auth-app", branch: "main" },
  files: [file("src/db.ts", "TypeScript")],
  tree: dir({ path: "", detailFiles: [file("src/db.ts", "TypeScript")] }),
});
const NAMES_BUCKET = `codecity-ephe-names:${bucketKeyFor(BUCKET_CITY)}`;
const REVIEWS_BUCKET = `codecity-reviews:${bucketKeyFor(BUCKET_CITY)}`;
const ATLAS = "plot:f-src/db.ts#0";

const LOADERS: LoaderCase[] = [
  {
    name: "loadExcludesRead (config/scanProfiles.ts)",
    key: EXCLUDE_KEY,
    read: () => loadExcludesRead(),
    defaultValue: () => loadExcludes(),
    save: () => saveExcludes(["tmp"]),
    validRaw: JSON.stringify(["/docs/", "docs", "generated"]),
    validValue: ["docs", "generated"],
    brokenParse: '["docs", {"a":',
    wrongShape: '{"note":"not a list"}',
    wrongShapeDefault: [],
  },
  {
    name: "loadSavedPacksRead (config/rulePacks.ts, storage path)",
    key: PACKS_KEY,
    read: () => loadSavedPacksRead(),
    defaultValue: () => loadSavedPacks(),
    save: () => savePacks(["p9"]),
    validRaw: '["p2", 7, "p1"]',
    validValue: ["p2", "p1"],
    brokenParse: '["p1", ',
    wrongShape: '{"ids":["p1"]}',
    wrongShapeDefault: [],
  },
  {
    name: "recentCitiesRead (recentCities.ts)",
    key: RECENT_KEY,
    read: () => recentCitiesRead(),
    defaultValue: () => recentCities(),
    save: () => recordCityVisit(cityLike("a-2", "beta")),
    validRaw: JSON.stringify([ENTRY]),
    validValue: [ENTRY],
    brokenParse: '[{"id":"a-1","fold',
    wrongShape: '{"entries":[]}',
    wrongShapeDefault: [],
  },
  {
    name: "readEpheLookRead (epheLook.ts)",
    key: LOOK_KEY,
    read: () => readEpheLookRead(),
    defaultValue: () => readEpheLook(),
    save: () => {
      saveEpheLook({ jacket: 1, mark: "dot" });
    },
    validRaw: '{"jacket":1,"mark":"dot"}',
    validValue: { jacket: 1, mark: "dot" },
    brokenParse: '{"jacket":1,',
    wrongShape: '"not an object"',
    wrongShapeDefault: { ...EPHE_DEFAULT_LOOK },
  },
  {
    name: "loadEpheNamesRead (epheNames.ts, per project bucket)",
    key: NAMES_BUCKET,
    read: () => loadEpheNamesRead(BUCKET_CITY),
    defaultValue: () => loadEpheNames(BUCKET_CITY),
    save: () => {
      saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    },
    validRaw: `{"${ATLAS}":"Atlas"}`,
    validValue: { [ATLAS]: "Atlas" },
    brokenParse: `{"${ATLAS}":"At`,
    wrongShape: '[["plot:a","X"]]',
    wrongShapeDefault: {},
  },
  {
    name: "loadReviewsRead (reviews.ts, per project bucket)",
    key: REVIEWS_BUCKET,
    read: () => loadReviewsRead(bucketKeyFor(BUCKET_CITY)),
    defaultValue: () => loadReviews(bucketKeyFor(BUCKET_CITY)),
    save: () => {
      saveReviews(bucketKeyFor(BUCKET_CITY), { "fp:a": "to-fix" });
    },
    validRaw: '{"fp:a":"reviewed"}',
    validValue: { "fp:a": "reviewed" },
    brokenParse: '{"fp:a":"rev',
    wrongShape: '"plain text"',
    wrongShapeDefault: {},
  },
  {
    name: "loadReviewsForCityRead (reviews.ts, city-shaped read)",
    key: REVIEWS_BUCKET,
    read: () => loadReviewsForCityRead(BUCKET_CITY),
    defaultValue: () => {
      const r = loadReviewsForCityRead(BUCKET_CITY);
      return r.state === "read" ? r.value : {};
    },
    save: () => {
      saveReviews(bucketKeyFor(BUCKET_CITY), { "fp:a": "to-fix" });
    },
    validRaw: '{"fp:a":"reviewed"}',
    validValue: { "fp:a": "reviewed" },
    brokenParse: '{"fp:a":"rev',
    wrongShape: '"plain text"',
    wrongShapeDefault: {},
  },
  {
    name: "verifyAnchorsRead (verify.ts)",
    key: ANCHOR_KEY,
    read: () => verifyAnchorsRead(),
    defaultValue: () => {
      const r = verifyAnchorsRead();
      return r.state === "read" ? r.value : [];
    },
    save: () => anchorFor(BUCKET_CITY),
    validRaw: '[{"scanId":"s1","shape":"1:aaaa","previousId":null,"at":1730000000000}]',
    validValue: [{ scanId: "s1", shape: "1:aaaa", previousId: null, at: 1730000000000 }],
    brokenParse: '[{"scanId":"s1","sha',
    wrongShape: '{"entries":[]}',
    wrongShapeDefault: [],
  },
];

describe.each(LOADERS)("%name — three states, never a silent default", (c) => {
  beforeEach(() => localStorage.clear());

  it("never-saved answers absent and writes no quarantine", () => {
    expect(c.read()).toEqual({ state: "absent" });
    expect(localStorage.getItem(quarantineKeyFor(c.key))).toBeNull();
  });

  it("honest bytes answer read, with the loader's own value", () => {
    localStorage.setItem(c.key, c.validRaw);
    const r = c.read();
    expect(r.state).toBe("read");
    if (r.state === "read") expect(r.value).toEqual(c.validValue);
  });

  it("bytes that do not parse answer unreadable — and are preserved verbatim", () => {
    localStorage.setItem(c.key, c.brokenParse);
    expect(c.read()).toEqual({ state: "unreadable" });
    expect(localStorage.getItem(quarantineKeyFor(c.key))).toBe(c.brokenParse);
  });

  it("bytes that parse into the wrong shape are unreadable too, not empty", () => {
    // THE DATA-LOSS DOOR: this case used to answer the default with no word
    // and no distinction — and the next save wrote that default over it.
    localStorage.setItem(c.key, c.wrongShape);
    expect(c.read()).toEqual({ state: "unreadable" });
    expect(localStorage.getItem(quarantineKeyFor(c.key))).toBe(c.wrongShape);
    // The screen-facing default is still the empty value — it is the surface
    // for now; what changed is that it is no longer the whole answer.
    expect(c.defaultValue()).toEqual(c.wrongShapeDefault);
  });

  it("the preserved bytes outlive the very next save", () => {
    localStorage.setItem(c.key, c.brokenParse);
    c.read(); // quarantines
    c.save(); // the click the failure itself invites
    expect(localStorage.getItem(quarantineKeyFor(c.key))).toBe(c.brokenParse);
    expect(localStorage.getItem(c.key)).not.toBe(c.brokenParse);
  });
});

describe("prefs.ts — the pattern these loaders copy (counted, untouched)", () => {
  it("corrupt prefs answer unreadable, defaults answer absent", () => {
    localStorage.clear();
    expect(loadPrefsRead()).toEqual({ state: "absent" });
    localStorage.setItem("codecity-prefs", '{"lang":"de","colorblind":tru');
    expect(loadPrefsRead().state).toBe("unreadable");
    savePrefs({ lang: "en", gfxLite: false, colorblind: false, updateCheck: false });
    expect(preservedUnreadablePrefs()).toBe('{"lang":"de","colorblind":tru');
  });
});

describe("the shared reader itself", () => {
  beforeEach(() => localStorage.clear());

  it("exposes the same quarantine slot the loaders fill", () => {
    expect(quarantineKeyFor(EXCLUDE_KEY)).toBe(`${EXCLUDE_KEY}:unreadable`);
    localStorage.setItem("k-x", "{oops");
    expect(readStoredJson("k-x", (p) => (Array.isArray(p) ? p : undefined))).toEqual({
      state: "unreadable",
    });
    expect(preservedUnreadableBytes("k-x")).toBe("{oops");
  });

  it("keeps the FIRST unreadable blob when a second corruption follows", () => {
    localStorage.setItem("k-y", "{first");
    readStoredJson("k-y", (p) => (Array.isArray(p) ? p : undefined));
    localStorage.setItem("k-y", "{second");
    readStoredJson("k-y", (p) => (Array.isArray(p) ? p : undefined));
    expect(preservedUnreadableBytes("k-y")).toBe("{first");
  });
});

/* ── the word on the surface each site already has ───────────────────────────
 * ScanExcludes owns a `role=status` line; ProfileChips owns the `pack-note`
 * family with `role=alert`; Landing owns the `start-recent` block. None of
 * them is a new surface, and every note carries ⚠ — the fact rides on words
 * and glyph, never on colour alone. */

let host: HTMLDivElement;
let root: Root;

async function mount(node: Parameters<Root["render"]>[0]): Promise<string> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return host.textContent ?? "";
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function stubRoutes(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/rule-packs")) return jsonResponse(404, {});
      if (url.endsWith("/api/footprint")) {
        return jsonResponse(200, {
          root: "/tmp/some-project",
          copies: 0,
          bytes: 0,
          stale: 0,
          ttlHours: 24,
          approx: false,
        });
      }
      return jsonResponse(200, {});
    }),
  );
}

async function mountLanding(lang: Lang): Promise<string> {
  const initial = useStore.getInitialState();
  useStore.setState({ ...initial, prefs: { ...initial.prefs, lang } }, true);
  return await mount(createElement(Landing));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), scanProfile: "standard" }, true);
  stubRoutes();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("the word is on the already-existing surface, in both languages", () => {
  it("exclude field: a corrupt list says so where the count usually lives", async () => {
    localStorage.setItem(EXCLUDE_KEY, '["docs", {"a":');
    const text = await mount(createElement(ScanExcludes, { lang: "en" }));
    expect(text).toContain(tEn("cap.excludeUnreadable"));
    expect(text).toContain("⚠");
    expect(host.querySelector("[role='status']")).toBeTruthy();
  });

  it("exclude field, deutsch", async () => {
    localStorage.setItem(EXCLUDE_KEY, '{"nope":1}');
    const text = await mount(createElement(ScanExcludes, { lang: "de" }));
    expect(text).toContain(tDe("cap.excludeUnreadable"));
    expect(text).toContain("⚠");
  });

  it("exclude field: never-saved still says none without any alarm", async () => {
    const text = await mount(createElement(ScanExcludes, { lang: "en" }));
    expect(text).toContain(tEn("cap.excludeNone"));
    expect(text).not.toContain("⚠");
  });

  it("pack row: a corrupt saved selection speaks in the pack-note slot", async () => {
    localStorage.setItem(PACKS_KEY, '["p1", ');
    const text = await mount(createElement(ProfileChips, { variant: "analyze-panel" }));
    expect(text).toContain(tEn("profile.packsStorageUnreadable"));
    const note = host.querySelector("[data-packs-storage-unreadable]");
    expect(note?.getAttribute("role")).toBe("alert");
    expect(text).not.toContain(tEn("profile.packsUnreadable")); // the network was fine
  });

  it("pack row, deutsch", async () => {
    localStorage.setItem(PACKS_KEY, '["p1", ');
    const initial = useStore.getInitialState();
    useStore.setState({ ...initial, prefs: { ...initial.prefs, lang: "de" } }, true);
    const text = await mount(createElement(ProfileChips, { variant: "analyze-panel" }));
    expect(text).toContain(tDe("profile.packsStorageUnreadable"));
  });

  it("pack row: an honest saved list raises no storage word", async () => {
    localStorage.setItem(PACKS_KEY, '["p1"]');
    const text = await mount(createElement(ProfileChips, { variant: "analyze-panel" }));
    expect(text).not.toContain(tEn("profile.packsStorageUnreadable"));
  });

  it("recent cities: corrupt index is not the silent nothing of never-opened", async () => {
    localStorage.setItem(RECENT_KEY, '[{"id":"a-1","fold');
    const text = await mountLanding("en");
    expect(text).toContain(tEn("landing.recentUnreadable"));
    expect(text).toContain("⚠");
  });

  it("recent cities, deutsch", async () => {
    localStorage.setItem(RECENT_KEY, '{"entries":[[');
    const text = await mountLanding("de");
    expect(text).toContain(tDe("landing.recentUnreadable"));
  });

  it("recent cities: a healthy empty index stays wordless, as before", async () => {
    const text = await mountLanding("en");
    expect(text).not.toContain(tEn("landing.recentUnreadable"));
  });
});

/* ── the four sites of task #8, each with its word on the surface it already
 * has: the footprint block (look), the resident card (names), the panel's
 * verdict notes (browser bucket), the since-last-scan row (anchors). ──────── */

describe("the word where the look lives (Landing footprint block)", () => {
  it("a corrupt saved look is not the nothing of never-chosen — in EN", async () => {
    localStorage.setItem(LOOK_KEY, '{"jacket":1,');
    const text = await mountLanding("en");
    expect(text).toContain(tEn("landing.lookUnreadable"));
    expect(text).toContain("⚠");
    expect(host.querySelector("[data-look-unreadable]")).toBeTruthy();
  });

  it("a corrupt saved look, deutsch", async () => {
    localStorage.setItem(LOOK_KEY, '"not an object"');
    const text = await mountLanding("de");
    expect(text).toContain(tDe("landing.lookUnreadable"));
  });

  it("a healthy saved look raises no storage word", async () => {
    localStorage.setItem(LOOK_KEY, '{"jacket":1,"mark":"dot"}');
    const text = await mountLanding("en");
    expect(text).not.toContain(tEn("landing.lookUnreadable"));
  });
});

describe("the word where the names live (ResidentCard)", () => {
  async function mountCard(lang: Lang): Promise<string> {
    const initial = useStore.getInitialState();
    useStore.setState(
      {
        ...initial,
        cityData: BUCKET_CITY,
        selectedResident: 0,
        residentIdentity: ATLAS,
        prefs: { ...initial.prefs, lang },
      },
      true,
    );
    return await mount(createElement(ResidentCard));
  }

  it("a corrupt names bucket is not 'no names yet' — in EN", async () => {
    localStorage.setItem(NAMES_BUCKET, '{"plot:f-a#0":"At');
    const text = await mountCard("en");
    expect(text).toContain(tEn("resident.namesUnreadable"));
    expect(text).toContain("⚠");
    expect(host.querySelector("[data-resident-names-unreadable]")).toBeTruthy();
  });

  it("a corrupt names bucket, deutsch", async () => {
    localStorage.setItem(NAMES_BUCKET, '[["plot:a","X"]]');
    const text = await mountCard("de");
    expect(text).toContain(tDe("resident.namesUnreadable"));
  });

  it("a never-named project stays wordless", async () => {
    const text = await mountCard("en");
    expect(text).not.toContain(tEn("resident.namesUnreadable"));
    expect(text).not.toContain("⚠");
  });
});

describe("the word where the comparison lives (ContextCard since-last-scan)", () => {
  async function mountCardWithCorruptAnchors(lang: Lang, scanId: string): Promise<string> {
    localStorage.setItem(ANCHOR_KEY, '[{"scanId":"older","sha');
    useStore.setState({ ...useStore.getInitialState(), focusPath: [] }, true);
    useStore.getState().setCityData(city({ analysisId: scanId }));
    useStore.setState({ buildPhase: "built", prefs: { ...useStore.getState().prefs, lang } });
    return await mount(createElement(ContextCard));
  }

  it("unreadable anchor bytes are not claimed as 'no earlier scan' — in EN", async () => {
    const text = await mountCardWithCorruptAnchors("en", "scan-anch-en");
    expect(text).toContain(tEn("ctx.sinceAnchorsUnreadable"));
    expect(text).toContain("⚠");
    expect(text).not.toContain(tEn("ctx.sinceNone"));
    // The bytes the browser could not read are the point of the note.
    expect(preservedUnreadableBytes(ANCHOR_KEY)).toBe('[{"scanId":"older","sha');
  });

  it("unreadable anchor bytes, deutsch", async () => {
    const text = await mountCardWithCorruptAnchors("de", "scan-anch-de");
    expect(text).toContain(tDe("ctx.sinceAnchorsUnreadable"));
  });

  it("a first scan on a clean browser still says none, without alarm", async () => {
    useStore.setState({ ...useStore.getInitialState(), focusPath: [] }, true);
    useStore.getState().setCityData(city({ analysisId: "scan-anch-clean" }));
    useStore.setState({ buildPhase: "built" });
    const text = await mount(createElement(ContextCard));
    expect(text).toContain(tEn("ctx.sinceNone"));
    expect(text).not.toContain(tEn("ctx.sinceAnchorsUnreadable"));
    expect(verifyAnchorsUnreadable("scan-anch-clean")).toBe(false);
  });
});

/* ── the static half of the watch ────────────────────────────────────────────
 * No loader in the CLOSED set may re-grow a `catch → default` without a
 * state distinction; the loaders still OPEN are a named ledger with the exact
 * sites, so the class is countable from this file alone. */

const SRC = (rel: string) => readFileSync(resolve(import.meta.dirname, "../src", rel), "utf8");

const UNCLASSIFIED_CATCH =
  /catch\s*\{[^{}]*return\s+(?:\[\s*\]|\{\s*\}|undefined|DEFAULT[^;{}]*|\{[^{}]*DEFAULT[^{}]*\})/gs;

const CLOSED_FILES = [
  "storageRead.ts",
  "prefs.ts",
  "config/scanProfiles.ts",
  "config/rulePacks.ts",
  "recentCities.ts",
  "epheNames.ts",
  "epheLook.ts",
  "reviews.ts",
  "verify.ts",
];

/** Sites the class had not reached when the prefs round handed the queue over
 *  — task #8 closed all four; the ledger goes red if one re-grows a
 *  `catch → default`, and any NEW unclassified loader in src/ must be named
 *  here before it may pass. */
const OPEN_LEDGER: { file: string; note: string; minHits: number }[] = [];

describe("no closed loader answers a failed read with a default", () => {
  it("nine loaders answer read/absent/unreadable; the open ledger is empty", () => {
    expect(CLOSED_FILES).toHaveLength(9);
    expect(OPEN_LEDGER).toHaveLength(0);
    expect(LOADERS).toHaveLength(8);
  });

  for (const rel of CLOSED_FILES) {
    it(`${rel} carries no catch → default without a state distinction`, () => {
      const offenders = SRC(rel).match(UNCLASSIFIED_CATCH) ?? [];
      expect(offenders).toEqual([]);
    });
  }

  for (const entry of OPEN_LEDGER) {
    it(`${entry.file} (${entry.note}) is still open — and the watch sees it`, () => {
      const hits = SRC(entry.file).match(UNCLASSIFIED_CATCH) ?? [];
      expect(hits.length).toBeGreaterThanOrEqual(entry.minHits);
    });
  }
});

/**
 * THE ONE PUBLIC NUMBER THIS CLASS PRINTS, TIED TO THE DICTIONARY.
 *
 * The README states how many sentences carry the word `unreadable`. A prose
 * count that nothing re-measures is the failure this class exists to close —
 * the writer's memory of the code, not the code — so the sentence is generated
 * from the live key list: add a twelfth reader without a twelfth sentence, or
 * reword the README alone, and the guard goes red from whichever side moved.
 */
const NUMERAL = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
const UNREADABLE_KEYS = Object.keys(DICT).filter((k) => k.includes("Unreadable"));
const README_SRC = readFileSync(resolve(import.meta.dirname, "../../README.md"), "utf8");

describe("the README count of unreadable-word sentences is the dictionary's own", () => {
  it("every key answers in both languages and refuses the empty inference", () => {
    expect(UNREADABLE_KEYS.length).toBeGreaterThanOrEqual(11);
    for (const key of UNREADABLE_KEYS) {
      const entry = DICT[key as keyof typeof DICT];
      expect(entry.en.trim().length).toBeGreaterThan(20);
      expect(entry.de.trim().length).toBeGreaterThan(20);
      expect(entry.de).not.toBe(entry.en);
      expect(`${entry.en} ${entry.de}`).toMatch(
        /not the same as|nothing was deleted|heißt nicht|nichts wurde gelöscht|is kept|bleibt erhalten/i,
      );
    }
  });

  it("the README prints the number the dictionary holds, in words", () => {
    expect(README_SRC).toContain(`${NUMERAL[UNREADABLE_KEYS.length]} sentences`);
  });

  it("positive control — the count is measured, not recited", () => {
    // The wording the README uses must be the one this list generates; a second
    // numeral in the same sentence would let a stale count pass unnoticed.
    const stated = README_SRC.match(/(\w+) sentences, English and German/);
    expect(stated, "the README lost the sentence this guard measures").not.toBeNull();
    expect(stated![1]).toBe(NUMERAL[UNREADABLE_KEYS.length]);
  });
});
