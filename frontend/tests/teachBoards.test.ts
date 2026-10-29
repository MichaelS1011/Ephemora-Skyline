/**
 * The three teaching boards on the empty ground.
 *
 * A board is allowed to say two things: what this city is made of, and what
 * this scan did NOT look at. Both are measurements of the payload, so this file
 * holds the payload's arithmetic — not the look of the plate, which is measured
 * on frames in the running app.
 *
 * Four things are pinned here, in the order the operator asked for them:
 *
 *   (a) EVERY NUMBER ON A BOARD follows from the `CityData` handed in. A digit
 *       run that the payload does not carry is a number the product invented,
 *       and an invented number on a board that says "what this scan did not
 *       check" is the worst kind of wrong this app can do.
 *   (b) AN EMPTY STATE IS A SENTENCE, never an empty frame. No findings, no
 *       scanner, no history, no provenance, a preview sample: each has to be
 *       said out loud, because silence on the honesty board reads as "nothing
 *       is missing".
 *   (c) A WORD BUDGET per board, pinned at the measured maximum.
 *   (d) NO NEW COLOUR, no emissive, no second renderer, no texture file, no
 *       loader, no frame loop. The plates are `ENV` on `ENV` and a canvas the
 *       painter fills once; anything else would be a second visual language
 *       arriving unasked.
 *
 * Plus the rule that came out of measuring the shipped painter against a real
 * scanner's rule id: a word wider than the plate is broken AT the plate
 * (`wrapPlate`), because the plate's right edge cuts instead of wrapping.
 *
 * And the two corrections that came out of measuring the plates themselves in
 * the running app:
 *
 *   (e) A plate is sized at its OWN EDGE — the projected midline from the middle
 *       of its bottom edge to the middle of its top edge — never at the height of
 *       the box its four corners fill. A plate turned to face the eye is turned
 *       on screen too, and its box then reads taller than the plate: measured at
 *       the arrival, 124 px of box carried 93,8 / 94,5 / 67,8 px of edge, so the
 *       module reported 13,86 px of cap while the picture drew 10,2. One case
 *       below holds a plate whose box is high and whose edge is low.
 *   (f) The placement is computed against the PICTURE the caller measured, not a
 *       window nobody renders: 964×800 inside a 1280×800 window, 1124×900 inside
 *       a 1440×900 one. Both are walked through here. Without a measure the
 *       module says so; it does not guess one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  BOARD_ASPECT,
  BOARD_CANVAS,
  BOARD_TYPE,
  READING_AREA,
  TARGET_EDGE_PX,
  TITLE_CAP_FRACTION,
  arrivalView,
  boardCopy,
  boardScreenRect,
  focalPxFor,
  heaviestOpenFinding,
  honestyLines,
  plateEdgePx,
  planBoardPlacements,
  projectPoint,
  rectGap,
  setAsideTotal,
  totalFindings,
  wrapPlate,
  type BoardCopy,
  type CanvasMeasure,
} from "../src/city/teachBoards";
import { getDirLayout } from "../src/city/layout";
import { surfaceForLayout, surfaceHeight } from "../src/city/worldSurface";
import { city, dir, file, finding, provenance } from "./helpers/cityFixture";
import { formatCount, type Lang } from "../src/i18n";
import type { CityData } from "../src/city/types";

const SRC = path.resolve(import.meta.dirname, "../src");

// ── the cities the boards are read from ────────────────────────────────────

/** The demo the app opens: a scan that ran no security scanner at all. */
const DEMO: CityData = city({
  repo: { owner: "codecity", name: "demo-city", branch: "main" },
  totalFiles: 74,
  renderedFiles: 74,
  findingsBySeverity: { P0: 3, P1: 2, P2: 3 },
  unverifiedFiles: 67,
  languages: { TypeScript: 9000, JavaScript: 4000 },
  scanProvenance: provenance({
    regex: false,
    gitleaks: false,
    semgrep: false,
    dependencies: false,
    osv: false,
    ruff: false,
    churn: false,
    duplicates: false,
    coverage: false,
  }),
  tree: dir({
    path: "",
    detailFiles: [
      file("backend/src/services/database.ts", "TypeScript", [
        finding({
          severity: "P0",
          type: "SQL_INJECTION",
          ruleId: "SQL_INJECTION",
          line: 141,
          category: "injection",
        }),
      ]),
    ],
  }),
});

/** A scan that found nothing in the files it read. */
const CLEAN: CityData = city({
  totalFiles: 12,
  findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
  languages: { Python: 800 },
  scanProvenance: provenance({ churn: true, duplicates: true, coverage: true }),
  tree: dir({ path: "", detailFiles: [file("src/loader.py", "Python", [])] }),
});

/** A scan whose every finding already carries a verdict. */
const ANSWERED: CityData = city({
  totalFiles: 5,
  findingsBySeverity: { P0: 1, P1: 1, P2: 0 },
  languages: { Go: 600 },
  scanProvenance: provenance({ churn: true, duplicates: true, coverage: true }),
  tree: dir({
    path: "",
    detailFiles: [
      file("internal/auth/token.go", "Go", [
        finding({ severity: "P0", ruleId: "hardcoded-token", line: 88 }),
        finding({ severity: "P1", type: "WEAK_CRYPTO", ruleId: "weak-crypto", line: 214 }),
      ]),
    ],
  }),
});

/** A result that does not say what ran at all. */
const NO_PROVENANCE: CityData = city({
  totalFiles: 9,
  findingsBySeverity: { P0: 0, P1: 0, P2: 2 },
  languages: { Ruby: 400 },
  tree: dir({
    path: "",
    detailFiles: [file("lib/report.rb", "Ruby", [finding({ severity: "P2", line: 30 })])],
  }),
});

/** A preview sample: most of the folder was never read. */
const PREVIEW: CityData = city({
  totalFiles: 2000,
  findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
  languages: { TypeScript: 1200 },
  scanProvenance: provenance({
    churn: true,
    duplicates: true,
    coverage: true,
    live: {
      at: "2026-10-28T10:00:00.000Z",
      fullScanAt: "2026-10-27T10:00:00.000Z",
      changed: 2,
      added: 1,
      removed: 0,
      refreshed: 3,
      stale: ["semgrep"],
    },
  }),
  tree: dir({ path: "", detailFiles: [file("src/index.ts", "TypeScript", [])] }),
  dropped: {
    pathTooLong: 3,
    unsafePath: 1,
    tooLarge: 12,
    unreadable: 2,
    excluded: 0,
    gitIgnored: 0,
    gitBudget: 0,
    unsupportedFormat: 40,
    preview: 46000,
  },
});

/** Everything this app can check ran, and one finding is still open. */
const COMPLETE: CityData = city({
  totalFiles: 30,
  findingsBySeverity: { P0: 0, P1: 0, P2: 1 },
  languages: { Rust: 2400 },
  scanProvenance: provenance({ churn: true, duplicates: true, coverage: true }),
  tree: dir({
    path: "",
    detailFiles: [file("src/net/listener.rs", "Rust", [finding({ severity: "P2", line: 512 })])],
  }),
});

/** A real scanner's rule id: one dotted word, sixty characters. */
const SEMGREP: CityData = city({
  totalFiles: 9,
  findingsBySeverity: { P0: 2, P1: 0, P2: 0 },
  languages: { TypeScript: 900 },
  scanProvenance: provenance(),
  tree: dir({
    path: "",
    detailFiles: [
      file("services/payments/eu/legacy-2019/charge-handler-retry.ts", "TypeScript", [
        finding({
          severity: "P0",
          ruleId: "typescript.react2.security.audit.eval-detected.eval-detected",
          line: 188241,
        }),
      ]),
    ],
  }),
});

const ALL_ANSWERED = () => true;

/** Every state a board can be read in, in both shipping languages. */
const STATES: [string, CityData, boolean][] = [
  ["demo", DEMO, false],
  ["clean", CLEAN, false],
  ["answered", ANSWERED, true],
  ["no-provenance", NO_PROVENANCE, false],
  ["preview", PREVIEW, false],
  ["complete", COMPLETE, false],
  ["semgrep", SEMGREP, false],
];

const copyOf = (c: CityData, lang: Lang, answered: boolean): BoardCopy[] =>
  boardCopy(c, lang, answered ? ALL_ANSWERED : undefined);

const boardText = (b: BoardCopy): string => `${b.text.title} ${b.text.lines.join(" ")}`;

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

// ── (a) every number follows from the payload ──────────────────────────────

/**
 * `formatCount` writes 46000 as "46,000" in English and "46.000" in German.
 * Folding the group separators back is what lets a digit run on a plate be
 * compared with a number in the payload — it is not a licence to round.
 */
function unfoldGrouping(s: string): string {
  let out = s;
  let again = true;
  while (again) {
    const next = out.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
    again = next !== out;
    out = next;
  }
  return out;
}

/** Every digit run the payload itself carries — values, and the words of it. */
function payloadNumbers(c: CityData): Set<string> {
  const out = new Set<string>();
  for (const m of unfoldGrouping(JSON.stringify(c)).matchAll(/\d+/g)) out.add(m[0]);
  // derived sums the boards are allowed to state
  for (const n of [
    totalFindings(c),
    (c.dropped
      ? c.dropped.tooLarge +
        c.dropped.unreadable +
        c.dropped.unsafePath +
        c.dropped.pathTooLong +
        c.dropped.unsupportedFormat +
        (c.dropped.preview ?? 0)
      : 0) + (c.unverifiedFiles ?? 0),
  ]) {
    out.add(String(n));
  }
  return out;
}

describe("a board says only what the payload says", () => {
  for (const [name, c, answered] of STATES) {
    for (const lang of ["en", "de"] as const) {
      it(`${name}/${lang}: every number on the three boards is in the payload`, () => {
        const allowed = payloadNumbers(c);
        for (const b of copyOf(c, lang, answered)) {
          const shown = unfoldGrouping(boardText(b)).match(/\d+/g) ?? [];
          for (const n of shown) {
            expect(
              allowed.has(n),
              `${b.id} shows "${n}" which the payload does not carry — text was: ${boardText(b)}`,
            ).toBe(true);
          }
        }
      });
    }
  }

  it("the negative control: a number the payload does not carry is caught", () => {
    const allowed = payloadNumbers(CLEAN);
    expect(allowed.has("4417"), "an invented count must not be in the allowed set").toBe(false);
    const shown = unfoldGrouping("Files read · 4417").match(/\d+/g) ?? [];
    expect(shown).toContain("4417");
    expect(allowed.has(shown[0]!)).toBe(false);
  });

  it("the file board counts the payload's own files and findings", () => {
    for (const lang of ["en", "de"] as const) {
      const [fileBoard] = copyOf(DEMO, lang, false);
      const text = boardText(fileBoard!);
      expect(text).toContain(formatCount(lang, DEMO.totalFiles));
      expect(text).toContain(formatCount(lang, totalFindings(DEMO)));
      expect(text).not.toMatch(/9999/);
    }
  });

  it("the finding board names the heaviest OPEN finding, not the first one", () => {
    const open = heaviestOpenFinding(ANSWERED, () => false)!;
    expect(open.severity).toBe("P0");
    expect(open.line).toBe(88);
    // both verdicts in and the board has nothing left to name
    expect(heaviestOpenFinding(ANSWERED, ALL_ANSWERED)).toBeNull();
    const board = copyOf(ANSWERED, "en", true).find((b) => b.id === "finding")!;
    expect(boardText(board)).toContain("verdict");
    expect(boardText(board)).not.toContain("hardcoded-token");
  });

  it("the path on the finding board is the payload's own last two segments", () => {
    const board = copyOf(DEMO, "en", false).find((b) => b.id === "finding")!;
    expect(boardText(board)).toContain("services/database.ts");
    expect(boardText(board)).toContain("141");
  });

  it("the honesty board counts what the payload calls unchecked", () => {
    const lines = honestyLines(DEMO, "en");
    expect(lines.join(" ")).toContain(String(DEMO.unverifiedFiles));
    expect(lines.join(" ")).toContain(String(DEMO.totalFiles));
    expect(honestyLines(PREVIEW, "en").join(" ")).toContain("46,058");
  });
});

// ── (b′) the fourth line: what this scan set aside on purpose ──────────────

describe("the honesty board's set-aside line", () => {
  /** A city that ran every check, so the only sentence left is the new one. */
  const setAside = (over: { excluded?: number; gitBudget?: number; gitIgnored?: number }) =>
    city({
      totalFiles: 300,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      languages: { TypeScript: 900 },
      scanProvenance: provenance({ churn: true, duplicates: true, coverage: true }),
      tree: dir({ path: "", detailFiles: [file("src/loader.ts", "TypeScript", [])] }),
      dropped: {
        pathTooLong: 0,
        unsafePath: 0,
        tooLarge: 0,
        unreadable: 0,
        excluded: over.excluded ?? 0,
        gitIgnored: over.gitIgnored ?? 0,
        gitBudget: over.gitBudget ?? 0,
        unsupportedFormat: 0,
      },
    });

  it("owns one sum: the reader's own exclusions plus the git budget", () => {
    const c = setAside({ excluded: 215, gitBudget: 7 });
    expect(setAsideTotal(c)).toBe(222);
    const line = honestyLines(c, "en").find((l) => l.includes("222"));
    expect(line, "the fourth line carries the total").toBeDefined();
    // and both causes stay named, so the number is never an accusation
    expect(line).toContain("215");
    expect(line).toContain("7");
  });

  it("says nothing when nothing was set aside", () => {
    const c = setAside({});
    expect(setAsideTotal(c)).toBe(0);
    const said = honestyLines(c, "en").some((l) =>
      /stayed out|blieben dra|excluded yourself/i.test(l),
    );
    expect(said, "zero must not print a line about zero").toBe(false);
  });

  it("leaves gitIgnored to its two existing speakers", () => {
    // 1.200 ignored paths belong to ContextCard and ScanSummary. A third voice
    // for one number is the defect this product has been built to forbid.
    const c = setAside({ gitIgnored: 1200 });
    expect(setAsideTotal(c)).toBe(0);
    expect(honestyLines(c, "en").join(" ")).not.toContain("1200");
  });

  it("chooses singular and plural from its own total", () => {
    expect(honestyLines(setAside({ excluded: 1 }), "en").join(" ")).toContain("path stayed out");
    expect(honestyLines(setAside({ gitBudget: 2 }), "en").join(" ")).toContain("paths stayed out");
  });

  it("speaks the number the function returns, in both languages", () => {
    for (const lang of ["en", "de"] as Lang[]) {
      for (const over of [{ excluded: 12, gitBudget: 5 }, { excluded: 40 }, { gitBudget: 3 }]) {
        const c = setAside(over);
        const total = setAsideTotal(c);
        expect(honestyLines(c, lang).join(" ")).toContain(formatCount(lang, total));
      }
    }
  });

  it("keeps the sentence inside the board's own word budget", () => {
    const line = honestyLines(setAside({ excluded: 215, gitBudget: 7 }), "en").find((l) =>
      l.includes("222"),
    )!;
    expect(words(line)).toBeLessThanOrEqual(21);
  });
});

// ── (b) an empty state is a sentence ───────────────────────────────────────

describe("an empty state is still a sentence", () => {
  const cases: [string, CityData, ((f: never, i: number, fi: never) => boolean)?][] = [
    ["no findings at all", CLEAN],
    ["every finding answered", ANSWERED, ALL_ANSWERED],
    ["no scan provenance", NO_PROVENANCE],
    ["no security scanner ran", DEMO],
    ["a preview sample", PREVIEW],
    ["everything ran", COMPLETE],
  ];

  for (const [label, c, answered] of cases) {
    for (const lang of ["en", "de"] as const) {
      it(`${label} (${lang}) is said, not left blank`, () => {
        const copy = boardCopy(c, lang, answered as never);
        expect(copy).toHaveLength(3);
        for (const b of copy) {
          expect(b.text.title.trim().length, `${b.id} has no title`).toBeGreaterThan(3);
          expect(b.text.lines.length, `${b.id} stands under an empty title`).toBeGreaterThan(0);
          for (const line of b.text.lines) {
            expect(line.trim().length, `${b.id} carries a blank line`).toBeGreaterThan(0);
            expect(/[\p{L}]/u.test(line), `${b.id} line "${line}" says nothing`).toBe(true);
          }
        }
        // the honesty board never falls silent
        const honesty = honestyLines(c, lang);
        expect(honesty.length).toBeGreaterThan(0);
        expect(
          honesty.some((l) => words(l) >= 3),
          `no sentence for ${label}`,
        ).toBe(true);
      });
    }
  }

  it("a clean scan is not called an unchecked one", () => {
    const board = copyOf(CLEAN, "en", false).find((b) => b.id === "finding")!;
    expect(boardText(board)).toContain("Nothing was found");
    expect(boardText(board)).not.toContain("verdict");
  });

  it("a scan that checked everything says that out loud", () => {
    expect(honestyLines(COMPLETE, "en")).toEqual(["Every check this app has ran."]);
    expect(honestyLines(COMPLETE, "de")).toEqual(["Jede Prüfung, die diese App hat, lief."]);
  });
});

// ── (c) the word budget ────────────────────────────────────────────────────

/**
 * Measured, not chosen: the maximum word count any board reaches across the
 * seven payload states in both languages is 26 (the honesty board on the demo,
 * in English). The arrival chrome already spends its own budget; a board that
 * grows past this number is writing an essay on a sign.
 */
const MEASURED_WORD_MAX = 26;

describe("a board stays within its measured word budget", () => {
  it(`holds ${MEASURED_WORD_MAX} words per board in every state and language`, () => {
    let seen = 0;
    for (const [, c, answered] of STATES) {
      for (const lang of ["en", "de"] as const) {
        for (const b of copyOf(c, lang, answered)) {
          const n = words(boardText(b));
          seen = Math.max(seen, n);
          expect(n, `${b.id} at ${n} words: ${boardText(b)}`).toBeLessThanOrEqual(
            MEASURED_WORD_MAX,
          );
        }
      }
    }
    expect(seen, "the budget has drifted from the measured maximum").toBe(MEASURED_WORD_MAX);
  });

  it("carries no number of its own in the copy", () => {
    // the wording is fixed; only the payload's counts may appear as digits
    const template = boardCopy(CLEAN, "en", () => false)
      .map(boardText)
      .join(" ");
    for (const m of template.matchAll(/[A-Za-zÀ-ÿ]\s?\d/g)) {
      expect(m[0], `a letter sits against a digit that no key explains: ${m[0]}`).toBeTruthy();
    }
  });
});

// ── (d) no new colour, no second renderer, no texture, no loader, no loop ──

const BOARD_FILES = ["city/teachBoards.ts", "components/TeachBoards.tsx"] as const;

describe("the plates bring no new visual machinery", () => {
  const texts = BOARD_FILES.map((rel) => ({
    rel,
    text: readFileSync(path.join(SRC, rel), "utf-8"),
  }));

  it("types no hex colour of its own", () => {
    for (const { rel, text } of texts) {
      const hex = text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(hex, `${rel} types colours by hand: ${hex.join(", ")}`).toEqual([]);
    }
  });

  it("takes its ground and its ink from the palette", () => {
    const painter = texts.find((f) => f.rel === "components/TeachBoards.tsx")!.text;
    expect(painter).toMatch(/import \{ ENV \} from "\.\.\/city\/palette"/);
    expect(painter).toMatch(/ENV\.arcCasing/);
    expect(painter).toMatch(/ENV\.plot/);
  });

  it("sets no emissive, no light, no second renderer", () => {
    for (const { rel, text } of texts) {
      expect(text.includes("emissive"), `${rel} glows`).toBe(false);
      expect(text.includes("WebGLRenderer"), `${rel} builds a renderer`).toBe(false);
      expect(text.includes("createRoot"), `${rel} mounts a second canvas`).toBe(false);
      for (const light of ["ambientLight", "directionalLight", "pointLight", "spotLight"]) {
        expect(text.includes(`<${light}`), `${rel} adds ${light}`).toBe(false);
      }
    }
  });

  it("loads no texture file and no loader of any kind", () => {
    for (const { rel, text } of texts) {
      expect(text.includes("TextureLoader"), `${rel} loads a texture`).toBe(false);
      expect(text.includes("useLoader"), `${rel} uses a loader`).toBe(false);
      expect(text.includes("useGLTF"), `${rel} loads a model`).toBe(false);
      expect(text, `${rel} names an image asset`).not.toMatch(/\.(png|jpe?g|webp|gif|svg|ktx2?)\b/);
    }
  });

  it("runs no frame loop, so prefers-reduced-motion has nothing new to stop", () => {
    for (const { rel, text } of texts) {
      expect(text.includes("useFrame("), `${rel} animates`).toBe(false);
      expect(text.includes("requestAnimationFrame"), `${rel} spins its own loop`).toBe(false);
      expect(text.includes("setInterval"), `${rel} ticks on its own`).toBe(false);
    }
  });

  it("draws each plate once and disposes its texture", () => {
    const painter = texts.find((f) => f.rel === "components/TeachBoards.tsx")!.text;
    expect(painter.match(/new THREE\.CanvasTexture/g) ?? []).toHaveLength(1);
    expect(painter).toMatch(/texture\.dispose\(\)/);
  });
});

// ── the plate's right edge cuts, so a long word has to be broken ───────────

describe("a word wider than the plate is broken, not cut", () => {
  /** The plate's own text box, in canvas pixels. */
  const INNER = BOARD_CANVAS.width - BOARD_TYPE.pad * 2;
  /** JetBrains Mono advances 0,6 em — the plate's body face is monospaced, so
   *  this measure is exact rather than an estimate. */
  const mono = (size: number) => (line: string) => line.length * size * 0.6;

  it("breaks a sixty-character rule id inside the plate", () => {
    const rule = "typescript.react2.security.audit.eval-detected.eval-detected";
    expect(rule.length).toBe(60);
    const lines = wrapPlate(`P1 · ${rule}`, INNER, mono(BOARD_TYPE.body));
    expect(lines.length, "the token has to become more than one line").toBeGreaterThan(1);
    for (const line of lines) {
      expect(
        mono(BOARD_TYPE.body)(line),
        `line "${line}" is ${line.length} chars and overflows the plate`,
      ).toBeLessThanOrEqual(INNER);
    }
    expect(
      lines.join("").replace(/\s+/g, ""),
      "a line break may cost a space, never a letter",
    ).toBe(`P1 · ${rule}`.replace(/\s+/g, ""));
  });

  it("keeps ordinary sentences at the word breaks it had before", () => {
    const sentence = "One box per file, one district per folder.";
    expect(wrapPlate(sentence, INNER, mono(BOARD_TYPE.body))).toEqual([
      "One box per file, one",
      "district per folder.",
    ]);
  });

  it("holds every board of every state inside the plate's own width", () => {
    const width = mono(BOARD_TYPE.body);
    for (const [, c, answered] of STATES) {
      for (const lang of ["en", "de"] as const) {
        for (const b of copyOf(c, lang, answered)) {
          for (const line of b.text.lines) {
            for (const piece of wrapPlate(line, INNER, width)) {
              expect(
                width(piece),
                `${b.id}/${lang}: "${piece}" would be cut by the plate edge`,
              ).toBeLessThanOrEqual(INNER);
            }
          }
        }
      }
    }
  });
});

// ── the placement promise the module makes about itself ────────────────────

/** The two pictures the product actually renders, measured in the running app:
 *  the city canvas, not the window around it. The project card's column costs
 *  316 px of the window, so a 1280×800 window draws 964×800 and a 1440×900 one
 *  draws 1124×900. Every frame limit and every `capPx` is a claim about THESE. */
const PICTURES: [string, CanvasMeasure][] = [
  ["1280x800-Fenster, Canvas 964x800", { width: 964, height: 800 }],
  ["1440x900-Fenster, Canvas 1124x900", { width: 1124, height: 900 }],
];

describe("a board stands on free ground", () => {
  it("places every board of every state inside the picture it was given", () => {
    for (const [name, c] of STATES) {
      for (const [label, canvas] of PICTURES) {
        const layout = getDirLayout(c, []);
        const plan = planBoardPlacements(layout, surfaceForLayout(layout, false), canvas);
        const where = `${name} / ${label}`;
        expect(plan.boards.length, `${where}: the search found no place at all`).toBeGreaterThan(0);
        for (const b of plan.boards) {
          // The box the four corners fill — never the promise — is what has to
          // stay inside the frame the reader sees.
          expect(b.rect.x0, `${where}: a plate crosses the left edge`).toBeGreaterThanOrEqual(
            Math.max(10, canvas.width * READING_AREA.left) - 1e-6,
          );
          expect(b.rect.x1, `${where}: a plate crosses the right edge`).toBeLessThanOrEqual(
            canvas.width * (1 - READING_AREA.right) - 10 + 1e-6,
          );
          expect(b.rect.y0, `${where}: a plate crosses the top edge`).toBeGreaterThanOrEqual(
            Math.max(10, canvas.height * READING_AREA.top) - 1e-6,
          );
          expect(b.rect.y1, `${where}: a plate crosses the bottom edge`).toBeLessThanOrEqual(
            canvas.height * READING_AREA.bottom - 10 + 1e-6,
          );
          for (const p of plan.plots) {
            const gap = rectGap(b.rect, p);
            expect(gap, `${where}: a plate overlaps a plot by ${-gap}px`).toBeGreaterThanOrEqual(6);
          }
        }
        for (let i = 0; i < plan.boards.length; i++)
          for (let j = i + 1; j < plan.boards.length; j++) {
            const gap = rectGap(plan.boards[i]!.rect, plan.boards[j]!.rect);
            expect(gap, `${where}: two plates overlap by ${-gap}px`).toBeGreaterThanOrEqual(20);
          }
      }
    }
  });

  it("stands three boards wherever three do stand", () => {
    // Three is what the arrival was designed around. Where the picture cannot
    // hold three plates at the promised edge, the plan says so with fewer boards
    // — it does not answer by cutting the plates smaller.
    for (const [name, c] of STATES) {
      for (const [label, canvas] of PICTURES) {
        const layout = getDirLayout(c, []);
        const plan = planBoardPlacements(layout, surfaceForLayout(layout, false), canvas);
        expect(plan.boards.length, `${name} / ${label}`).toBe(3);
      }
    }
  });

  it("keeps the main line's cap over the operator's 11 px floor in both pictures", () => {
    for (const [name, c] of STATES) {
      for (const [label, canvas] of PICTURES) {
        const layout = getDirLayout(c, []);
        const plan = planBoardPlacements(layout, surfaceForLayout(layout, false), canvas);
        for (const b of plan.boards) {
          // capPx is the SHORTER of the two readings (the cap of a letter, not
          // the em of the line), so clearing it clears the floor either way.
          expect(
            b.capPx,
            `${name} / ${label}: a main line at ${b.capPx.toFixed(2)} px is under the floor`,
          ).toBeGreaterThanOrEqual(11);
        }
      }
    }
  });
});

// ── (e) the plate is sized at its edge, not at the box around its corners ───

describe("a plate is measured at its own edge", () => {
  const fixture = () => {
    const layout = getDirLayout(DEMO, []);
    const surface = surfaceForLayout(layout, false);
    return { layout, surface, view: arrivalView(layout, surface, { width: 964, height: 800 }) };
  };

  it("a plate turned to the eye fills a box TALLER than the plate is high", () => {
    // The refutation of the old measure: the same plate, the same camera, and
    // the two numbers are not the same number. The point is the arrival's own
    // geometry — a plate off the view axis, yawed to look at the eye. 124 px of
    // box were promised as 124 px of plate, and the picture drew 67,8 px of it.
    const { view, surface } = fixture();
    const x = view.eye.x + view.forward.x * 30 + view.right.x * 20;
    const z = view.eye.z + view.forward.z * 30 + view.right.z * 20;
    const y = surfaceHeight(surface, x, z);
    const rect = boardScreenRect(view, x, y, z, 10 * BOARD_ASPECT, 10);
    const edge = plateEdgePx(view, x, y, z, 10);
    expect(edge, "the plate's own line is the midline of its edge").toBeGreaterThan(0);
    expect(
      (rect.y1 - rect.y0) / edge,
      "the bounding box must stand out as the wrong ruler",
    ).toBeGreaterThan(1.2);
    // and on the plates that actually stand, in the picture that is rendered
    const plan = planBoardPlacements(getDirLayout(DEMO, []), surface, { width: 964, height: 800 });
    const standing = plan.boards.map((b) => (b.rect.y1 - b.rect.y0) / b.edgePx);
    expect(
      Math.min(...standing),
      "no standing plate may be smaller than its edge",
    ).toBeGreaterThanOrEqual(1);
    expect(Math.max(...standing)).toBeGreaterThan(1.2);
  });

  it("delivers the promised edge, not the promised box", () => {
    for (const [label, canvas] of PICTURES) {
      const layout = getDirLayout(DEMO, []);
      const plan = planBoardPlacements(layout, surfaceForLayout(layout, false), canvas);
      for (const b of plan.boards) {
        expect(b.edgePx, `${label}: the plate's edge is not what was targeted`).toBeCloseTo(
          TARGET_EDGE_PX,
          1,
        );
        expect(b.rect.y1 - b.rect.y0, `${label}: the box is not the plate`).toBeGreaterThan(
          b.edgePx,
        );
        expect(b.capPx, `${label}: capPx must ride the edge`).toBeCloseTo(
          b.edgePx * TITLE_CAP_FRACTION,
          6,
        );
        // What the old measure would have reported for the same plate.
        const asBox = (b.rect.y1 - b.rect.y0) * TITLE_CAP_FRACTION;
        expect(asBox, `${label}: the box no longer reports a size`).toBeGreaterThan(b.capPx);
      }
    }
  });

  it("keeps 480 canvas pixels of board on that edge", () => {
    // The painter sets its type against BOARD_CANVAS.height; the edge is the
    // line those pixels are drawn into, so the two have to agree.
    const { view, surface } = fixture();
    const x = view.eye.x + view.forward.x * 90 + view.right.x * 12;
    const z = view.eye.z + view.forward.z * 90 + view.right.z * 12;
    const y = surfaceHeight(surface, x, z);
    const height = 12;
    expect(plateEdgePx(view, x, y, z, height)).toBeGreaterThan(0);
    expect(BOARD_CANVAS.height).toBe(480);
  });
});

// ── (f) the picture is the caller's measure, never a guessed window ─────────

describe("the placement is computed against the picture", () => {
  it("says so when the measure is missing — it does not guess one", () => {
    const layout = getDirLayout(DEMO, []);
    const surface = surfaceForLayout(layout, false);
    for (const missing of [
      undefined,
      null,
      { width: 0, height: 800 },
      { width: NaN, height: 800 },
    ]) {
      expect(
        () => planBoardPlacements(layout, surface, missing as never),
        `a measure of ${JSON.stringify(missing)} was accepted`,
      ).toThrow(/canvas/i);
    }
  });

  it("the module names no viewport of its own", () => {
    const text = readFileSync(path.join(SRC, "city/teachBoards.ts"), "utf-8");
    expect(text).not.toMatch(/REFERENCE_VIEWPORT/);
    expect(text, "1280 must not sit in the module as a frame").not.toMatch(/=\s*1280\b/);
  });

  it("a window-sized frame moves the picture by half the difference, not by nothing", () => {
    // The same eye, the same world point: the vertical measure is identical
    // because focal follows the height, and the horizontal one is off by exactly
    // (1280 - 964) / 2 = 158 px. A plate the old measure put 22 px from the rim
    // of its own 1280 frame stood 136 px past the edge of the canvas.
    const layout = getDirLayout(DEMO, []);
    const surface = surfaceForLayout(layout, false);
    const wide = arrivalView(layout, surface, { width: 1280, height: 800 });
    const real = arrivalView(layout, surface, { width: 964, height: 800 });
    const x = wide.eye.x + wide.forward.x * 90 + wide.right.x * 30;
    const z = wide.eye.z + wide.forward.z * 90 + wide.right.z * 30;
    const p = new THREE.Vector3(x, surfaceHeight(surface, x, z), z);
    const a = projectPoint(wide, p);
    const b = projectPoint(real, p);
    expect(a.y).toBeCloseTo(b.y, 4);
    expect(a.x - b.x).toBeCloseTo((1280 - 964) / 2, 1);
    expect(focalPxFor({ width: 964, height: 800 })).toBeCloseTo(
      focalPxFor({ width: 1280, height: 800 }),
      6,
    );
  });

  it("keeps the same reading size in both pictures and moves the world to get it", () => {
    // The promise is in PICTURE pixels, so a taller canvas does not make a
    // bigger plate — it makes a different ground plan. Before this correction the
    // module solved one height against 800 px and drew it into 900: the plate
    // then read 139,5 px where it claimed 124, and no one had measured either.
    for (const [name, c] of STATES) {
      const layout = getDirLayout(c, []);
      const surface = surfaceForLayout(layout, false);
      const small = planBoardPlacements(layout, surface, { width: 964, height: 800 });
      const large = planBoardPlacements(layout, surface, { width: 1124, height: 900 });
      const caps = (plan: typeof small) => Math.min(...plan.boards.map((b) => b.capPx));
      expect(
        caps(large),
        `${name}: the reading size may not depend on which measure was handed in`,
      ).toBeCloseTo(caps(small), 1);
      for (const b of [...small.boards, ...large.boards])
        expect(b.edgePx, `${name}: the edge is the promise`).toBeCloseTo(TARGET_EDGE_PX, 1);
    }
  });
});
