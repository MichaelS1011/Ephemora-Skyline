// @vitest-environment jsdom
/**
 * The panels count things, and at exactly one they said it in the plural.
 * Measured before this file (read-only audit, `.qoder-scratch/skyline-
 * experience-shaper/2026-10-26-plural-batch/dead-one.mjs`): 16 of the 60 `*One`
 * branches in the dictionary were never called, and 11 of those sat behind a
 * count a real person can reach — one finding in a file, one rule past the chip
 * budget, one folder holding one file, one file read of 2 KB.
 *
 * The guard that claims to police this cannot see it: `tests/i18nPlural.test.ts`
 * scans `src/` INCLUDING `i18n/dict.ts`, and `dict.ts` prints every key as its
 * own literal, so "orphan" is structurally always 0. This file drives the real
 * components instead — n = 0, n = 1, n = 2, both languages, one named row per
 * call site — so the next regression is a row, not a vague failure.
 *
 * The expected sentences are written out here, never read back from the
 * dictionary: a table that computed its own expectation from `t()` would pass on
 * the very bug it is meant to catch. The branch the rows pin is the one the
 * dictionary header documents and the entry screen already uses —
 * `t(lang, n === 1 ? "…One" : "…", vars)`. No new key, no new helper.
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Lang } from "../src/i18n";
import { useStore } from "../src/stores/useStore";
import { FindingsPanel } from "../src/components/FindingsPanel";
import { VoxelStructureBlock } from "../src/components/FilePanels";
import { InfoPanel } from "../src/components/InfoPanel";
import { AnalyzePanel } from "../src/components/AnalyzePanel";
import { Tooltip } from "../src/components/Tooltip";
import { ContextCard } from "../src/components/ContextCard";
import { ProfileChips } from "../src/components/ProfileChips";
import { city, dir, file, finding, provenance } from "./helpers/cityFixture";
import { explainDistrictDraw } from "../src/city/layout";
import type { CityData, CityDir } from "../src/city/types";
import type { VoxelSectionSpec } from "../src/city/voxels";

/** The collecting counter `AnalyzePanel` reads; the panel itself stays real. */
const collected = vi.hoisted(() => ({ files: 0, bytes: 0 }));

vi.mock("../src/hooks/useLocalAnalysis", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useLocalAnalysis: () => ({
      state: "collecting",
      notice: "",
      errorMessage: "",
      analysisProgress: 0,
      analysisStage: "collect",
      collected: { files: collected.files, bytes: collected.bytes, total: collected.files },
      pickFolder: () => undefined,
      openAlternativePicker: () => undefined,
      canUseAlternativePicker: false,
      cancel: () => undefined,
      isPicking: false,
      isAnalyzing: false,
    }),
  };
});

// ── the payloads each row counts over ───────────────────────────────────────

/** One building whose findings carry `k` distinct rules. */
const rulesCity = (k: number): CityData => {
  const list = Array.from({ length: k }, (_, i) =>
    finding({
      type: `RULE_${i}`,
      ruleId: `rule_${i}`,
      severity: "P2",
      message: `rule_${i} fired`,
      category: "hygiene",
    }),
  );
  return city({
    files: [file("src/rules.ts", "TypeScript", list)],
    findingsBySeverity: { P0: 0, P1: 0, P2: k },
  });
};

/** A scan that reported `n` findings the drawn list cannot show. */
const undrawnCity = (n: number): CityData =>
  city({
    files: [file("src/a.ts", "TypeScript", [finding({ severity: "P0" })])],
    findingsBySeverity: { P0: 1 + n, P1: 0, P2: 0 },
  });

/** A file whose strata hold exactly `n` code lines. */
const voxelFile = (n: number): ReturnType<typeof file> => {
  const section: VoxelSectionSpec = {
    name: "only",
    kind: "function",
    start: 1,
    end: Math.max(1, n),
    codeLines: n,
    depth: 0,
  };
  return file("src/one.ts", "TypeScript", [], undefined, { sections: [section] });
};

/** A district that holds `n` files, 40 lines each. */
const blockDir = (path: string, n: number): CityDir =>
  dir({
    path,
    detailFiles: Array.from({ length: n }, (_, i) => file(`${path}/a${i}.ts`, "TypeScript", [])),
  });

/** A file whose strata hold exactly `n` sections — the panel shows 24 and counts the rest. */
const sectionedFile = (n: number): ReturnType<typeof file> =>
  file("src/many.ts", "TypeScript", [], undefined, {
    sections: Array.from({ length: n }, (_, i): VoxelSectionSpec => ({
      name: `s${i}`,
      kind: "function",
      start: i * 10 + 1,
      end: i * 10 + 5,
      codeLines: 5,
      depth: 0,
    })),
  });

/**
 * The root card, with the one counter the row is about declared on the folder.
 * `0` is written as absent, because that is what the payload does: a folder with
 * nothing unverified ships no `unverifiedFiles` field at all. The buildings and
 * the declared counter go through ONE `dir()` call — a built district fed back in
 * as `tree` alongside `files` re-declares the file count it was built with.
 */
const rootCardCity = (n: number, which: "unchecked" | "testFindings" | "dataLines"): CityData => {
  const buildings = Array.from({ length: 5 }, (_, i) =>
    file(`src/a${i}.ts`, "TypeScript", which === "testFindings" ? [finding()] : []),
  );
  const declared: Partial<Parameters<typeof dir>[0]> =
    which === "unchecked"
      ? { unverifiedFiles: n > 0 ? n : undefined }
      : which === "testFindings"
        ? { findingsInTests: n > 0 ? n : undefined }
        : { dataLines: n > 0 ? n : undefined, dataLanguages: n > 0 ? { JSON: n } : undefined };
  return city({
    scanProvenance: provenance({}),
    tree: dir({ path: "", name: "", detailFiles: buildings, ...declared }),
  });
};

/** The rule-pack answer, with `n` rules in the one pack the server lists. */
const packsAnswer = (n: number): unknown => ({
  offline: false,
  packs: [
    {
      id: "solo",
      name: "Solo",
      version: "1.0",
      origin: "shipped",
      source: "local",
      license: "MIT",
      categories: [],
      languages: ["TypeScript"],
      ruleCount: n,
      default: false,
    },
  ],
});

// ── mount and read ─────────────────────────────────────────────────────────

let host: HTMLDivElement;
let root: Root;

async function mountAndRead(
  el: ReactElement,
  lang: Lang,
  patch: Record<string, unknown>,
  extract: (node: HTMLElement) => string,
  interact?: (node: HTMLElement) => Promise<void>,
): Promise<string> {
  const initial = useStore.getInitialState();
  useStore.setState(
    {
      ...initial,
      prefs: { ...initial.prefs, lang },
      buildPhase: "built",
      analysisId: null,
      ...patch,
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(el);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (interact) {
    await act(async () => {
      await interact(host);
    });
  }
  const value = extract(host);
  await act(async () => {
    root.unmount();
  });
  host.remove();
  return value;
}

/** The first element whose text matches — the string is the claim, not a class. */
const byText = (node: HTMLElement, re: RegExp): string => {
  const hit = [...node.querySelectorAll("*")]
    .filter((e) => re.test((e.textContent ?? "").trim()) && e.children.length === 0)
    .pop();
  return (hit?.textContent ?? "").trim();
};

/** The text inside the element that carries a given `title` — the hover line is
 *  what the reader reads, and the title is only how the row finds its element. */
const textUnderTitle = (node: HTMLElement, title: string): string => {
  const hit = [...node.querySelectorAll("[title]")].find((e) => e.getAttribute("title") === title);
  return (hit?.textContent ?? "").trim();
};

type Row = {
  id: string;
  site: string;
  /** The `*One` branch this row must reach. */
  one: string;
  /** Produced text at n = 0, 1, 2; "" means the line is not on screen. */
  want: Record<Lang, readonly [string, string, string]>;
  /** Set when the read value is a longer sentence built around the wanted one. */
  prefix?: boolean;
  read: (lang: Lang, n: number) => Promise<string>;
};

const ROWS: Row[] = [
  {
    id: "findings.undrawn — the one finding the view cannot draw",
    site: "frontend/src/components/FindingsPanel.tsx:317",
    one: "findings.undrawnOne",
    want: {
      en: [
        "",
        "1 more sits on a file this view does not draw",
        "2 more sit on files this view does not draw",
      ],
      de: [
        "",
        "1 weiterer liegt auf einer Datei, die diese Ansicht nicht zeichnet",
        "2 weitere liegen auf Dateien, die diese Ansicht nicht zeichnet",
      ],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(FindingsPanel),
        lang,
        { showFindings: true, cityData: undrawnCity(n) },
        (node) => byText(node, /view does not draw|Ansicht nicht zeichnet/),
      ),
  },
  {
    id: "findings.moreRules — one rule past the chip budget",
    site: "frontend/src/components/FindingsPanel.tsx:434",
    one: "findings.moreRulesOne",
    want: {
      en: ["", "+1 rule", "+2 rules"],
      de: ["", "+1 Regel", "+2 Regeln"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(FindingsPanel),
        lang,
        { showFindings: true, cityData: rulesCity(8 + n) },
        (node) => textUnderTitle(node, t(lang, "findings.moreRulesTitle")),
      ),
  },
  {
    id: "findings.countTitle — a file with one finding",
    site: "frontend/src/components/FindingsPanel.tsx:523",
    one: "findings.countTitleOne",
    want: {
      en: ["", "1 finding", "2 findings"],
      de: ["", "1 Fund", "2 Funde"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(FindingsPanel),
        lang,
        { showFindings: true, cityData: rulesCity(n) },
        (node) => {
          const hit = node.querySelector(".finding-count");
          return (hit?.getAttribute("title") ?? "").trim();
        },
      ),
  },
  {
    id: "panel.voxelLegend — a file that is one line",
    site: "frontend/src/components/FilePanels.tsx:82",
    one: "panel.voxelLegendOne",
    want: {
      en: [
        "1 voxel = 1 code line · 0 voxels",
        "1 voxel = 1 code line · 1 voxel",
        "1 voxel = 1 code line · 2 voxels",
      ],
      // German spells Voxel the same in one and in many: the branch is a no-op
      // here by design, and the row says so instead of pretending a change.
      de: [
        "1 Voxel = 1 Codezeile · 0 Voxel",
        "1 Voxel = 1 Codezeile · 1 Voxel",
        "1 Voxel = 1 Codezeile · 2 Voxel",
      ],
    },
    read: (lang, n) =>
      mountAndRead(createElement(VoxelStructureBlock, { file: voxelFile(n) }), lang, {}, (node) =>
        textUnderTitle(node, t(lang, "panel.voxelLegendTitle")),
      ),
  },
  {
    id: "panel.moreFailures — the fourth failing test",
    site: "frontend/src/components/InfoPanel.tsx:716",
    one: "panel.moreFailuresOne",
    want: {
      en: ["", "+ 1 more failure", "+ 2 more failures"],
      de: ["", "+ 1 weiterer Fehler", "+ 2 weitere Fehler"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(InfoPanel),
        lang,
        {
          cityData: city({ files: [file("src/a.ts", "TypeScript", [finding()])] }),
          selectedUnit: { kind: "file", id: "f-src/a.ts" },
          testResults: {
            "src/a.ts": {
              path: "src/a.ts",
              status: "failed",
              tests: 10,
              failures: Array.from({ length: 3 + n }, (_, i) => ({
                name: `t${i}`,
                message: `boom ${i}`,
              })),
            },
          },
        },
        (node) => byText(node, /more failure|weiterer Fehler|weitere Fehler/),
      ),
  },
  {
    id: "analyze.filesBytes — the first file read",
    site: "frontend/src/components/AnalyzePanel.tsx:229",
    one: "analyze.filesBytesOne",
    want: {
      en: ["", "1 file · 2 KB", "2 files · 2 KB"],
      de: ["", "1 Datei · 2 KB", "2 Dateien · 2 KB"],
    },
    read: (lang, n) => {
      collected.files = n;
      collected.bytes = 2048;
      return mountAndRead(
        createElement(AnalyzePanel),
        lang,
        {},
        (node) => byText(node, /· \d+ KB$/),
        async (node) => {
          (node.querySelector<HTMLButtonElement>(".analyze-trigger") ?? undefined)?.click();
        },
      );
    },
  },
  {
    id: "tooltip.folderSubtitle — a folder that holds one file",
    site: "frontend/src/components/Tooltip.tsx:127",
    one: "tooltip.folderSubtitleOne",
    want: {
      en: ["folder · 0 files · 0 LOC", "folder · 1 file · 40 LOC", "folder · 2 files · 80 LOC"],
      de: [
        "Ordner · 0 Dateien · 0 LOC",
        "Ordner · 1 Datei · 40 LOC",
        "Ordner · 2 Dateien · 80 LOC",
      ],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(Tooltip),
        lang,
        {
          cityData: city({ tree: dir({ path: "", name: "", children: [blockDir("src/app", n)] }) }),
          hoveredId: "block:src/app",
        },
        (node) => byText(node, /^(folder|Ordner) · /),
      ),
  },
  {
    id: "ctx.unchecked — one file nobody looked at",
    site: "frontend/src/components/ContextCard.tsx:104",
    one: "ctx.uncheckedOne",
    want: {
      en: ["", "1 of 5 files here was never checked", "2 of 5 files here were never checked"],
      de: ["", "1 von 5 Dateien hier wurde nie geprüft", "2 von 5 Dateien hier wurden nie geprüft"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(ContextCard),
        lang,
        { cityData: rootCardCity(n, "unchecked") },
        (node) => textUnderTitle(node, t(lang, "ctx.uncheckedTip")),
      ),
  },
  {
    id: "ctx.testFindings — one finding in test code",
    site: "frontend/src/components/ContextCard.tsx:113",
    one: "ctx.testFindingsOne",
    want: {
      en: ["", "1 of 5 findings was found in test code", "2 of 5 findings were found in test code"],
      de: ["", "1 von 5 Funden stammt aus Testcode", "2 von 5 Funden stammen aus Testcode"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(ContextCard),
        lang,
        { cityData: rootCardCity(n, "testFindings") },
        (node) => textUnderTitle(node, t(lang, "ctx.testTip")),
      ),
  },
  {
    id: "ctx.dataLines — one line of data",
    site: "frontend/src/components/ContextCard.tsx:244",
    one: "ctx.dataLinesOne",
    want: {
      en: ["", "1 line of data (JSON)", "2 lines of data (JSON)"],
      de: ["", "1 Zeile Daten (JSON)", "2 Zeilen Daten (JSON)"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(ContextCard),
        lang,
        { cityData: rootCardCity(n, "dataLines") },
        (node) => textUnderTitle(node, t(lang, "ctx.dataLinesTip")),
      ),
  },
  {
    id: "profile.packTip — a pack that ships one rule",
    site: "frontend/src/components/ProfileChips.tsx:127",
    one: "profile.packTipOne",
    // The hover line continues with the pack's origin and its classes, so this
    // row compares the counted sentence the tip starts with.
    prefix: true,
    want: {
      en: [
        "0 rules · source: local · license: MIT · version 1.0",
        "1 rule · source: local · license: MIT · version 1.0",
        "2 rules · source: local · license: MIT · version 1.0",
      ],
      de: [
        "0 Regeln · Quelle: local · Lizenz: MIT · Version 1.0",
        "1 Regel · Quelle: local · Lizenz: MIT · Version 1.0",
        "2 Regeln · Quelle: local · Lizenz: MIT · Version 1.0",
      ],
    },
    read: async (lang, n) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              json: async () => packsAnswer(n),
              headers: { get: () => null },
            }) as unknown as Response,
        ),
      );
      return mountAndRead(
        createElement(ProfileChips, { variant: "analyze-panel" }),
        lang,
        {},
        (node) => {
          const hit = [...node.querySelectorAll("[title]")].find((e) =>
            /source: |Quelle: /.test(e.getAttribute("title") ?? ""),
          );
          return (hit?.getAttribute("title") ?? "").trim();
        },
      );
    },
  },
  {
    id: "panel.moreSections — the twenty-fifth section",
    site: "frontend/src/components/FilePanels.tsx:205",
    one: "panel.moreSectionsOne",
    want: {
      en: ["", "+ 1 more section", "+ 2 more sections"],
      de: ["", "+ 1 weiterer Abschnitt", "+ 2 weitere Abschnitte"],
    },
    read: (lang, n) =>
      mountAndRead(
        createElement(VoxelStructureBlock, { file: sectionedFile(24 + n) }),
        lang,
        {},
        (node) => byText(node, /more section|weiterer Abschnitt|weitere Abschnitte/),
      ),
  },
  {
    id: "layout.drawnHere — one building drawn from five files",
    site: "frontend/src/city/layout.ts:1210",
    one: "layout.drawnHereOne",
    // Pure sentence builder, no DOM: the row feeds the mapper its own numbers —
    // a folder that declares five files and ships `n` of them as buildings
    // folds the rest under the cap, so the first line is always the one read.
    want: {
      en: [
        "0 of 5 files here stand as buildings — a folder draws at most 3, the rest share one podium marker.",
        "1 of 5 files here stands as a building — a folder draws at most 3, the rest share one podium marker.",
        "2 of 5 files here stand as buildings — a folder draws at most 3, the rest share one podium marker.",
      ],
      de: [
        "0 von 5 Dateien hier stehen als Gebäude — ein Ordner zeichnet höchstens 3, der Rest teilt sich einen Sockel-Marker.",
        "1 von 5 Dateien hier steht als Gebäude — ein Ordner zeichnet höchstens 3, der Rest teilt sich einen Sockel-Marker.",
        "2 von 5 Dateien hier stehen als Gebäude — ein Ordner zeichnet höchstens 3, der Rest teilt sich einen Sockel-Marker.",
      ],
    },
    read: async (lang, n) =>
      explainDistrictDraw(
        dir({
          path: "src/app",
          fileCount: 5,
          detailFiles: Array.from({ length: n }, (_, i) =>
            file(`src/app/a${i}.ts`, "TypeScript", []),
          ),
        }),
        { skylineTowers: 1, buildingsPerDirectory: 3 },
        lang,
      )[0] ?? "",
  },
];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  // jsdom has no media queries. The card asks one before it renders, so the
  // desktop answer is installed once for every row: nothing here is about width.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  // Nothing in these panels should be reaching the network; a call that happens
  // anyway answers "no packs" rather than hanging on a real socket.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({}),
          headers: { get: () => null },
        }) as unknown as Response,
    ),
  );
});

afterEach(async () => {
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("one is said as one, at every count line the panels ship", () => {
  for (const row of ROWS) {
    for (const lang of ["en", "de"] as const) {
      it(`${row.id} [${lang}]`, async () => {
        const seen: string[] = [];
        for (const n of [0, 1, 2]) {
          seen.push(await row.read(lang, n));
        }
        const want = row.want[lang];
        if (row.prefix) {
          expect(
            seen,
            `${row.site} — ${row.one} opens with ${JSON.stringify(want)} at n = 0, 1, 2 in "${lang}", the screen said ${JSON.stringify(seen)}`,
          ).toEqual(want.map((w) => expect.stringContaining(w)));
        } else {
          expect(
            seen,
            `${row.site} — ${row.one} says ${JSON.stringify(want)} at n = 0, 1, 2 in "${lang}", the screen said ${JSON.stringify(seen)}`,
          ).toEqual([...want]);
        }
      });
    }
  }
});
