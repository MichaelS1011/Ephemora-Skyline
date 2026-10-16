import { readFileSync } from "node:fs";
import type { CityData } from "../src/city/types";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DICT } from "../src/i18n/dict";
import {
  GROUP_LABELS,
  ROWS,
  bracketStep,
  explain,
  groupOrder,
  resolve,
  rowsByRank,
  type Press,
  type World,
} from "../src/interaction/shortcuts";

/**
 * The list against the handlers.
 *
 * The audit's finding was not that the list was short by taste — it named 20
 * rows while the components handled keys nobody listed (a local measurement script that is not shipped
 * nerve-audit/bericht.md`, D10). So this test reads the real source files,
 * pulls every key they compare a keyboard event against, and demands that the
 * registry knows each one. A binding added in a component without a row here
 * fails the build; a row naming a key its owner file no longer handles fails too.
 */

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/** Files whose keydown handlers are user-facing bindings. */
const HANDLER_FILES = [
  "App.tsx",
  "components/Minimap.tsx",
  "components/SearchBar.tsx",
  "components/ActionBar.tsx",
  "components/CoachMarks.tsx",
  "components/SecurityTour.tsx",
  "components/KeyboardHints.tsx",
  "components/AnalyzePanel.tsx",
  "components/FindingsPanel.tsx",
  "components/ProfileConfirmDialog.tsx",
  "components/ShareStudio.tsx",
  "components/CameraRig.tsx",
  "interaction/KeyEcho.tsx",
];

/**
 * What counts as a key name in a comparison. Literals are taken whole, so a
 * selector like `closest("button, a")` never reads as a binding.
 */
const NAMED = new Set([
  "Escape",
  "Enter",
  "Tab",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);
const PUNCT = new Set([
  " ",
  "[",
  "]",
  "/",
  "\\",
  ";",
  "'",
  '"',
  "`",
  "-",
  "=",
  "?",
  ".",
  ",",
  "|",
  "<",
  ">",
  ":",
]);

function isKeyToken(raw: string): boolean {
  if (NAMED.has(raw)) return true;
  if (/^Key[A-Z]$/.test(raw)) return true;
  if (/^F\d{1,2}$/.test(raw)) return true;
  if (raw.length !== 1) return false;
  return /[A-Za-z0-9]/.test(raw) || PUNCT.has(raw);
}

function normalize(raw: string): string | null {
  const code = /^Key([A-Z])$/.exec(raw);
  if (code?.[1]) return code[1];
  if (raw === " ") return "Space";
  return raw.length === 1 ? raw.toUpperCase() : raw;
}

/**
 * Every literal the file compares a keyboard event against. Restricted to lines
 * that mention `.key` / `.code` / a key set, and to literals that can actually
 * be key names, so selectors like `closest("button, a")` are not mistaken for
 * bindings.
 */
function keysHandled(file: string): string[] {
  const source = readFileSync(SRC + file, "utf8");
  const found = new Set<string>();
  for (const line of source.split("\n")) {
    if (!/\.key\b|\.code\b|_KEYS\b/.test(line)) continue;
    for (const match of line.matchAll(/"([^"]*)"/g)) {
      const literal = match[1] ?? "";
      if (!isKeyToken(literal)) continue;
      const norm = normalize(literal);
      if (norm) found.add(norm);
    }
  }
  return [...found].sort();
}

function registryCodes(): Set<string> {
  const all = new Set<string>();
  for (const row of ROWS) for (const c of row.codes) all.add(c);
  return all;
}

const EMPTY_WORLD: World = {
  hasCity: true,
  focusPath: [],
  buildings: 12,
  blocks: 0,
  selectedFileId: null,
  markedDistrict: null,
  cameraMode: "free",
  triageActive: false,
  triageSize: 4,
  triageOpen: 2,
  tourActive: false,
  constructing: false,
  primerVisible: false,
  hasSearchField: true,
};

const press = (over: Partial<Press> & { key: string }): Press => ({
  code: over.key,
  meta: false,
  ctrl: false,
  typing: false,
  modalOpen: false,
  onCanvas: true,
  ...over,
});

describe("the shortcut registry against the real handlers", () => {
  it("lists every key a component actually handles", () => {
    const listed = registryCodes();
    const missing: string[] = [];
    for (const file of HANDLER_FILES) {
      for (const key of keysHandled(file)) {
        if (!listed.has(key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing, `handled but not listed: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists no key its owner file does not handle", () => {
    const stale: string[] = [];
    for (const row of ROWS) {
      if (!row.owner || row.codes.length === 0) continue;
      const handled = keysHandled(row.owner);
      for (const code of row.codes) {
        if (!handled.includes(code)) stale.push(`${row.id}: ${code} not in ${row.owner}`);
      }
    }
    expect(stale, `listed but not handled: ${stale.join(", ")}`).toEqual([]);
  });

  it("names an owner file that exists and reads the handler from it", () => {
    for (const row of ROWS) {
      if (!row.owner) continue;
      expect(() => readFileSync(SRC + row.owner, "utf8"), row.owner).not.toThrow();
    }
  });

  it("carries both languages for every row and every group", () => {
    for (const row of ROWS) {
      expect(row.text.en.length, row.id).toBeGreaterThan(0);
      expect(row.text.de.length, row.id).toBeGreaterThan(0);
      // German is the surface the user reads; a row that only carries English
      // would show it in a German city.
      expect(/[A-Za-zÄÖÜäöüß]/.test(row.text.de), row.id).toBe(true);
      expect(resolve("de", row.text), row.id).not.toBe(row.text.key);
      expect(resolve("en", row.text), row.id).not.toBe(row.text.key);
    }
    for (const [id, label] of Object.entries(GROUP_LABELS)) {
      expect(resolve("de", label).length, id).toBeGreaterThan(0);
    }
  });

  it("is sorted by how often the user needs it, not by build order", () => {
    const ranks = rowsByRank().map((r) => r.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const order = groupOrder();
    expect(order.indexOf("nav")).toBeLessThan(order.indexOf("camera"));
    expect(order.indexOf("camera")).toBeLessThan(order.indexOf("panels"));
  });

  it("covers the six bindings the audit found missing from the list", () => {
    const ids = ROWS.map((r) => r.id);
    expect(ids).toContain("mapAim"); // minimap arrows
    expect(ids).toContain("mapFly"); // minimap Enter / Space
    expect(ids).toContain("searchWalk"); // arrows in the search field
    expect(ids).toContain("menuWalk"); // arrows in the ••• menu
    expect(ids).toContain("skipBuild"); // Escape skips the build
    expect(ids).toContain("skipPrimer"); // Escape hides the primer
    expect(ids).toContain("menuOpen"); // the skip button's own key story
  });
});

describe("a key the program cannot apply", () => {
  it("answers the bracket pair on a level with nothing on it", () => {
    const text = explain(press({ key: "]" }), {
      ...EMPTY_WORLD,
      buildings: 0,
      blocks: 0,
    });
    expect(text).not.toBeNull();
    const de = resolve("de", text!);
    expect(de).toContain("Esc");
    expect(de.length).toBeGreaterThan(20);
  });

  it("answers p when no triage is running", () => {
    const text = explain(press({ key: "p" }), { ...EMPTY_WORLD, triageActive: false });
    expect(resolve("de", text!)).toContain("n");
  });

  it("answers n when every finding already has a verdict", () => {
    const text = explain(press({ key: "n" }), {
      ...EMPTY_WORLD,
      triageActive: true,
      triageOpen: 0,
    });
    expect(resolve("de", text!)).toContain("p");
  });

  it("answers Enter on the view while nothing is marked", () => {
    const text = explain(press({ key: "Enter", onCanvas: true }), EMPTY_WORLD);
    expect(resolve("de", text!)).toContain("]");
  });

  it("answers the city keys on a landing with no city", () => {
    for (const key of ["[", "]", "/", "n", "p"]) {
      const text = explain(press({ key }), { ...EMPTY_WORLD, hasCity: false });
      expect(text, key).not.toBeNull();
      expect(resolve("de", text!).length).toBeGreaterThan(10);
    }
  });

  it("says nothing when the key DID work", () => {
    // Brackets on a level of buildings: App steps, the world moves.
    expect(explain(press({ key: "]" }), EMPTY_WORLD)).toBeNull();
    // Enter with a marked district or a selected building: KeyEcho acts.
    expect(
      explain(press({ key: "Enter" }), { ...EMPTY_WORLD, markedDistrict: "backend" }),
    ).toBeNull();
    expect(
      explain(press({ key: "Enter" }), { ...EMPTY_WORLD, selectedFileId: "fp:1", buildings: 4 }),
    ).toBeNull();
    // Escape while the primer shows: CoachMarks dismisses it.
    expect(
      explain(press({ key: "Escape" }), { ...EMPTY_WORLD, primerVisible: true, hasCity: true }),
    ).toBeNull();
    // Anything typed belongs to the field.
    expect(explain(press({ key: "]", typing: true }), EMPTY_WORLD)).toBeNull();
    // An unbound key is not a defect: the audit counted stray letters as
    // correctly ignored.
    expect(explain(press({ key: "x" }), EMPTY_WORLD)).toBeNull();
    expect(explain(press({ key: "F" }), EMPTY_WORLD)).toBeNull();
  });

  it("arms the reader for the double Escape at the overview", () => {
    const text = explain(press({ key: "Escape" }), EMPTY_WORLD);
    expect(resolve("de", text!)).toContain("Esc");
  });
});

describe("stepping a level without a mouse", () => {
  const file = (id: string, path: string) => ({
    id,
    name: `${id}.ts`,
    path,
    language: "TypeScript",
    linesOfCode: 50,
    cyclomaticComplexity: 2,
    threatLevel: "low" as const,
    findings: [],
  });

  const dir = (name: string, path: string, detailFiles: unknown[], children: unknown[] = []) => ({
    name,
    path,
    fileCount: detailFiles.length,
    linesOfCode: 50 * detailFiles.length,
    languages: { TypeScript: 50 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children,
    detailFiles,
    remainingFiles: 0,
    districtFiles: [],
  });

  /** A root that holds only districts — the audit's silent case. */
  const city = {
    id: "griff-city",
    repo: { owner: "test", name: "repo", branch: "main", cloneUrl: "", analyzedAt: "" },
    languages: { TypeScript: 50 },
    totalFiles: 2,
    renderedFiles: 2,
    threatScore: 0,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree: dir(
      "",
      "",
      [],
      [
        dir("backend", "backend", [file("fp:backend/a.ts", "backend/a.ts")]),
        dir("frontend", "frontend", [
          file("fp:frontend/b.ts", "frontend/b.ts"),
          file("fp:frontend/c.ts", "frontend/c.ts"),
          file("fp:frontend/d.ts", "frontend/d.ts"),
        ]),
      ],
    ),
    fileConnections: [],
    dirConnections: [],
    meta: {},
  } as unknown as CityData;

  const step = (
    focusPath: string[],
    currentFileId: string | null,
    forward: boolean,
    currentDirPath: string | null = null,
  ) => bracketStep({ cityData: city, focusPath, currentFileId, currentDirPath, forward });

  it("refuses with no city", () => {
    expect(
      bracketStep({
        cityData: null,
        focusPath: [],
        currentFileId: null,
        currentDirPath: null,
        forward: true,
      }),
    ).toEqual({ kind: "none", reason: "no-city" });
  });

  it("steps districts on a level that has no buildings", () => {
    const first = step([], null, true);
    expect(first.kind).toBe("district");
    const second = step([], null, true, first.dirPath ?? null);
    expect(second.kind).toBe("district");
    expect(second.dirPath).not.toBe(first.dirPath);
    // Wrapping back to the start keeps the pair usable in one direction only.
    const back = step([], null, false, second.dirPath ?? null);
    expect(back.dirPath).toBe(first.dirPath);
  });

  it("steps files on a level that has them, forwards and back, and wraps", () => {
    const a = step(["frontend"], null, true);
    expect(a.kind).toBe("file");
    const b = step(["frontend"], a.fileId ?? null, true);
    const c = step(["frontend"], b.fileId ?? null, true);
    expect(new Set([a.fileId, b.fileId, c.fileId]).size).toBe(3);
    expect(step(["frontend"], c.fileId ?? null, true).fileId).toBe(a.fileId);
    expect(step(["frontend"], a.fileId ?? null, false).fileId).toBe(c.fileId);
  });

  it("never mixes the two walks", () => {
    // A level with buildings does not answer with a district, even when one is
    // marked — otherwise the mark and the step would disagree.
    expect(step(["frontend"], null, true, "backend").kind).toBe("file");
  });
});

/**
 * WCAG 2.4.1: the first tab stop of the app must be the skip link, not the 3D
 * stage — a measured walk reached "3D city visualization. Arrow keys turn the
 * camera" before any content. jsdom cannot render App (the R3F canvas has no
 * WebGL), so these guard the source contract the tab order is made of; the
 * live behaviour is proven in a real browser run.
 */
describe("the skip link (WCAG 2.4.1)", () => {
  const app = readFileSync(SRC + "App.tsx", "utf8");

  it("is the first focusable node of the app shell", () => {
    const skip = app.indexOf('className="skip-link');
    expect(skip, "no skip link in App.tsx").toBeGreaterThan(-1);
    // The only JSX before it may be the shell opening and the loading screen
    // (which renders no focusable element); the next real stop is the canvas.
    expect(skip).toBeLessThan(app.indexOf("<LoadingScreen"));
    expect(skip).toBeLessThan(app.indexOf("tabIndex={inCity ? 0 : -1}"));
  });

  it("lands focus on the main content, not into the void", () => {
    expect(app).toContain('href="#main-content"');
    const targets = [...app.matchAll(/id="main-content"/g)];
    expect(targets, "one target per world: the landing wrapper and the city HUD").toHaveLength(2);
    for (const hit of targets) {
      const around = app.slice(Math.max(0, hit.index! - 40), hit.index! + 240);
      expect(around, `target at ${hit.index} cannot take focus`).toContain("tabIndex={-1}");
    }
  });

  it("is hidden visually only — display:none would drop the stop from the tab order", () => {
    const tag = /<a\b[\s\S]*?className="skip-link[^"]*"[\s\S]*?>/.exec(app)?.[0] ?? "";
    expect(tag).toContain("sr-only");
    expect(tag).toContain("focus:not-sr-only");
    expect(tag).toContain("focus:outline-2");
  });

  it("reads both languages from the dictionary", () => {
    expect(DICT["a11y.skipLink"]?.en.trim().length).toBeGreaterThan(0);
    expect(DICT["a11y.skipLink"]?.de.trim().length).toBeGreaterThan(0);
    expect(app).toContain('t(lang, "a11y.skipLink")');
  });
});
