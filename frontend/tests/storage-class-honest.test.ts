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
import { ScanExcludes } from "../src/components/ScanExcludes";
import { ProfileChips } from "../src/components/ProfileChips";
import { Landing } from "../src/components/Landing";
import { useStore } from "../src/stores/useStore";
import { t as tDict, type Lang } from "../src/i18n";

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
}

/**
 * The three loaders this round closed, as ONE table — the tally the task
 * asks for: which loader answers which of the three states, in cells that can
 * be counted (3 loaders x 5 cells below). `wrongShape` is the row that used to
 * be the quietest: bytes that parse but are not what the loader stores — the
 * old code called that "empty", and the next save called it "gone".
 */
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
    expect(c.defaultValue()).toEqual([]);
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
];

/** Sites the class has NOT reached yet — each one is a queued round, and this
 *  ledger going red means the site was closed without updating it. */
const OPEN_LEDGER: { file: string; note: string; minHits: number }[] = [
  { file: "reviews.ts", note: "loadReviews:27 browser copy, per-bucket", minHits: 1 },
  { file: "epheNames.ts", note: "loadEpheNames:114, per-bucket", minHits: 1 },
  { file: "epheLook.ts", note: "readEpheLook:42,:54", minHits: 1 },
  { file: "verify.ts", note: "verifyAnchorScannedAt:136 and read:155", minHits: 2 },
];

describe("no closed loader answers a failed read with a default", () => {
  it("five closed loaders answer read/absent/unreadable; four open sites are a named ledger", () => {
    expect(CLOSED_FILES).toHaveLength(5);
    expect(OPEN_LEDGER).toHaveLength(4);
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
