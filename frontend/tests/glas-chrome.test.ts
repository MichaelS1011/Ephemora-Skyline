// GLAS-09 — the frosted chrome has to earn its transparency.
//
// On 2 October the accessibility pass took the blur off the action dock with
// `backdrop-filter: none !important` and a solid `#20201e`. The reason was the
// one a measurement repeats: a translucent bar over the lightest thing the
// picture can show — the plaza at `#e6e1d4` — drops its own labels. Removing
// glass was one way to keep that floor. It is not the only way, and the
// product now wants the look, so the floor moves from a blunt rule ("no
// transparency here") into this file: the tint has to hold AA against the
// brightest ground that can ever sit behind it, and the labels that live inside
// the world — where no chrome tint lies between them and the picture — must
// stay opaque, because that is where the measured failure was (1,83:1).
//
// ── Soll-Zustand: zwölf Fälle, was sie behaupten, wie oft sie asserten ─────
// „F.“ = die Assertions, die der Fallkörper selbst trifft (seine Zeilen × seine
// Pflichten). Die Farb-Mechanik guardiert zusätzlich in `rootToken`, `parseColor`,
// `declaredColour`, `designFile` und in den Szenen-Helfern — das ist der Takt der
// Maschine, kein Verhalten.
//
//  Fall                            behauptet                                          F. vorher  F. nachher
//  1  eigene Token-Schicht         alpha in (0,1), Blur-Token exists                         3        3
//  2  Schrift, hellster Grund      4 helle Gründe × 5 Token-Tinten ≥ 4,5                    20       20
//  3  Schrift, dunkelster Grund    2 Tinten über #0d0d0c → jetzt alle 5 ≥ 4,5                2        5
//  4  Glas auf jeder Fläche        6 Selektoren × (Regel + backdrop-filter + Token)         18       18
//  5  Welt-Labels undurchsichtig   Wächter hat > 3 Regeln + jede ohne backdrop-filter        1        1
//                                  (9 Welt-Regeln)                                   (+9)   10       10
//  6  Accessibility widerrufen     keine Solid-Regel + begründende Zeile im Blatt            2        2
//  7  globals.css lädt zuletzt     main.tsx-Reihenfolge + 3 Blätter davor                     5        5
//  8  genau eine Regel regiert     7 Flächen × 1: eine unlayered Regel                        7        7
//  9  Fläche hält, was sie malt     7 Flächen × 9 Pflichten: Sieger, Token, Grundton,       63       63
//                                 Glanz, 4 Felder, Tinte gemessen, Kontrast ≥ 4,5
//  10 jede Tinte, Liste voll       7 Tinten × (gelistet + Fläche) + Minimum, jetzt mit      15       22
//                                 eigenem Urteil pro Tinte
//  11 Zähne: Konstante heller      Kopie-erreicht + 7 Flächen × (unter 4,5, unter 0,92)     15       16
//  12 Zähne: zweite Flächen-Regel  Kopie-erreicht + 2 Flächennachschlagen + 4 Belege          5        8
//  ────────────────────────────────────────────────────────────────────────────────────────────
//  Kein Verhalten entfernt, nichts gelockert: 165 → 179 Fallkörper-Assertions. Fälle 3, 10 und
//  11/12 zählen höher, weil der geteilte Aufbau es hergibt — der dunkle Grund hält jetzt die
//  ganze Tintenliste, jede getragene Tinte hat ein eigenes Urteil, jede Mutationsszene guardiert
//  ihre eigene Kopie. Ausgeführte `expect`-Aufrufe gesamt 5469 → 3159: dieselben Messungen, aber
//  die Szene wird geteilt statt je Fall neu aufgebaut (7 → 5 Berechnungen) und das Minimum pro
//  Tinte ist eins statt zwei — die Mechanik-Guards laufen seltener, kein Verhalten leiser. Was
//  ein Fall mit zwei Szenen war (11), lief unter fremder Last über den Vitest-Timeout: zwei Fälle.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  ENV,
  LANGUAGE_COLORS,
  UNCHECKED_COLOR,
  severityColor,
  severityTextColor,
} from "../src/city/palette";
import { contrast, relLum } from "./colourMath";
import { GLASS_ALPHA_MAX, GLASS_ALPHA_MIN, glassAlphaFor } from "../src/render/backdropLuminance";

/** Der Text einer Quelldatei: Blätter wie Components werden gleich gelesen. */
const quelle = (rel: string): string =>
  readFileSync(path.resolve(import.meta.dirname, rel), "utf-8");

/** Die vier Blätter, die Chrome-Flächen schreiben, sind die Szene; eine Kopie
 *  mit einem anderen Blatt darin ist eine Mutation. */
type Sheets = readonly (readonly [string, string])[];

const css: Sheets = ["globals.css", "stadt-ui.css", "start.css", "city-funktion.css"].map(
  (f) => [f, quelle(`../src/design/${f}`)] as const,
);
const allCss = css.map(([, t]) => t).join("\n");

/** The two materials Apple's Materials page separates: Liquid Glass for the
 *  functional layer ("controls and navigation elements … that floats above the
 *  content layer"), and a thicker standard material where a surface carries
 *  "a significant amount of text". Measured on the running screen, the split is
 *  not a hairline: the dock carries 14 words and 5 controls, the mode bar 3 and
 *  3 — the file card 245 words, the findings list 189. */
const GLAS = "var(--glass-control-bg)";
const PLATTE = "var(--material-read-bg)";

/** Every surface the shell tints, and the one material it is allowed to wear. */
const CHROME: Array<[string, string]> = [
  [".workspace-header", GLAS],
  [".action-dock-row", GLAS],
  [".start-coach", GLAS],
  [".workspace-modes .glass", GLAS],
  [".workspace-heatmap .glass", GLAS],
  [".start-summary", GLAS],
  [".start-summary-strip", GLAS],
  [".panel-card", PLATTE],
  [".panel-context-card", PLATTE],
];

/** A surface may not wear the other material either — that is the split. */
const ANDERE = (token: string): string => (token === GLAS ? PLATTE : GLAS);

/** Die Schicht, die eine Fläche tragen muss, nach ihrem Namen in `SURFACES`. */
const MATERIAL: Record<string, string> = {
  "workspace header": GLAS,
  "action dock": GLAS,
  "first-look coach": GLAS,
  "mode bar": GLAS,
  "heat channel": GLAS,
  "scan announcement": GLAS,
  "scan summary strip": GLAS,
  "findings panel": PLATTE,
  "file panel": PLATTE,
  "project card": PLATTE,
};

/** Die Solid-Entscheidung vom 2. Oktober — sie darf nicht neben dem Glas stehen. */
const SOLIDE_DOCK = /background:\s*#20201e\s*!important/;

/* ── Which declaration actually rules a surface ────────────────────────────
 * Everything above this line proves the *token* is safe. None of it proves a
 * surface wears it, and the difference is not theoretical: `.workspace-modes
 * .glass` carried the token in stadt-ui.css and a flat `#243747` in
 * globals.css:1551, and the case below read "some rule has token plus blur"
 * and signed it off. Measured in the running app on 2026-10-11: rgb(36, 55,
 * 71). Mounting the panels turned up the same shape a second time —
 * `.panel-card` computed rgb(32, 49, 62), because `#20313e !important` in
 * globals.css beat the token.
 *
 * So this block resolves the cascade by hand: the order the files are loaded
 * in, @media at the desktop viewport, @layer (an unlayered normal declaration
 * beats a layered one, and for !important the layer order reverses), then
 * specificity. A `getComputedStyle` guard is not available here, and that was
 * measured rather than assumed: jsdom leaves `var()` unresolved (a token rule
 * computes to rgba(0, 0, 0, 0)) and cannot parse globals.css at all — its
 * `@layer` at-rules drop the whole sheet. Both failures land exactly on the
 * surface that broke, so such a guard would have been green over the defect.
 */

/** The order the browser really gets these sheets in. globals.css is last:
 *  main.tsx evaluates `import App` before its own design import, and App's
 *  component graph pulls the other three. Asserted below, not assumed. */
const LOAD_ORDER = ["city-funktion.css", "start.css", "stadt-ui.css", "globals.css"];

const VIEWPORT = { width: 1600, reducedMotion: false };

/** The grounds the city can show behind a frosted bar, brightest first: the plaza is
 *  the brightest floor in the picture. Eine Tabelle für beide Leser — die Tint-Fälle
 *  gehen ihre Zeilen, die Szene darunter kompositet ihre Farben. */
const GRÜNDE = [
  { sagt: "Plaza", farbe: ENV.plot },
  { sagt: "Boden", farbe: ENV.ground },
  { sagt: "Horizont-Nebel", farbe: ENV.fog },
  { sagt: "Feldweg", farbe: ENV.crosswalk },
];
const GROUNDS = GRÜNDE.map((g) => g.farbe);

const DUNKELSTER_GRUND = { sagt: "Schwarz", farbe: "#0d0d0c" };

/** WCAG AA für normalen Text — das Kriterium jedes Kontrastfalls hier. */
const STUFE = 4.5;

type Decl = { prop: string; value: string; important: boolean };
type Rule = {
  sel: string;
  decls: Decl[];
  file: string;
  line: number;
  order: number;
  media: string[];
  layer: string | null;
};

/** Comments go, lines stay — a reported `file:line` has to be the real one. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** Ein Selektor ist eine Kommata-Liste; die Kaskade entscheidet pro Teil. */
const selektoren = (sel: string): string[] =>
  sel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Schlüssel ist die Blätter-Identität: dieselben Blätter sind dieselben Regeln, und
 *  jede Szene liest beides mehrfach. */
function puffern<T>(lesen: (files: Sheets) => T): (files: Sheets) => T {
  const cache = new WeakMap<Sheets, T>();
  return (files) => {
    const bekannt = cache.get(files);
    if (bekannt !== undefined) return bekannt;
    const wert = lesen(files);
    cache.set(files, wert);
    return wert;
  };
}

/** Declarations keep their semicolons inside `var()`-free parens, so a plain
 *  split is enough here; every rule in these sheets is flat. */
function parseDecls(body: string): Decl[] {
  return body
    .split(";")
    .map((part) => part.match(/^\s*([\w-]+)\s*:\s*([\s\S]+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({
      prop: (m[1] as string).trim(),
      value: (m[2] as string).replace(/\s+/g, " ").trim(),
      important: /!\s*important/.test(m[2] as string),
    }));
}

/** Every rule with the at-rules sitting around it. A brace walk, because a
 *  linear regex cannot tell a media block from its host. */
function parseRules(text: string, file: string, orderBase: number): Rule[] {
  const src = withoutComments(text);
  const out: Rule[] = [];
  const stack: Array<{ head: string; line: number }> = [];
  let buf = "";
  let line = 1;
  const newlines = (s: string): number => (s.match(/\n/g) ?? []).length;
  for (const ch of src) {
    if (ch === "\n") line++;
    if (ch === "{") {
      // A wrapped selector list starts above its brace, and a reported
      // `file:line` has to be the line a reader lands on with :<line>. The
      // leading newline after the previous rule is not part of the selector.
      stack.push({ head: buf.trim().replace(/\s+/g, " "), line: line - newlines(buf.trim()) });
      buf = "";
    } else if (ch === "}") {
      const top = stack.pop();
      if (top && !top.head.startsWith("@")) {
        out.push({
          sel: top.head,
          decls: parseDecls(buf),
          file,
          line: top.line,
          order: orderBase + out.length,
          media: stack
            .filter((s) => /^@media/.test(s.head))
            .map((s) => s.head.replace(/^@media\s*/, "")),
          layer:
            stack
              .map((s) => s.head.match(/^@layer\s+([\w-]+)/)?.[1])
              .find((l): l is string => Boolean(l)) ?? null,
        });
      }
      buf = "";
    } else buf += ch;
  }
  return out;
}

const tokensOf = puffern((files: Sheets) => {
  const tokens = new Map<string, string>();
  for (const [, text] of files) {
    for (const m of withoutComments(text).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (!tokens.has(m[1] as string)) tokens.set(m[1] as string, (m[2] as string).trim());
    }
  }
  return tokens;
});

const rulesOf = puffern((files: Sheets) =>
  LOAD_ORDER.flatMap((f, i) => {
    const text = files.find(([name]) => name === f)?.[1];
    if (text === undefined) throw new Error(`${f} is in the load order but not read`);
    return parseRules(text, f, i * 1e5);
  }),
);

/** Die Regeln, deren Selektor auf eine Chrome-Fläche endet — aus dem strukturierten
 *  Read, nicht aus einer zweiten Kopie derselben Blätter. */
const flächentreffer = (sel: string, files: Sheets): Rule[] =>
  rulesOf(files).filter((r) => selektoren(r.sel).some((one) => one.endsWith(sel)));

const hatDeklaration = (regeln: Rule[], suche: (d: Decl) => boolean): boolean =>
  regeln.some((r) => r.decls.some(suche));

/** The state a component carries by dimming its own text, in whichever shape
 *  the dim was written: an inline `opacity: <state> ? 1 : 0.4` (the four sites
 *  the dock shipped) or the Tailwind `disabled:opacity-40` on the same bar.
 *  Both shapes are read because both were shipped here, and a guard that knew
 *  only one would go quiet the next time the other came back. A ternary gives
 *  up its darker branch — that is the state the reader is shown. Absent means
 *  undimmed. No cascade reader can see either shape: both are inline styles. */
function stateDim(component: string): number {
  const dims = [
    ...[...component.matchAll(/opacity:\s*[^;{}]*\?\s*([\d.]+)\s*:\s*([\d.]+)/g)].flatMap((m) => [
      Number(m[1]),
      Number(m[2]),
    ]),
    ...[...component.matchAll(/disabled:opacity-(\d+)/g)].map((m) => Number(m[1]) / 100),
  ];
  return dims.length === 0 ? 1 : Math.min(...dims);
}

function mediaApplies(cond: string): boolean {
  return cond.split(/\sand\s/).every((part) => {
    const min = part.match(/min-width:\s*(\d+)px/);
    const max = part.match(/max-width:\s*(\d+)px/);
    if (min) return VIEWPORT.width >= Number(min[1]);
    if (max) return VIEWPORT.width <= Number(max[1]);
    if (/prefers-reduced-motion:\s*reduce/.test(part)) return VIEWPORT.reducedMotion;
    // An unknown condition (a colour scheme, a container query) is treated as
    // off: a rule that only appears there must not be counted as a second
    // owner of a surface this guard reads at 1600 px.
    return false;
  });
}

/** Specificity as (id, class/attr/pseudo-class, type/pseudo-element) packed. */
function specificity(selector: string): number {
  let a = 0;
  let b = 0;
  let c = 0;
  const s = selector.replace(/::[a-z-]+/gi, () => {
    c++;
    return "";
  });
  for (const compound of s.split(/[\s>+~]+/)) {
    if (!compound || compound === "*") continue;
    a += (compound.match(/#[\w-]+/g) ?? []).length;
    b += (compound.match(/\.[\w-]+/g) ?? []).length;
    b += (compound.match(/\[[^\]]*\]/g) ?? []).length;
    b += (compound.match(/:(?!:)[\w-]+/g) ?? []).length;
    const tag = compound.replace(/[.#[:].*/s, "");
    if (/^[a-z][\w-]*$/i.test(tag)) c++;
  }
  return a * 1e6 + b * 1e3 + c;
}

const classNames = (compound: string): string[] =>
  [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1] as string);

/** A surface is described by the element's own classes and its ancestor
 *  chain, read off the components, not invented: HudOverlay.tsx:71,
 *  FindingsPanel.tsx:226, InfoPanel.tsx:771, ActionBar.tsx:278,
 *  CoachMarks.tsx:273, ModeBar.tsx:34, HeatmapToggle.tsx:52. */
type Surface = { name: string; own: string[]; ancestors: string[][] };

/** Klassen, wie sie am Element stehen; `ebenen` = eine Klasse je Ebene der
 *  Ahnenkette, von der Fläche nach außen. */
const klassen = (s: string): string[] => s.split(/\s+/).filter(Boolean);
const ebenen = (...ebene: string[]): string[][] => ebene.map(klassen);

/** Does this selector hit the surface element itself (not a child, not a
 *  pseudo-element)? Compounds are matched right to left; a compound without a
 *  class cannot name one of these elements, so it is not claimed. */
function hitsSurface(selector: string, surface: Surface): boolean {
  const compounds = selector.split(/[\s>+~]+/).filter(Boolean);
  const last = compounds[compounds.length - 1];
  if (!last || /::/.test(last)) return false;
  const own = classNames(last);
  if (own.length === 0 || !own.every((c) => surface.own.includes(c))) return false;
  const rest = compounds.slice(0, -1);
  if (rest.length > surface.ancestors.length) return false;
  return rest.every((compound, i) => {
    const cls = classNames(compound);
    if (cls.length === 0) return true;
    return surface.ancestors.slice(i).some((level) => cls.every((c) => level.includes(c)));
  });
}

const resolveVars = (value: string, tokens: Map<string, string>): string => {
  let out = value;
  // Custom properties may themselves reference properties; four passes is
  // deeper than any chain in these sheets and ends in a fixed point.
  for (let i = 0; i < 4; i++) {
    for (const [name, replacement] of tokens) out = out.replaceAll(`var(${name})`, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
};

/** The `background` shorthand puts its colour last, after any image layers.
 *  Taking the last literal is what the browser composites as background-color;
 *  taking the first would read the sheen's 5 %-white stop. */
function backgroundColourOf(decl: Decl, tokens: Map<string, string>): string | null {
  const value = decl.value.replace(/!important/g, "").trim();
  const literals = resolveVars(value, tokens).match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi);
  return literals ? (literals[literals.length - 1] as string) : null;
}

type Owner = { rule: Rule; decl: Decl; colour: string | null; hit: string };

/** Every rule that sets this surface's background at the desktop viewport,
 *  best first. The winner is the first of those that are not layered: the
 *  `.glass` utility in `@layer utilities` is the fallback these surfaces drop
 *  back to when the chrome rule goes away, and a fallback is not an owner. */
function backgroundOwners(
  surface: Surface,
  rules: Rule[],
  tokens: Map<string, string>,
): { ranked: Owner[]; winner: Owner | null } {
  const ranked: Owner[] = [];
  for (const rule of rules) {
    if (rule.media.length && !rule.media.every(mediaApplies)) continue;
    // Specificity is a property of one selector, never of a comma list: the
    // bar rules below are written as `.workspace-modes .glass,
    // .workspace-heatmap .glass`, and scoring the joined string would read as
    // four classes and beat a single flat rule that really ties with it.
    const hits = selektoren(rule.sel).filter((s) => hitsSurface(s, surface));
    if (hits.length === 0) continue;
    const hit = hits.reduce((a, b) => (specificity(b) > specificity(a) ? b : a)) as string;
    for (const decl of rule.decls) {
      if (decl.prop !== "background" && decl.prop !== "background-color") continue;
      ranked.push({ rule, decl, hit, colour: backgroundColourOf(decl, tokens) });
    }
  }
  ranked.sort(
    (x, y) =>
      Number(y.decl.important) - Number(x.decl.important) ||
      // Normal declarations: the unlayered one wins. !important declarations:
      // the layer order reverses. Neither shape is invented — the dock is
      // glassed !important, and both flat colours that broke this lane were
      // unlayered normal rules that simply came later.
      (x.decl.important
        ? Number(Boolean(x.rule.layer)) - Number(Boolean(y.rule.layer))
        : Number(Boolean(y.rule.layer)) - Number(Boolean(x.rule.layer))) ||
      specificity(y.hit) - specificity(x.hit) ||
      y.rule.order - x.rule.order,
  );
  return { ranked, winner: ranked.find((o) => !o.rule.layer) ?? null };
}

/** The top-level layers of a `background` value: commas inside a gradient are
 *  not layer separators, so this walks the parenthesis depth. */
function layersOf(resolved: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of resolved) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

/** The ink a chrome surface actually carries. `.app-shell` redefines the
 *  secondary labels (globals.css:1714-1717: `--meta-strong: #d7e2e9`,
 *  `--meta: #becdd7`) because the chrome sits around the daylight city, not
 *  around the dark landing screen — reading the `:root` value would measure a
 *  label the workspace never paints. Custom properties inherit, so the scope
 *  that wins is the last rule naming the element's own scope. */
function inkInScope(files: Sheets, name: string, scope: string): string {
  const scoped = rulesOf(files)
    .filter((r) => selektoren(r.sel).includes(scope))
    .flatMap((r) =>
      r.decls.filter((d) => d.prop === name).map((d) => d.value.replace(/!important/g, "").trim()),
    )
    .pop();
  return scoped ?? rootToken(name.replace(/^--/, ""));
}

/** The ink a chrome surface's own rule carries, read off the sheet instead of
 *  typed into this file. A `var()` is resolved in the `.app-shell` scope because
 *  that is the shell these bars live in; the `:root` value belongs to the dark
 *  landing screen and would measure a colour the workspace never paints. */
function declaredColour(
  files: Sheets,
  source: string,
  rule: RegExp,
  what: string,
  group = 1,
): string {
  const m = withoutComments(source).match(rule);
  expect(m, `${what}: keine regierende Farb-Deklaration zu lesen`).not.toBeNull();
  const raw = (m as RegExpMatchArray)[group]!.trim();
  const token = raw.match(/^var\((--[\w-]+)\)$/)?.[1];
  return token ? inkInScope(files, token, ".app-shell") : resolveVars(raw, tokensOf(files));
}

const designFile = (files: Sheets, name: string): string => {
  const text = files.find(([f]) => f === name)?.[1];
  expect(text, `${name} ist nicht geladen`).not.toBeUndefined();
  return text as string;
};

const COACH_HINT = /\.start-coach-strip-hint\s*\{[^}]*color:\s*([^;]+);/;
const DISABLED_LABEL = /color:\s*unavailable\s*\?\s*["'`]([^"'`]+)["'`]/;

/* The dock's own inks, read off the component rather than typed in here. None
 * of them is a token: the step buttons and the triage start paint a brighter
 * cream than `--color-text`, the ordinary dock label paints a duller one, and
 * the overflow menu hands a third cream to its items inline. */
const STEP_LABEL = /style=\{\{\s*color:\s*"(#[0-9a-f]{6})"[^{}]*whiteSpace: "nowrap"/;
const ACTION_LABEL = /color:\s*active\s*\?\s*"(#[0-9a-f]{6})"\s*:\s*"(#[0-9a-f]{6})"/;
const MENU_LABEL = /className="action-secondary-menu[\s\S]{0,700}?color:\s*"(#[0-9a-f]{6})"/;
const MORE_LABEL = /color:\s*menuOpen \? "[^"]+" : "(#[0-9a-f]{6})"/;

/** Every component whose inline styles put text on a frosted bar. Read once,
 *  outside the sheet copies the mutation cases pass through `chromeState`: an
 *  inline style is not a design file, and no mutation of a sheet is expected to
 *  move it. */
const HEAT_TOGGLE = quelle("../src/components/HeatmapToggle.tsx");
const ACTION_BAR = quelle("../src/components/ActionBar.tsx");

const HEAT_DIM = stateDim(HEAT_TOGGLE);
const DOCK_DIM = stateDim(ACTION_BAR);

/** Die Literal der Scan-Meldung, read out of start.css rather than retyped. */
const STRIP_TEXT = ["start.css", /\.start-summary-strip-text\s*\{[^}]*color:\s*([^;]+);/] as const;
const STRIP_SHOW = ["start.css", /\.start-summary-strip-open\s*\{[^}]*color:\s*([^;]+);/] as const;

/** Every ink that sits on a frosted bar — eine Zeile pro Tinte. The four token
 *  inks are what the shell resolves for a label; the rest is what these surfaces
 *  additionally paint from their own declarations: the coach's hint line, the
 *  disabled switch, the bar's caption, and the literals the dock and its
 *  overflow menu carry inline. There is no exception here: a state a reader is
 *  asked to read (the struck-through CHURN channel, an empty step in the triage
 *  queue) is text like any other, and an ink list that names only the tokens
 *  measures labels the bars never paint.
 *  `token` löst die Shell auf, `blatt` liest eine Farb-Deklaration aus einem
 *  Blatt, `text` aus einem Component, `fest` ist im laufenden App gemessen
 *  (2026-10-11). Eine inline `opacity` gehört zur Tinte, nicht zur Fläche — sie
 *  steht in `dimm` und wird wirksam, wo der Kontrast genommen wird. */
type TintenZeile = {
  sagt: string;
  token?: string;
  blatt?: readonly [datei: string, regel: RegExp, gruppe?: number];
  /** Eine Token-Tinte, die nicht im `.app-shell`-Scope gelesen wird: die
   *  Funktionsleiter hebt `--meta` nur auf den Bars an. */
  scope?: readonly [token: string, selektor: string];
  text?: readonly [text: string, regel: RegExp, gruppe?: number];
  klasse?: readonly [text: string, regel: RegExp];
  fest?: string;
  dimm?: number;
};

const TINTEN: TintenZeile[] = [
  { sagt: "--color-text", token: "color-text" },
  { sagt: "--meta-strong (.app-shell)", token: "meta-strong" },
  { sagt: "--meta (.app-shell)", token: "meta" },
  { sagt: "--brand-ink", token: "brand-ink" },
  { sagt: "header caption", scope: ["--meta", ".workspace-header"] },
  { sagt: "coach hint strip", blatt: ["start.css", COACH_HINT] },
  { sagt: "disabled heat label", text: [HEAT_TOGGLE, DISABLED_LABEL], dimm: HEAT_DIM },
  { sagt: "HEAT caption", scope: ["--meta", ".workspace-header"] },
  { sagt: "dock step label", text: [ACTION_BAR, STEP_LABEL], dimm: DOCK_DIM },
  { sagt: "dock action label", text: [ACTION_BAR, ACTION_LABEL, 2], dimm: DOCK_DIM },
  // The overflow menu's trigger, closed: the one label on the bar that is
  // deliberately quieter than the rest, and still a word a reader has to make
  // out. The open state takes `--brand-ink`, already in this list.
  { sagt: "dock more label", text: [ACTION_BAR, MORE_LABEL], dimm: DOCK_DIM },
  // The overflow menu's items inherit this from the menu container's inline
  // style; the container's own plate is opaque `#20201e`, darker than every
  // field this file composites, so holding the ink to the glass fields is the
  // stricter read, not a different one.
  { sagt: "export menu label", text: [ACTION_BAR, MENU_LABEL], dimm: DOCK_DIM },
  // The announcement's own literals. It is the surface that appears by itself,
  // so its inks are measured on the same grounds as the dock's — over the
  // plaza, not over a desk.
  { sagt: "strip status line", blatt: STRIP_TEXT },
  { sagt: "strip show label", blatt: STRIP_SHOW },
  // The dock's open-count is painted in the shell's accent gold, and gold is the
  // brightest ink in the whole set — it, not the greys, is what capped the thin
  // bar: 4,33:1 over the plaza at α 0,75 before the control ladder lifted it.
  { sagt: "dock gold count", scope: ["--accent-gold", ".workspace-header"] },
];

/** Die Lesewege einer Tinte, ein Aufruf. Wo eine Utility-Klasse den Text malt
 *  statt einer Farb-Deklaration (`HEAT caption`), bleibt der Read ohne Guard —
 *  alles andere wirft eine Behauptung: die Tinte ist weggelaufen. */
function tintenfarbe(t: TintenZeile, files: Sheets): string {
  if (t.fest !== undefined) return t.fest;
  if (t.scope) return inkInScope(files, t.scope[0], t.scope[1]);
  if (t.token !== undefined) return inkInScope(files, `--${t.token}`, ".app-shell");
  if (t.klasse) return withoutComments(t.klasse[0]).match(t.klasse[1])?.[1] ?? "";
  const [quelle, regel, gruppe] = t.blatt
    ? [designFile(files, t.blatt[0]), t.blatt[1], t.blatt[2]]
    : [t.text?.[0] as string, t.text?.[1] as RegExp, t.text?.[2]];
  return declaredColour(files, quelle, regel, t.sagt, gruppe ?? 1);
}

const chromeInks = (files: Sheets) =>
  TINTEN.map((t) => ({ name: t.sagt, colour: tintenfarbe(t, files), opacity: t.dimm ?? 1 }));

/** Die Tinten, die eine Schale ohne eigene Deklaration malt: vier Token und die
 *  11-px-Caption, als `:root`-Werte — nicht im `.app-shell`-Scope. `--meta-faint` fehlt
 *  bewusst: eine Landing-Tinte auf keiner verglasten Fläche, darum war das alte
 *  „AA on glass“-Versprechen neben ihr falsch gemessen. */
const TOKEN_TINTEN: TintenZeile[] = [
  { sagt: "--color-text", token: "color-text" },
  { sagt: "--meta-strong", token: "meta-strong" },
  { sagt: "--meta", token: "meta" },
  { sagt: "--brand-ink", token: "brand-ink" },
  { sagt: "header caption", scope: ["--meta", ".workspace-header"] },
];

/** Welche Tinte auf welcher Fläche liegt — die Liste hinter Fall 10, getippt statt
 *  abgeleitet: dass eine fehlende Tinte hier auffällt, ist gerade der Wächter. */
const TRAGENDE_TINTEN: Array<{ ink: string; fläche: string }> = [
  { ink: "coach hint strip", fläche: "first-look coach" },
  { ink: "disabled heat label", fläche: "heat channel" },
  { ink: "HEAT caption", fläche: "heat channel" },
  { ink: "dock step label", fläche: "action dock" },
  { ink: "dock action label", fläche: "action dock" },
  { ink: "dock more label", fläche: "action dock" },
  { ink: "export menu label", fläche: "action dock" },
  // The announcement's quiet line is the shell's own meta ink now, so it is
  // judged as one of the four tokens rather than as a fifth literal.
  { ink: "--meta-strong (.app-shell)", fläche: "scan announcement" },
  { ink: "--meta-strong (.app-shell)", fläche: "scan summary strip" },
  { ink: "strip status line", fläche: "scan summary strip" },
  { ink: "strip show label", fläche: "scan summary strip" },
  { ink: "strip status line", fläche: "project card" },
  { ink: "dock gold count", fläche: "action dock" },
  { ink: "dock gold count", fläche: "scan announcement" },
];

/** The whole read for one set of design files: what rules each surface, and
 *  what that paints under each of the four bright grounds the city can show.
 *
 *  The field is the *ruling declaration*, not the token definition, and it is
 *  composited in the order the browser draws it: the background colour over
 *  the ground, then the sheen on top of that. The sheen is read from the same
 *  declaration, and its strongest stop is used across the whole field: the
 *  token runs 0,05 → 0,01 at 40 % → 0 at 68 % (globals.css:50-55), so this is
 *  the worst corner, not the average one — measured against the running app,
 *  the pixel at mid-height is two to five points darker and the labels there
 *  read better than this case demands. A changed sheen token moves the number
 *  here rather than leaving it claimed. */
function chromeState(files: Sheets) {
  const rules = rulesOf(files);
  const tokens = tokensOf(files);
  const inks = chromeInks(files).map((ink) => ({ ...ink, parsed: parseColor(ink.colour) }));
  return SURFACES.map((surface) => {
    const { ranked, winner } = backgroundOwners(surface, rules, tokens);
    const value = winner
      ? winner.decl.value
          .replace(/!important/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
    const layers = winner ? layersOf(resolveVars(value, tokens)) : [];
    // The colour layer is the one that is a plain colour (it may itself be an
    // `rgba()` literal); an image layer is the one naming a gradient function.
    const isColour = (layer: string): boolean =>
      /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.test(layer) && !/gradient\(/i.test(layer);
    const colourLayer = [...layers].reverse().find(isColour);
    const sheen = layers.find((l) => /gradient\(/i.test(l))?.match(/rgba?\([^)]*\)/)?.[0] ?? null;
    const bg = colourLayer ? parseColor(colourLayer) : null;
    // Tint over the ground first, then the sheen over that — what the browser
    // draws, in the order it draws it.
    const felder = bg
      ? GROUNDS.map((ground) => {
          const getönt = toHex(composite(bg, ground));
          return sheen ? toHex(composite(parseColor(sheen), getönt)) : getönt;
        })
      : [];
    // What the eye gets: the ink laid over this field at its own opacity. At
    // opacity 1 this is the declared colour unchanged; a dimmed label blends
    // toward the field, which is exactly how it drops off the floor.
    const aufFeld = (ink: (typeof inks)[number], field: string): string =>
      toHex(composite({ rgb: ink.parsed.rgb, alpha: ink.opacity }, field));
    // Eine Messung pro Tinte: `worst` und `worstInk` lesen dieselbe Zeile.
    const tinten = bg
      ? inks.map((ink) => ({
          ink: ink.name,
          c: Math.min(...felder.map((feld) => contrast(aufFeld(ink, feld), feld))),
        }))
      : [];
    return {
      surface,
      ranked,
      unlayered: ranked.filter((o) => !o.rule.layer),
      winner,
      colourLayer: colourLayer ?? "",
      sheen,
      fields: felder,
      worst: tinten.length ? Math.min(...tinten.map((t) => t.c)) : 0,
      worstInk: tinten.length ? tinten.reduce((a, t) => (t.c < a.c ? t : a)) : { ink: "", c: 0 },
    };
  });
}

type Szene = ReturnType<typeof chromeState>[number];

/** Die sieben Flächen, Klassen wie am Element: `own` = eigene, `ahnen` = eine
 *  je Ebene der Ahnenkette. */
const SURFACES: Surface[] = [
  { name: "workspace header", own: klassen("workspace-header"), ancestors: ebenen("app-shell") },
  {
    name: "findings panel",
    own: klassen("panel-findings panel-card pointer-events-auto"),
    ancestors: ebenen("app-shell", "construction-ui"),
  },
  {
    name: "file panel",
    own: klassen("panel-info panel-card panel-scroll animate-slide-right pointer-events-auto"),
    ancestors: ebenen("app-shell", "construction-ui"),
  },
  {
    name: "action dock",
    own: klassen(
      "action-dock-row flex flex-wrap items-center justify-center gap-1 rounded-xl p-1.5",
    ),
    ancestors: ebenen("action-dock", "app-shell", "construction-ui"),
  },
  {
    name: "first-look coach",
    own: klassen("city-coach start-coach"),
    ancestors: ebenen("app-shell", "construction-ui"),
  },
  {
    name: "mode bar",
    own: klassen("glass flex items-center gap-1 rounded px-2 py-1.5 pointer-events-auto"),
    ancestors: ebenen("workspace-modes", "construction-ui", "app-shell"),
  },
  {
    name: "heat channel",
    own: klassen("glass flex items-center gap-1 rounded px-2 py-1.5"),
    ancestors: ebenen("workspace-heatmap", "construction-ui", "app-shell"),
  },
  {
    name: "project card",
    own: klassen("absolute z-20 pointer-events-auto animate-slide-left panel-context-card"),
    ancestors: ebenen("construction-ui", "app-shell"),
  },
  {
    name: "scan announcement",
    own: klassen("start-summary is-findings"),
    ancestors: ebenen("start-summary-slot", "construction-ui", "app-shell"),
  },
  {
    name: "scan summary strip",
    own: klassen("start-summary-strip is-findings"),
    ancestors: ebenen("start-summary-strip-slot", "construction-ui", "app-shell"),
  },
];

function rootToken(name: string): string {
  const hit = allCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  expect(hit, `:root carries no --${name}`).not.toBeNull();
  return (hit as RegExpMatchArray)[1]!.trim();
}

function parseColor(value: string): { rgb: [number, number, number]; alpha: number } {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/]+\s*([\d.]+))?\s*\)/);
  if (m) {
    return {
      rgb: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
      alpha: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  const hex = value.match(/#([0-9a-f]{6})/i);
  expect(hex, `cannot read a colour from "${value}"`).not.toBeNull();
  const h = (hex as RegExpMatchArray)[1]!;
  return {
    rgb: [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ] as [number, number, number],
    alpha: 1,
  };
}

/** What the eye actually gets: the tint over the ground behind it. */
function composite(tint: { rgb: [number, number, number]; alpha: number }, ground: string) {
  const g = parseColor(ground).rgb;
  return tint.rgb.map((v, i) => Math.round(v * tint.alpha + g[i]! * (1 - tint.alpha))) as [
    number,
    number,
    number,
  ];
}

const toHex = (c: [number, number, number]): string =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

describe("Das Glas der festen Schale hält seine Lesbarkeit", () => {
  // Read inside the cases: a token that does not exist yet must fail a test,
  // not the whole file at collection time.
  const tint = (): ReturnType<typeof parseColor> => parseColor(rootToken("material-read-bg"));

  /** Der geteilte Szenenaufbau: was über jeder Fläche regiert, welche Feldfarben
   *  das für die vier Gründe ergibt. */
  const szene = (files: Sheets = css): Szene[] => chromeState(files);

  /** Eine Fläche beim Namen — eine Tabelle, die eine Fläche erfindet, fällt hier. */
  const fläche = (reihe: Szene[], name: string): Szene => {
    const f = reihe.find((s) => s.surface.name === name);
    expect(f, `${name} ist keine Chrome-Fläche`).not.toBeUndefined();
    return f as Szene;
  };

  /** Eine Blatt-Kopie, in der genau ein Blatt anders schreibt — die Szene der
   *  Mutations-Fälle. Guardiert, dass die Änderung angekommen ist: eine Kopie, an der
   *  der Replace vorbeiläuft, wäre ein grüner Wächter über nichts. */
  const kopie = (datei: string, ändern: (text: string) => string): Sheets => {
    const alt = designFile(css, datei);
    const aus = css.map(([f, t]) => [f, f === datei ? ändern(t) : t] as const);
    const neu = aus.find(([f]) => f === datei)?.[1];
    expect(neu, `die Kopie hat ${datei} nicht erreicht`).not.toBe(alt);
    return aus;
  };

  /** Kurzform der Flächen-Prädikate: Name + was dort fehlt. */
  const sag = (f: Szene, was: string): string => `${f.surface.name}: ${was}`;

  /** Wer über einer Fläche regiert — der Beleg jeder Kaskaden-Fehlermeldung. */
  const regenten = (f: Szene): string[] =>
    f.unlayered.map((o) => `${o.rule.file}:${o.rule.line} → ${o.decl.value.slice(0, 60)}`);

  /** Ein Durchlauf durch die Grund-Tabelle: eine Zeile pro Grund, pro Grund jede
   *  Tinte einzeln — das Chrome-Tint über diesem Grund, nie das Blatt allein. */
  function schriftAufGründen(gründe: ReadonlyArray<{ sagt: string; farbe: string }>): void {
    for (const grund of gründe) {
      const feld = toHex(composite(tint(), grund.farbe));
      for (const t of TOKEN_TINTEN) {
        const rgb = toHex(parseColor(tintenfarbe(t, css)).rgb);
        const k = contrast(rgb, feld);
        expect(k, `${t.sagt} über ${grund.sagt} (${feld})`).toBeGreaterThanOrEqual(STUFE);
      }
    }
  }

  it("trägt eine eigene Token-Schicht, keine verstreuten Zahlen", () => {
    expect(tint().alpha).toBeGreaterThan(0);
    expect(tint().alpha).toBeLessThan(1);
    expect(rootToken("glass-chrome-blur")).toContain("blur(");
  });

  it("hält die Schrift auf dem hellsten Grund, der je hinter ihr liegen kann", () => {
    // The plaza is the brightest floor in the picture; the sky behind the header
    // and the haze at the horizon are close seconds. Whichever of these sits
    // under a frosted bar is the worst case for the label on it.
    schriftAufGründen(GRÜNDE);
  });

  it("hält auch auf dem dunkelsten Grund", () => {
    // Derselbe Satz Tinten wie oben: der dunkle Boden hielt vorher nur gegen
    // zwei von ihnen, hätte die übrigen drei dort also frei erfunden.
    schriftAufGründen([DUNKELSTER_GRUND]);
  });

  it("legt das Glas auf jede Chrome-Fläche", () => {
    for (const eintrag of CHROME) {
      const [sel, material] = eintrag;
      const hits = flächentreffer(sel, css);
      expect(hits.length, `${sel} hat keine Regel mehr`).toBeGreaterThan(0);
      const glas = hatDeklaration(hits, (d) => /backdrop-filter$/.test(d.prop));
      expect(glas, `${sel} bekommt kein Glas`).toBe(true);
      const token = hatDeklaration(hits, (d) => d.value.includes(material));
      expect(token, `${sel} benutzt nicht seine Schicht ${material}`).toBe(true);
      const fremde = hatDeklaration(hits, (d) => d.value.includes(ANDERE(material)));
      expect(fremde, `${sel} trägt die Schicht der anderen Ebene`).toBe(false);
    }
  });

  it("lässt die Welt-Labels in Ruhe — dort ist das der gemessene Ausfall", () => {
    // 1,83:1 was the district plate under a frosted layer over the plaza. The
    // fix is not a better tint: it is that nothing tints them at all.
    // Welt-Label = jede Regel, die über `.cf-` Text auf das Bild malt.
    const welt = allCss.match(/\.cf-[a-z-]+[^{}]*\{[^}]*\}/g) ?? [];
    expect(welt.length, "keine Welt-Label-Regeln — der Wächter taugt nichts").toBeGreaterThan(3);
    for (const regel of welt) {
      expect(regel, "Welt-Fläche wird verglast").not.toMatch(/backdrop-filter/);
    }
  });

  it("widerruft die Accessibility-Entscheidung nicht stillschweigend", () => {
    const dock = (allCss.match(/\.action-dock-row\s*\{([^}]*)\}/g) ?? []).join("\n");
    expect(dock, "Solid-Regel und Glas: zwei Quellen für eine Fläche").not.toMatch(SOLIDE_DOCK);
    const begründung = css.find(([, t]) => t.includes("glass-control-bg"))?.[1] ?? "";
    expect(begründung, "keine Zeile erklärt das Glas wieder da ist").toMatch(/accessibility/i);
  });

  it("lädt globals.css zuletzt — die Ordnung, gegen die eine zweite Regel gewinnen würde", () => {
    // Every tie in this cascade is decided by file order, so the order is a
    // fact the guard has to hold on to rather than a premise it borrows.
    const main = quelle("../src/main.tsx");
    const appImport = main.indexOf(`from "./App"`);
    const designImport = main.indexOf(`import "./design/globals.css"`);
    expect(appImport, "main.tsx importiert App nicht").toBeGreaterThan(-1);
    expect(designImport, "main.tsx importiert globals.css nicht").toBeGreaterThan(appImport);
    // The other three sheets come in through the component graph, which runs
    // first: measured in the browser as the order of style[data-vite-dev-id].
    for (const file of LOAD_ORDER.filter((f) => f !== "globals.css")) {
      expect(LOAD_ORDER.indexOf(file), `${file} lädt nicht vor globals.css`).toBeLessThan(
        LOAD_ORDER.indexOf("globals.css"),
      );
    }
  });

  /* ── Die vier Fälle darunter lesen die regierende Declaration, nicht das Token. ── */

  it("dass über jeder Chrome-Fläche genau eine Regel regiert", () => {
    for (const f of szene()) {
      expect(regenten(f), sag(f, `${f.unlayered.length} Regeln regieren`)).toHaveLength(1);
    }
  });

  it("hält die Fläche, die diese Regel berechnet, die Tinte über jedem Grund", () => {
    // Jede Fläche gegen IHRE Schicht: das Funktionsglas ist dünn, die Leseplatte
    // dick — einen gemeinsamen Grundton gibt es seit der Spalte nicht mehr.
    const tonDerFläche = (name: string): string =>
      rootToken(MATERIAL[name] === GLAS ? "glass-control-bg" : "material-read-bg");
    const sheenStop = (rootToken("glass-chrome-sheen")
      .replace(/\s+/g, " ")
      .match(/rgba?\([^)]*\)/) ?? [""])[0];
    // Sieben Flächen, neun Pflichten — eine Zeile pro Pflicht.
    for (const f of szene()) {
      const wer = regenten(f)[0] ?? "keine Regel";
      const verglast = f.winner?.decl.value.replace(/\s+/g, " ");
      const grundton = parseColor(f.colourLayer).rgb;
      expect(f.winner, sag(f, "hat keine regierende Regel")).not.toBeNull();
      expect(verglast, `${sag(f, "nicht aus einer Hand verglast")}: ${wer}`).toContain(
        MATERIAL[f.surface.name],
      );
      expect(f.colourLayer, sag(f, "kein Grundton zu lesen")).not.toBe("");
      expect(grundton, `${sag(f, "Grundton rechnet nicht zum Token")}: ${wer}`).toEqual(
        parseColor(tonDerFläche(f.surface.name)).rgb,
      );
      expect(f.sheen, sag(f, "kein Glanz auf der Fläche")).not.toBeNull();
      // The same declaration carries the sheen, so the field measured here is
      // the field the browser draws: colour first, this gradient's top stop on
      // exactly that. A changed sheen token moves the number, not this line.
      const glanz = parseColor(f.sheen as string);
      expect(glanz, sag(f, "Glanz ist nicht der des Tokens")).toEqual(parseColor(sheenStop));
      expect(f.fields, sag(f, `Felder ${f.fields.join(" ")}`)).toHaveLength(GROUNDS.length);
      expect(f.worstInk.ink, sag(f, "keine Tinte gemessen")).not.toBe("");
      // 4,5 is the criterion, not a measured number: every value printed here
      // comes out of the composite above.
      const hält = sag(f, `hält nur ${f.worst.toFixed(2)} (${f.worstInk.ink})`);
      expect(f.worst, hält).toBeGreaterThanOrEqual(STUFE);
    }
  });

  it("hält jede Tinte der Liste über jedem Grund, und die Liste ist vollständig", () => {
    // The guard against an exception. None of these are tokens: the coach's hint
    // line is a literal in start.css, every other one an inline style in a
    // component. Naming them is what turns "the ink list drops one surface's
    // text" into a red case instead of a quietly smaller measurement — a guard
    // that excepts a surface does not guard it.
    const states = szene();
    const inks = chromeInks(css);
    let tiefste = Number.POSITIVE_INFINITY;
    for (const c of TRAGENDE_TINTEN) {
      const t = inks.find((i) => i.name === c.ink);
      expect(t, `${c.ink} fehlt in der Liste — eine Fläche ist ausgenommen`).toBeDefined();
      const state = fläche(states, c.fläche);
      const parsed = parseColor(t!.colour);
      // The dimming belongs to the ink, not to the surface: text at `opacity`
      // over the field it sits on is what the eye gets.
      const deckung = parsed.alpha * t!.opacity;
      const zellen = state.fields.map((feld, i) => {
        const effektiv = toHex(composite({ rgb: parsed.rgb, alpha: deckung }, feld));
        const blendet = effektiv !== t!.colour.toLowerCase() ? `≈${effektiv}` : "";
        const ratio = contrast(effektiv, feld);
        return { ratio, sagt: `${GROUNDS[i]}→${feld}${blendet} ${ratio.toFixed(2)}` };
      });
      const schwächste = Math.min(...zellen.map((z) => z.ratio));
      tiefste = Math.min(tiefste, schwächste);
      const zellenText = zellen.map((z) => z.sagt).join("  ");
      // Ein Urteil pro getragener Tinte: welche fällt, steht im Namen des Falls,
      // nicht erst im globalen Minimum unter sieben Zeilen.
      const urteil = `${c.ink} auf ${c.fläche}: ${schwächste.toFixed(2)} — ${zellenText}`;
      expect(schwächste, urteil).toBeGreaterThanOrEqual(STUFE);
    }
    expect(tiefste, "Tinte auf der festen Schale, ≥ 4,5 über jedem Grund").toBeGreaterThanOrEqual(
      STUFE,
    );
  });

  /**
   * The adaptive stage — Apple's own answer to "can you still see the city?".
   *
   * HIG, Materials (updated 9 September 2025): the *regular* variant "blurs and
   * adjusts the luminosity of background content to maintain legibility", the
   * *clear* variant is "highly translucent … prioritizing the visibility of the
   * underlying content", and the dimming layer is prescribed only "if the
   * underlying content is bright". A single fixed alpha does the opposite: it
   * films over the dark towers, where nothing needs covering, and it is the
   * bright plaza that forces the tint at all. Measured, over the grounds this
   * city can actually paint:
   *
   *   Himmel  #e0e9e5  Y 0,798 → α ≥ 0,908
   *   Plaza   #e6e1d4  Y 0,754 → α ≥ 0,907
   *   Feldweg #aab6bb  Y 0,456 → α ≥ 0,877
   *   Straße  #5c6a74  Y 0,139 → α ≥ 0,780
   *   Fassade (dunkelste der Sprachtafel) Y 0,031 → α ≥ 0,420
   *   Monolith #17171a Y 0,009 → α ≥ 0,000
   *   (binding ist jeweils `--meta` #98948a, die leiseste Tinte auf der Schale)
   *
   * So the ramp is the only place where "half the city through" and AA are both
   * true, and this case is what keeps the ramp honest: it walks the same ladder
   * the sampler will drive at run time and refuses any rung where a listed ink
   * falls under 4,5 over the ground that produced that rung.
   */
  /** The darkest facade the language table can paint — read from the table, so a
   *  palette change moves the rung it belongs on instead of stranding a literal. */
  const dunkelsteFassade = (): string =>
    Object.values(LANGUAGE_COLORS).reduce((a, b) => (relLum(b) < relLum(a) ? b : a));

  it("hält die adaptive Stufe: je heller der Grund, desto dichter das Glas", () => {
    // Both ends of the ladder, from the palette the city paints with: the four
    // bright grounds the ink cases already walk, plus the street, the kerb and
    // the plot edge — the dark rungs are where the glass is allowed to clear,
    // and they are as much under test as the plaza.
    const felder = [
      ...GRÜNDE,
      { sagt: "Straße", farbe: ENV.road },
      { sagt: "Kantenstein", farbe: ENV.curb },
      { sagt: "Plaza-Rand", farbe: ENV.plotEdge },
      // …and the masses a panel really floats over: a dark facade, the monolith
      // a folder of unscanned files paints, and the darkest language colour the
      // palette ships. These are the rungs where the glass is allowed to clear.
      { sagt: "dunkelste Fassade", farbe: dunkelsteFassade() },
      { sagt: "Monolith", farbe: "#17171a" },
      { sagt: "ungeprüft", farbe: UNCHECKED_COLOR },
    ].map((g) => ({ sagt: g.sagt, farbe: g.farbe, Y: relLum(g.farbe) }));
    let tiefste = Number.POSITIVE_INFINITY;
    let klarste = 1;
    for (const f of felder) {
      const a = glassAlphaFor(f.Y);
      const field = toHex(composite(parseColor(`rgba(14, 16, 21, ${a})`), f.farbe));
      const gewaschen = toHex(composite({ rgb: parseColor("#f2efe8").rgb, alpha: 0.05 }, field));
      for (const ink of chromeInks(css)) {
        const parsed = parseColor(ink.colour);
        const c = contrast(
          toHex(composite({ rgb: parsed.rgb, alpha: parsed.alpha * ink.opacity }, gewaschen)),
          gewaschen,
        );
        tiefste = Math.min(tiefste, c);
        expect(
          c,
          `${ink.name} auf dem Glas bei α ${a.toFixed(3)} über ${f.sagt} ${f.farbe} (Y ${f.Y.toFixed(
            3,
          )}): ${c.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(STUFE);
      }
      if (f.Y < 0.06) klarste = Math.min(klarste, a);
    }
    // The point of the whole exercise: over the dark picture the glass really is
    // clear, not "a little clearer". 0,45 is the measured promise — a tint that
    // lets more than half the world through.
    expect(
      klarste,
      "über dunklem Grund muss das Glas durchsichtig werden — die Sohle der Kurve",
    ).toBeLessThanOrEqual(0.45);
    expect(glassAlphaFor(0), "die Sohle ist die klare Stufe").toBe(GLASS_ALPHA_MIN);
    // The curve must still be moving where the city is bright. Measured on the
    // running app before the retune: every bar sat at 0,75 in every camera pose,
    // because the ceiling was already reached at Y 0,456 while the inks only need
    // 0,675 there — a ceiling with a ramp drawn under it. The four grounds the
    // chrome actually floats over in the demo sit between Y 0,4 and Y 0,5.
    const mitte = [0.4, 0.456, 0.5, 0.55].map((y) => glassAlphaFor(y));
    expect(
      Math.max(...mitte),
      `über mittelhellen Gründen darf die Stufe nicht die Decke sein — gemessen ${mitte
        .map((a) => a.toFixed(3))
        .join(", ")} gegen die Decke ${GLASS_ALPHA_MAX}`,
    ).toBeLessThan(GLASS_ALPHA_MAX - 0.01);
    const stufen = [
      ...GRÜNDE,
      { sagt: "Straße", farbe: ENV.road },
      { sagt: "Kantenstein", farbe: ENV.curb },
      { sagt: "Plaza-Rand", farbe: ENV.plotEdge },
    ].map((g) => glassAlphaFor(relLum(g.farbe)));
    expect(
      stufen.filter((a) => a < GLASS_ALPHA_MAX - 0.001).length,
      `die Kurve muss auf echten Gründen unter der Decke bleiben — gemessen ${stufen
        .map((a) => a.toFixed(3))
        .join(", ")}`,
    ).toBeGreaterThanOrEqual(3);
    // And it must move slowly enough that a flight cannot flicker the chrome: no
    // twentieth of the luminance range may carry more than a seventh of the stage
    // range. Measured on this module: the retuned curve's largest such step is
    // 0,080, the old one's was 0,210, and the running app wrote four stage changes
    // across a ten-second sweep and none over eight idle seconds.
    const schritte: number[] = [];
    for (let y = 0; y <= 0.75; y += 0.01) schritte.push(glassAlphaFor(y + 0.05) - glassAlphaFor(y));
    expect(
      Math.max(...schritte),
      "zu steile Stufen lassen das Chrome beim Fliegen atmen",
    ).toBeLessThanOrEqual(0.14);
    // …and over the brightest ground it may not exceed the fixed value it had
    // before the ramp existed.
    expect(
      glassAlphaFor(relLum(ENV.plot)),
      "die oberste Stufe darf nicht dichter sein als das Funktionsglas im Blatt",
    ).toBeLessThanOrEqual(GLASS_ALPHA_MAX);
    expect(
      parseColor(rootToken("glass-control-bg")).alpha,
      "das Blatt trägt genau die Decke der Kurve",
    ).toBe(GLASS_ALPHA_MAX);
    expect(
      parseColor(rootToken("material-read-bg")).alpha,
      "die Lesefläche bleibt die dicke Platte — dort stehen 245 Wörter",
    ).toBeGreaterThanOrEqual(0.92);
    expect(tiefste, "die Kurve hält jede Tinte über jedem Grund").toBeGreaterThanOrEqual(STUFE);
  });

  it("hält die Alarm-Tinte, wo sie ein Wort ist und nicht ein Signal", () => {
    // The scan announcement colours its own headline by the worst grade it
    // found. Measured on the glass over the plaza that reads 3,88:1 for P0,
    // 3,66:1 for the colour-blind vermilion and 2,73:1 for the colour-blind
    // blue — a 12 px sentence, so the floor is 4,5 and not the 3,0 of a shape.
    // `severityTextColor` lifts exactly those tones; this case recomputes all
    // six combinations over all four grounds the city can put behind the panel.
    const states = szene();
    const rein = fläche(states, "scan announcement");
    // Not just the ceiling: the stage a panel takes is the ground's own doing, so
    // every tone is judged over the field that ground and its rung produce. The
    // field is the washed one — the same 5 % sheen the ladder case composes —
    // because two cases modelling two different screens is how a half-hundredth
    // under AA survives a green suite: without the wash the alarm words read
    // 4,50–4,53 on the horizon, with it 4,46–4,49.
    const felder = [
      ...GRÜNDE,
      { sagt: "Straße", farbe: ENV.road },
      { sagt: "Kantenstein", farbe: ENV.curb },
      { sagt: "Monolith", farbe: "#17171a" },
    ].map((x) => {
      const stufe = parseColor(`rgba(14, 16, 21, ${glassAlphaFor(relLum(x.farbe))})`);
      const grund = toHex(composite(stufe, x.farbe));
      return toHex(composite({ rgb: parseColor("#f2efe8").rgb, alpha: 0.05 }, grund));
    });
    for (const sev of ["P0", "P1", "P2"] as const) {
      for (const cb of [false, true]) {
        const text = severityTextColor(sev, cb);
        const signal = severityColor(sev, cb);
        const zellen = felder.map((feld) => ({ feld, r: contrast(text, feld) }));
        const schwächste = Math.min(...zellen.map((z) => z.r));
        expect(
          schwächste,
          `${sev}${cb ? " (CVD)" : ""} als Wort auf dem Glas: ${text} → ${schwächste.toFixed(2)} — ${zellen
            .map((z) => `${z.feld} ${z.r.toFixed(2)}`)
            .join("  ")}`,
        ).toBeGreaterThanOrEqual(STUFE);
        // The pure tone stays the signal's own — and the case says why it had
        // to split: on at least one ground the unmixed alarm colour is not a
        // readable word. If it ever becomes readable, the split is redundant
        // and this assertion is where that becomes visible.
        // Kein Grund, ein Signal zu verdünnen, das schon lesbar ist: wo der
        // reine Ton überall hält, muss das Wort ihn tragen — und wo er fällt,
        // muss die Spalte in palette.ts ihn anheben. Beide Richtungen prüft
        // dieses eine Urteil, darum kann keine der beiden still veralten.
        const reine = Math.min(...felder.map((feld) => contrast(signal, feld)));
        if (reine >= STUFE) {
          expect(
            text,
            `${sev}${cb ? " (CVD)" : ""}: reiner Ton hält ${reine.toFixed(
              2,
            )} — die Text-Variante darf nicht heller malen als nötig`,
          ).toBe(signal);
        } else {
          expect(
            text,
            `${sev}${cb ? " (CVD)" : ""}: reiner Ton fällt auf ${reine.toFixed(
              2,
            )}, die Text-Variante muss ihn anheben`,
          ).not.toBe(signal);
        }
      }
    }
    expect(rein.worst, "die Fläche selbst hält ihre Tinten").toBeGreaterThanOrEqual(STUFE);
  });

  it("fällt, sobald die Konstante heller gemacht wird — der Wächter hat Zähne", () => {
    // A guard that cannot fail has not checked anything, so both mutations run
    // the same machinery as the cases above: no number is typed in here, every
    // one is what the composite of this file returns for the copied sheets.
    const gute = szene();
    const heller = szene(
      kopie("globals.css", (t) =>
        t.replace(
          /--glass-control-bg:\s*rgba\(14,\s*16,\s*21,\s*0\.75\)/,
          "--glass-control-bg: rgba(14, 16, 21, 0.55)",
        ),
      ),
    );
    for (const [i, f] of heller.entries()) {
      if (MATERIAL[f.surface.name] !== GLAS) continue;
      expect(f.worst, sag(f, "bei 0,55")).toBeLessThan(STUFE);
      expect(f.worst, sag(f, "fällt nicht gegenüber 0,75")).toBeLessThan(gute[i]?.worst as number);
    }
    // The reading plate must be untouched by a control mutation — that is what
    // makes the split a split and not a rename.
    for (const f of heller) {
      if (MATERIAL[f.surface.name] !== PLATTE) continue;
      expect(
        f.worst,
        sag(f, "die Lesematte ließ sich vom Funktionsglas mitnehmen"),
      ).toBeGreaterThanOrEqual(STUFE);
    }
  });

  it("fällt, sobald eine zweite, spätere Regel die Fläche an sich zieht", () => {
    // The shape that actually shipped here: a flat `#243747` sitting later in
    // globals.css than the token, which left the mode bar at rgb(36, 55, 71)
    // in the running app while the old case still found "a rule with token and
    // blur" somewhere in the tree and signed the surface off.
    const flache = szene(
      kopie("globals.css", (t) => `${t}\n.workspace-modes .glass {\n  background: #243747;\n}\n`),
    );
    const vorher = fläche(szene(), "mode bar");
    const modus = fläche(flache, "mode bar");
    expect(vorher.unlayered.length, "im echten Baum regieren zwei über der Modusleiste").toBe(1);
    const eigentümer = modus.unlayered.map((o) => `${o.rule.file}:${o.rule.line}`);
    expect(eigentümer, "zweite Regel, aber nur ein Eigentümer gemeldet").toHaveLength(2);
    expect(modus.winner?.colour, "flache Farbe gewinnt, genannt wird das Token").toBe("#243747");
    // Not a contrast claim: on a dark flat plate the vibrant ladder still reads
    // (measured 6,90), so the defect this case exists for is structural — a
    // second rule that steals the surface and with it the stage. That is what
    // the two assertions above prove, and this one names the consequence: the
    // bar no longer takes a stage at all, because no token is left on it.
    expect(
      modus.winner?.decl.value,
      "die flache Platte trägt kein Material-Token mehr — sie kann nicht mehr mit dem Grund gehen",
    ).not.toMatch(/glass-control-bg|material-read-bg/);
  });
});
