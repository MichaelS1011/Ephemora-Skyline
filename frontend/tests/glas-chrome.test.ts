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
// ── Soll-Zustand: sechzehn Fälle, was sie behaupten, wie oft sie asserten ───
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
//  13 Minimap-Platte               Material + 3 Schichten gegen die Blätter + 2 Stufen     —        23
//                                  + α/Frost reduziert + Titel 8 Felder × 2 Tinten
//  14 Zähne: Platte erfindet sich  echte Quelle grün + 4 Kopien (Material, Frost, Rot,     —        11
//                                  Blatt ohne Reduziert-Stufe) + 5 Urteile
//  15 Alarmzeile der Platte        1 Regel, unlayered + Stufe als Skala-Token (exakt       —        18
//                                  --fs-meta, ≥ Typboden) + Zeilenhöhe + Rand + Tinte
//                                  als vorhandenes Ink-Token, gemessen auf 4 Plattenfeldern
//  16 Zähne: Zeile ohne Regel      echte Quelle grün + 4 Kopien (Regel weg: 4 Pflichten    —        11
//                                  leer, Rohwert, Signalrot < 4,5, zweiter Gap) + 2 Urteile
//  ────────────────────────────────────────────────────────────────────────────────────────────
//  Kein Verhalten entfernt, nichts gelockert: 165 → 179 Fallkörper-Assertions, mit den beiden
//  Platten-Fällen 179 → 213, mit der Alarmzeile 213 → 242. Fälle 3, 10 und
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
/** Die schwebende Platte unter der Stadt: Chrome und Wort stehen nicht in einem
 *  Blatt, sondern inline in ihrem Component (siehe den Block unten). */
const MINIMAP = quelle("../src/components/Minimap.tsx");

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
    const { colourLayer, sheen, felder } = hintergrundFelder(
      winner ? resolveVars(value, tokens) : "",
    );
    const bg = colourLayer ? parseColor(colourLayer) : null;
    // Tint over the ground first, then the sheen over that — what the browser
    // draws, in the order it draws it (`hintergrundFelder`).
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

/** Was ein aufgelöster `background`-Wert über die vier hellen Gründe der Stadt
 *  malt: erst die Grundfarbe über den Grund, darüber der Glanz — in der
 *  Reihenfolge, die der Browser zeichnet. Dieselbe Rechnung trägt die Chrome-Szene
 *  und die Minimap-Platte unten: zwei Kopien davon wären zwei Bildschirme, und
 *  einer davon würde stillschweigend ein anderes Feld behaupten. */
function hintergrundFelder(resolvedValue: string): {
  colourLayer: string | undefined;
  sheen: string | null;
  felder: string[];
} {
  const layers = layersOf(resolvedValue);
  // The colour layer is the one that is a plain colour (it may itself be an
  // `rgba()` literal); an image layer is the one naming a gradient function.
  const isColour = (layer: string): boolean =>
    /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.test(layer) && !/gradient\(/i.test(layer);
  const colourLayer = [...layers].reverse().find(isColour);
  const sheen = layers.find((l) => /gradient\(/i.test(l))?.match(/rgba?\([^)]*\)/)?.[0] ?? null;
  const bg = colourLayer ? parseColor(colourLayer) : null;
  const felder = bg
    ? GROUNDS.map((ground) => {
        const getönt = toHex(composite(bg, ground));
        return sheen ? toHex(composite(parseColor(sheen), getönt)) : getönt;
      })
    : [];
  return { colourLayer, sheen, felder };
}

/* ── Die Minimap-Platte ─────────────────────────────────────────────────────
 * She is the one floating surface whose whole chrome is written inline in a
 * component instead of in a sheet, so no cascade reader in this file ever saw
 * her. Measured on the running screen (2026-10-25, 1280×800 @2×, demo and the
 * stored 77-finding scan): `rgba(16, 16, 14, 0.85)`, `blur(4px)`, a
 * `rgba(232,80,60,0.2)` edge and a title in `rgba(232,80,60,0.5)` — four
 * numbers the shell owns as tokens, and one word that reads 1,93:1 over its own
 * field and 1,85:1 over the brightest ground that can carry the plate. The
 * `prefers-reduced-transparency` block in globals.css answers the same request
 * on every bar (`--material-read-bg: rgb(18, 18, 16)`, `--glass-chrome-blur:
 * none`); an inline literal cannot be answered, so the plate kept its
 * translucency and its blur while the rest of the shell went solid — measured,
 * not inferred: with the query emulated the tokens read `rgb(18, 18, 16)`/`none`
 * and the plate still computed `rgba(16, 16, 14, 0.85)`/`blur(4px)`.
 *
 * An inline style is not a design file, so this block reads the declaration the
 * way `TINTEN` reads the dock's: from the component, with the sheet's own token
 * values and the sheet's own reduce rules resolved behind it. */

/** Der `style`-Block der Platte und der des Titels. Der Titel wird an seinem
 *  sichtbaren Wort verankert, nicht an einer Utility-Klasse: Klassen wandern,
 *  „CITY MAP“ ist der Grund, warum die Zeile da steht. */
const PLATTEN_BLOCK = /className="city-minimap[\s\S]*?style=\{\{([\s\S]*?)\}\}/;
const TITEL_BLOCK = /style=\{\{([^}]*)\}\}\s*>\s*\{t\(lang, "minimap\.title"\)/;

/** Eine Deklaration aus einem inline-`style`-Objekt, beim Eigenschaftsnamen. */
function inlineDeklaration(
  quelle: string,
  block: RegExp,
  eigenschaft: string,
  was: string,
): string {
  const m = withoutComments(quelle).match(block);
  expect(m, `${was}: kein style-Objekt in der Quelle`).not.toBeNull();
  const wert = new RegExp(`(?:^|,)\\s*${eigenschaft}\\s*:\\s*"([^"]*)"`).exec(
    (m as RegExpMatchArray)[1] ?? "",
  )?.[1];
  expect(wert, `${was}: ${eigenschaft} wird nicht gesetzt`).not.toBeUndefined();
  return (wert as string).replace(/\s+/g, " ").trim();
}

/** Die Stufe, die der `prefers-reduced-transparency`-Block aus einem Token macht
 *  — aus den Regeln des Blatts gelesen, nicht nachgeschrieben. Schreibt der Block
 *  nichts, gilt der `:root`-Wert: ein Literal und ein Token, das niemand
 *  umstellt, sind für die Leserin dasselbe durchscheinende Material. */
function reduziertStufe(files: Sheets, token: string | undefined): string | undefined {
  if (!token) return undefined;
  return (
    rulesOf(files)
      .filter(
        (r) =>
          selektoren(r.sel).includes(":root") &&
          r.media.some((m) => /prefers-reduced-transparency/.test(m)),
      )
      .flatMap((r) => r.decls.filter((d) => d.prop === token).map((d) => d.value))
      .pop() ?? tokensOf(files).get(token)
  );
}

const tokenVon = (ebene: string): string | undefined => ebene.match(/^var\((--[\w-]+)\)$/)?.[1];

/** Was die Platte malt: ihr Material (Token oder Literal), ihre Unschärfe, ihre
 *  Kante und die Tinte ihres Titels — in der normalen Stufe und in der, die das
 *  Blatt für `prefers-reduced-transparency` schreibt. Die Felder, über denen der
 *  Titel gelesen wird, sind die der normalen Stufe: dort ist das Feld heller, die
 *  Messung also die strengere. */
function platteIn(files: Sheets, quelle: string) {
  const tokens = tokensOf(files);
  const background = inlineDeklaration(quelle, PLATTEN_BLOCK, "background", "Minimap-Platte");
  const unscharf = inlineDeklaration(quelle, PLATTEN_BLOCK, "backdropFilter", "Minimap-Platte");
  const kante = inlineDeklaration(quelle, PLATTEN_BLOCK, "border", "Minimap-Platte");
  const titel = inlineDeklaration(quelle, TITEL_BLOCK, "color", "Minimap-Titel");
  const ebenen = layersOf(background);
  const material = ebenen[ebenen.length - 1] ?? "";
  const materialToken = tokenVon(material);
  const unscharfToken = tokenVon(unscharf);
  /** Die Stufe, die wirklich gilt: was das Blatt umstellt, sonst der Wert, den die
   *  Platte selbst nennt. Ein Literal hat keine Stufe — darum bleibt sie durchsichtig. */
  const stufe = (token: string | undefined, normal: string): string =>
    (token ? reduziertStufe(files, token) : undefined) ?? normal;
  const aufgelöst = hintergrundFelder(resolveVars(background, tokens));
  return {
    background,
    material,
    materialToken,
    /** ihr Grundton in der normalen Stufe … */
    alphaNormal: parseColor(resolveVars(material, tokens)).alpha,
    /** … und wenn weniger Durchsichtigkeit verlangt wird */
    alphaReduziert: parseColor(stufe(materialToken, material)).alpha,
    unscharf,
    unscharfToken,
    /** ihre Frostung, wenn weniger Durchsichtigkeit verlangt wird — `none` ist
     *  die Antwort, die globals.css für jede andere Chrome-Fläche gibt */
    unscharfReduziert: stufe(unscharfToken, resolveVars(unscharf, tokens)),
    kante,
    kanteToken: kante.match(/var\((--[\w-]+)\)/)?.[1],
    sheen: ebenen.length > 1 ? (ebenen[0] as string) : null,
    sheenToken: ebenen.length > 1 ? tokenVon(ebenen[0] as string) : undefined,
    titel,
    titelToken: tokenVon(titel),
    /** Die Tinte, die die Schale wirklich streut: `.app-shell` hebt die zwei
     *  Stufen der Sekundärlabels an (globals.css:1903) — gemessen auf der
     *  laufenden Seite `rgb(215, 226, 233)`. Und ihre `:root`-Stufe dazu, die die
     *  Platte außerhalb der Schale malen würde: die strengere der beiden hält sie
     *  auch, darum trägt dieser Fall beide. */
    titelFarbe: parseColor(
      tokenVon(titel) ? inkInScope(files, tokenVon(titel) as string, ".app-shell") : titel,
    ),
    titelFarbeRoot: parseColor(resolveVars(titel, tokens)),
    felder: aufgelöst.felder,
  };
}

/** Eine Tinte über jedem Feld, das die Platte malt. Titel und Alarmzeile
 *  rechnen dieselbe Masche, darum steht sie einmal hier: zwei Kopien wären zwei
 *  Bildschirme, und einer davon behauptete stillschweigend ein anderes Feld. */
function tinteAufPlatte(
  p: ReturnType<typeof platteIn>,
  farbe: { rgb: [number, number, number]; alpha: number },
  sagt: string,
): Array<{ sagt: string; feld: string; c: number }> {
  return p.felder.map((feld, i) => ({
    sagt: `${GRÜNDE[i]!.sagt}, ${sagt}`,
    feld,
    c: contrast(toHex(composite(farbe, feld)), feld),
  }));
}

/** Der Titel über jedem Feld, das die Platte malt — in beiden Stufen der Tinte,
 *  die die Schale streuen kann. */
function titelFelder(
  p: ReturnType<typeof platteIn>,
): Array<{ sagt: string; feld: string; c: number }> {
  return [
    ...tinteAufPlatte(p, p.titelFarbe, "gestreut"),
    ...tinteAufPlatte(p, p.titelFarbeRoot, ":root"),
  ];
}

/** Die Regel, die über der Alarmzeile der Platte regiert — eine Liste, damit ihr
 *  Fehlen eine Zahl ist und nicht ein Schweigen. Der Fall, der diese Runde
 *  ausgelöst hat, war genau diese Leere: `Minimap.tsx:304` trug die Klasse
 *  `.minimap-alarm`, die kein Blatt des Baums kannte. */
const alarmRegel = (files: Sheets): Rule[] => flächentreffer(".minimap-alarm", files);

/** Eine Deklaration dieser Regel beim Eigenschaftsnamen. */
const deklariert = (files: Sheets, prop: string): Decl | undefined =>
  alarmRegel(files)[0]?.decls.find((d) => d.prop === prop);

/** Die obere Kante eines `margin`-Werts in px. Der Abstand über der Zeile ist
 *  eine Pflicht, weil der Titel darüber schon `mb-1` trägt. */
const randOben = (wert: string): number => {
  const erste = wert.trim().split(/\s+/)[0] ?? "";
  const zahl = Number(erste.replace(/[^0-9.]/g, ""));
  return /rem/.test(erste) ? zahl * 16 : zahl;
};

/** Die Token-Namen, mit denen die Blätter ihre Chrome-Flächen verglasen: erste
 *  Ebene des `background` ist der Glanz, `border` die Kante, `backdrop-filter`
 *  die Frostung. Die Platte wird gegen diese Mengen gehalten, statt dass hier
 *  ein Tokenname nachgeschrieben steht — ein Blatt, das seinen Glanz umbenennt,
 *  zieht die Platte mit, und ein Blatt ohne Chrome-Glanz lässt sie fallen. */
function chromeSchichten(files: Sheets): {
  glanz: Set<string>;
  kanten: Set<string>;
  frost: Set<string>;
} {
  const tokens = tokensOf(files);
  const namenVon = (werte: Set<string>): Set<string> =>
    new Set(
      [...werte].map((w) => w.match(/var\((--[\w-]+)\)/)?.[1]).filter((t): t is string => !!t),
    );
  const glanz = new Set<string>();
  for (const wert of chromeDeklaration(files, /^background$/)) {
    const erste = layersOf(wert)[0] ?? "";
    if (/gradient\(/i.test(resolveVars(erste, tokens))) {
      const t = tokenVon(erste);
      if (t) glanz.add(t);
    }
  }
  return {
    glanz,
    kanten: namenVon(chromeDeklaration(files, /^border$/)),
    frost: namenVon(chromeDeklaration(files, /^backdrop-filter$/)),
  };
}

/** Die Chrome-Deklarationen, die die Blätter wirklich schreiben — die Vergleiche
 *  unten nennen keine Token von Hand, sie lesen ab, was die Schale trägt. */
const chromeDeklaration = (files: Sheets, prop: RegExp): Set<string> =>
  new Set(
    rulesOf(files).flatMap((r) =>
      r.decls
        .filter((d) => prop.test(d.prop) && /var\(--glass/.test(d.value))
        .map((d) =>
          d.value
            .replace(/!important/g, "")
            .replace(/\s+/g, " ")
            .trim(),
        ),
    ),
  );

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

  /** Eine Kopie der Plattenquelle mit genau einer anderen Deklaration. Wie bei
   *  `kopie` gilt: eine Kopie, an der der Replace vorbeiläuft, wäre ein grüner
   *  Wächter über nichts — darum wird angekommen geprüft, nicht vorausgesetzt. */
  const minimapKopie = (ändern: (text: string) => string): string => {
    const aus = ändern(MINIMAP);
    expect(aus, "die Kopie hat die Platte nicht erreicht").not.toBe(MINIMAP);
    return aus;
  };

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

  /* ── Die Platte unter der Stadt: Chrome und Wort stehen inline, kein Blatt
        regiert sie, also muss dieses hier sie lesen. ─────────────────────── */

  it("hält die Minimap-Platte ihr Material, ihre Kante, ihr Wort", () => {
    const p = platteIn(css, MINIMAP);
    const schichten = chromeSchichten(css);
    // 1) Die Platte malt ihren Grundton nicht selbst — sie trägt eines der zwei
    //    Materialien, die dieses Blatt kennt. Ein mitgebrachtes rgba(16,16,14,0,85)
    //    ist keine Stufe, sondern eine zweite Meinung.
    expect(p.materialToken, `die Platte legt einen eigenen Grundton: ${p.material}`).toBeTruthy();
    expect([GLAS, PLATTE], `${p.material} ist keines der beiden Materialien der Schale`).toContain(
      `var(${p.materialToken})`,
    );
    // 2) Glanz, Kante und Frostung sind abgelesen: die Platte trägt, was die Bars
    //    tragen, und erfindet nebenher kein vielles Zahlenspiel.
    expect(schichten.glanz.size, "die Blätter schreiben keinen Chrome-Glanz mehr").toBeGreaterThan(
      0,
    );
    expect(schichten.kanten.size, "die Blätter schreiben keine Chrome-Kante mehr").toBeGreaterThan(
      0,
    );
    expect(
      schichten.frost.size,
      "die Blätter schreiben keine Chrome-Frostung mehr",
    ).toBeGreaterThan(0);
    expect(
      p.sheenToken ? schichten.glanz.has(p.sheenToken) : false,
      `der Glanz der Platte (${p.sheen ?? "keiner"}) steht auf keiner Chrome-Fläche`,
    ).toBe(true);
    expect(
      p.kanteToken ? schichten.kanten.has(p.kanteToken) : false,
      `die Kante ${p.kante} ist keine Chrome-Kante`,
    ).toBe(true);
    expect(
      p.unscharfToken ? schichten.frost.has(p.unscharfToken) : false,
      `die Frostung ${p.unscharf} ist keine Chrome-Frostung`,
    ).toBe(true);
    // 3) In der normalen Stufe ist sie Glas — sonst wäre das hier eine opake
    //    Platte, die sich nur so nennt.
    expect(p.alphaNormal, "die Platte malt opak, wo Glas gemeint ist").toBeGreaterThan(0);
    expect(p.alphaNormal, "die Platte malt opak, wo Glas gemeint ist").toBeLessThan(1);
    // 4) Und wenn die Leserin weniger Durchsichtigkeit verlangt, wird das Material
    //    fest und die Frostung verschwindet. Apple's Materials page trägt diese
    //    Pflicht an die durchscheinende Schicht, und globals.css löst sie für
    //    jedes Bar ein — eine inline geschriebene Zahl kann niemand umstellen.
    expect(
      p.alphaReduziert,
      `unter reduzierter Transparenz bleibt die Platte bei α ${p.alphaReduziert} durchscheinend`,
    ).toBe(1);
    expect(
      p.unscharfReduziert,
      `unter reduzierter Transparenz steht noch ${p.unscharfReduziert} hinter der Platte`,
    ).toBe("none");
    // 5) Ihr Titel ist ein Wort in der Tinte der Schale, nicht ein halbdurchlässiger
    //    Alarmton: 0,5 deckende Schrift ist keine leise Schrift, sie ist eine, die
    //    niemand lesen kann (gemessen 1,93:1 auf dem eigenen Feld).
    expect(p.titelToken, `der Titel malt seine Tinte selbst: ${p.titel}`).toBeTruthy();
    expect(p.titelFarbe.alpha, `die Titel-Tinte deckt nur ${p.titelFarbe.alpha}`).toBe(1);
    expect(p.felder, `Felder ${p.felder.join(" ")}`).toHaveLength(GROUNDS.length);
    for (const z of titelFelder(p)) {
      expect(
        z.c,
        `Minimap-Titel ${p.titel} über ${z.sagt} (${z.feld}): ${z.c.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
  });

  it("fällt, sobald die Minimap-Platte sich Material und Tinte wieder selbst malt", () => {
    // Gegenlauf: dieselbe Maschine, dreimal eine fehlerhafte Kopie der Entscheidung.
    // Die alte Form ist am laufenden Bildschirm ausgemessen (2026-10-25),
    // darum kann sie hier stehen.
    const gute = platteIn(css, MINIMAP);
    expect(
      Math.min(...titelFelder(gute).map((z) => z.c)),
      "die echte Quelle ist nicht grün",
    ).toBeGreaterThanOrEqual(STUFE);
    // a) die Platte legt ihr altes Literal über die Stadt
    const literal = platteIn(
      css,
      minimapKopie((t) =>
        t.replace(
          gute.background,
          gute.background.replace(gute.material, "rgba(16, 16, 14, 0.85)"),
        ),
      ),
    );
    expect(
      literal.alphaReduziert,
      "ein eigenes Literal lässt sich von der Reduziert-Stufe nicht umstellen",
    ).toBeLessThan(1);
    expect(literal.materialToken, "das Literal wurde als Token durchgegessen").toBeUndefined();
    // b) die Frostung wird zur eigenen Zahl
    const scharf = platteIn(
      css,
      minimapKopie((t) => t.replace(`"${gute.unscharf}"`, '"blur(4px)"')),
    );
    expect(
      scharf.unscharfReduziert,
      "blur(4px) hielt die Reduziert-Stufe für verhandelbar",
    ).not.toBe("none");
    // c) der Titel zurück ins halbtransparente Alarmrot
    const rot = platteIn(
      css,
      minimapKopie((t) => t.replace(`"${gute.titel}"`, '"rgba(232, 80, 60, 0.5)"')),
    );
    expect(
      rot.titelFarbe.alpha,
      "ein halbtransparentes Wort wurde für deckend gelesen",
    ).toBeLessThan(1);
    const schwächste = Math.min(...titelFelder(rot).map((z) => z.c));
    expect(
      schwächste,
      `das alte Alarmrot fiele nicht durch die Masche — gemessen ${schwächste.toFixed(2)}`,
    ).toBeLessThan(STUFE);
    // d) und das Blatt nimmt die Antwort selbst zurück
    const stumm = platteIn(
      kopie("globals.css", (t) =>
        t.replace(new RegExp(`\\s*${gute.materialToken}:\\s*rgb\\([^)]*\\);`), ""),
      ),
      MINIMAP,
    );
    expect(
      stumm.alphaReduziert,
      "ohne die Reduziert-Stufe im Blatt malt die Platte weiter Glas",
    ).toBeLessThan(1);
  });

  it("hält die Alarmzeile der Platte ihre Stufe, ihre Tinte, ihren Rand", () => {
    // The plate's one sentence carried a class no sheet knew. Measured off the
    // running screen before this rule existed (2026-10-26, stored 77-finding
    // scan, EN, 1280×800 @2×, read off the plate's own box): the
    // plate's box was 244,5 px tall, of which border 2 + padding 8 + title box
    // 16,5 + the title's 4 + the 190 px map = 220,5 — the alarm row owned the
    // remaining 24 px, i.e. 16 px at the inherited line-height 1,5. Its glyphs
    // stood 2,06× as tall as the plate's own 11 px label, and its 255 px
    // max-content set the plate's width to 266,98 px: the sentence decided how
    // wide the map's plate was, by 67 px more than the map.
    const treffer = alarmRegel(css);
    expect(
      treffer.length,
      "über der Alarmzeile regiert keine eigene Regel — dann antwortet der Browser mit 16 px",
    ).toBe(1);
    const regel = treffer[0]!;
    expect(
      regel.layer,
      `die Regel liegt in @layer ${regel.layer} und verliert gegen jede unlayered`,
    ).toBeNull();
    // Stufe: ein Skala-Token, kein Rohwert, und genau die Zeile, die die
    // Messung der Platte hält — 175 px Satz in 190 px Karte, bei 12 px wären es
    // zwei Zeilen und die Platte wüchse über ihr eigenes Bild.
    const stufe = deklariert(css, "font-size");
    expect(stufe, "font-size fehlt — die Zeile hätte keine Stufe").toBeDefined();
    expect(stufe!.value, `font-size ${stufe!.value} ist kein Token der Typskala`).toMatch(
      /^var\(--fs-[\w-]+\)$/,
    );
    expect(
      stufe!.value,
      "--fs-meta ist die gemessene Stufe dieser Platte; eine andere ist eine neue Entscheidung",
    ).toBe("var(--fs-meta)");
    const px = Number(resolveVars(stufe!.value, tokensOf(css)).match(/([\d.]+)px/)?.[1]);
    expect(px, `${stufe!.value} ist nicht in px zu lesen`).not.toBeNaN();
    // typeFloor.test.ts: 11 px ist die kleinste Schrift, die dieses Projekt kennt
    expect(px, `${px} px liegt unter dem Typboden des Projekts`).toBeGreaterThanOrEqual(11);
    // Zeilenhöhe und Rand sind Ansagen des Blatts, nicht Nebenwirkungen eines Resets
    const höhe = deklariert(css, "line-height");
    expect(höhe, "line-height fehlt — die Zeilenhöhe erbt die Zeile von außen").toBeDefined();
    expect(
      Number(höhe!.value),
      `Zeilenhöhe ${höhe!.value} ist lockerer als die 1,5, die vorgefunden wurde`,
    ).toBeLessThanOrEqual(1.5);
    const rand = deklariert(css, "margin");
    expect(rand, "margin fehlt — der Rand stünde in keinem Blatt").toBeDefined();
    expect(
      rand!.value,
      `margin ${rand!.value}: oben trägt der Titel schon seinen Abstand, unten steht die Karte`,
    ).toBe("0 0 4px");
    // Tinte: ein vorhandenes Ink-Token, gemessen über den Feldern, die die
    // Platte selbst malt — nicht über dem Blatt.
    const tinte = deklariert(css, "color");
    expect(
      tinte,
      "color fehlt — die Zeile malte ihre Tinte nicht selbst, aber auch niemand",
    ).toBeDefined();
    const token = tinte!.value.match(/^var\((--[\w-]+)\)$/)?.[1];
    expect(token, `die Alarmzeile malt ihre Tinte selbst: ${tinte!.value}`).toBeDefined();
    expect(
      tokensOf(css).has(token as string),
      `${token} ist in keinem der vier Blätter definiert`,
    ).toBe(true);
    const farbe = parseColor(inkInScope(css, token as string, ".app-shell"));
    for (const z of tinteAufPlatte(platteIn(css, MINIMAP), farbe, token as string)) {
      expect(
        z.c,
        `Alarmzeile ${token} über ${z.sagt} (${z.feld}): ${z.c.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
  });

  it("fällt, sobald die Alarmzeile ihre Regel verliert oder sie sich selbst malt", () => {
    // Gegenlauf: dieselbe Maschine, vier fehlerhafte Kopien. Die erste ist der
    // Ist-Zustand, der diese Runde ausgelöst hat — eine Klasse ohne Regel.
    const gute = alarmRegel(css);
    expect(
      gute.length,
      "die echte Quelle trägt keine Regel; ohne sie wäre jeder Gegenlauf wertlos",
    ).toBe(1);
    // a) die Regel ist weg: dann schreibt niemand mehr Stufe, Höhe, Rand oder Tinte
    const stumm = kopie("globals.css", (t) => t.replace(/\.minimap-alarm\s*\{[^}]*\}/, ""));
    expect(
      alarmRegel(stumm),
      "die Kopie trägt die Regel noch — der Replace lief vorbei",
    ).toHaveLength(0);
    for (const prop of ["font-size", "line-height", "margin", "color"]) {
      expect(
        deklariert(stumm, prop),
        `ohne Regel schreibt ${prop} immer noch jemand — die Masche liest eine fremde Zeile`,
      ).toBeUndefined();
    }
    /** Eine Kopie, in der genau eine Deklaration DIESER Zeile anders steht. Die
     *  Klammer ist kein Putz: `font-size: var(--fs-meta)` und
     *  `color: var(--color-text)` stehen im Blatt mehrfach, und eine ungeklammerte
     *  Ersetzung träfe die erste davon — die Kopie wäre geändert, die Zeile nicht,
     *  und der Gegenlauf liefe grün über nichts. */
    const alarmKopie = (ändern: (block: string) => string): Sheets =>
      kopie("globals.css", (t) =>
        t.replace(/\.minimap-alarm\s*\{[^}]*\}/, (block) => {
          const neu = ändern(block);
          expect(neu, "die Kopie erreicht die Alarmzeile nicht").not.toBe(block);
          return neu;
        }),
      );
    // b) die Stufe zurück auf den Rohwert, mit dem die Zeile gemessen wurde
    const roh = alarmKopie((b) => b.replace("font-size: var(--fs-meta);", "font-size: 16px;"));
    expect(
      deklariert(roh, "font-size")!.value,
      "ein Rohwert wurde als Skala-Token durchgegessen",
    ).not.toMatch(/^var\(--fs-/);
    // c) die Tinte zurück ins Signalrot: über den Feldern dieser Platte gemessen
    //    3,91–4,06:1, also ein Wort unter der AA-Stufe
    const rot = alarmKopie((b) => b.replace("color: var(--color-text);", "color: #e8503c;"));
    const rote = deklariert(rot, "color")!;
    expect(rote.value, "ein Hex wurde als Ink-Token durchgegessen").not.toMatch(/^var\(/);
    const schwächste = Math.min(
      ...tinteAufPlatte(platteIn(rot, MINIMAP), parseColor(rote.value), "rot").map((z) => z.c),
    );
    expect(
      schwächste,
      `das Alarmrot hielte ${schwächste.toFixed(2)} — die Tinten-Masche wäre zu locker`,
    ).toBeLessThan(STUFE);
    // d) ein Rand, der den Abstand doppelt, den der Titel darüber schon trägt
    const weit = alarmKopie((b) => b.replace("margin: 0 0 4px;", "margin: 12px 0 4px;"));
    expect(
      randOben(deklariert(css, "margin")!.value),
      "die echte Zeile stapelt einen zweiten Abstand über den des Titels",
    ).toBe(0);
    expect(
      randOben(deklariert(weit, "margin")!.value),
      "die Kopie stapelt 12 px obendrauf, ohne dass die Masche es merkt",
    ).toBe(12);
  });
});

/* ── Die drei AA-Tinten der schwebenden Platten (2026-10-26) ─────────────────
 * Ein Inventurdurchgang maß drei Texttinten unter die hauseigene AA-Stufe: den
 * Analyse-Knopf während des Laufes (gedimmt 1,48–1,49:1, ungedimmt 2,51–2,56:1),
 * das „ungeprüft“-Wort des Tooltip-Badges (2,90–2,97:1 — die Fläche, für die
 * `UNCHECKED_COLOR` geschrieben wurde, kennt nur 2,5:1 für AREA, palette.ts:232)
 * und den Pfad in der Tour-Platte (3,35–3,45:1, an einer Stelle, wo die
 * gemessene Leiter 4,71:1 hart erstritten hat, globals.css:1038-1054). Alle
 * drei sitzen auf durchscheinenden Platten; die Masche kompositet sie — wie die
 * Chrome-Szene oben — über die vier hellsten Gründe, die die Stadt zeigen kann.
 * Die Gegenläufe rechnen dieselben Felder mit den alten Literalen zurück; dass
 * sie dann unter die Stufe fallen, ist der Beweis, dass die Wache nicht grün
 * über nichts läuft. */
describe("Die drei AA-Tinten der schwebenden Platten halten die Stufe", () => {
  const ANALYZE = quelle("../src/components/AnalyzePanel.tsx");
  const TOOLTIP_SRC = quelle("../src/components/Tooltip.tsx");
  const TOUR = quelle("../src/components/SecurityTour.tsx");
  const PALETTE = quelle("../src/city/palette.ts");

  /** Ein inline-`style`-Block, beim Anker des sichtbaren Elements. */
  const KNOPF_BLOCK = /disabled=\{isAnalyzing\}[\s\S]*?style=\{\{([\s\S]*?)\}\}/;
  const FENSTER_BLOCK = /id="analyze-panel"[\s\S]*?style=\{\{([\s\S]*?)\}\}/;
  const PLATTE_BLOCK = /role="tooltip"[\s\S]*?style=\{\{([\s\S]*?)\}\}/;
  const TOUR_BLOCK = /className="security-tour[\s\S]*?style=\{\{([\s\S]*?)\}\}/;
  const PFAD_BLOCK = /className="font-normal" style=\{\{([^}]*)\}\}[\s\S]{0,90}stop\.file\.path/;

  /** Die vier Felder einer Platte: ihr aufgelöstes `background` über den Gründen. */
  const plattenFelder = (text: string, block: RegExp, was: string): string[] =>
    hintergrundFelder(resolveVars(inlineDeklaration(text, block, "background", was), tokensOf(css)))
      .felder;

  /** Was der Mensch sieht, wenn eine Teil-transparent-Tinte über einem Feld liegt. */
  const mischung = (tinte: string, alpha: number, feld: string): string =>
    toHex(composite({ rgb: parseColor(tinte).rgb, alpha }, feld));

  it("malt den Analyse-Knopf in voller Marke statt in zwei Dimmungen", () => {
    // Die Deklaration, gelesen wie die Dock-Zeilen: aus dem Component selbst.
    const tinte = inlineDeklaration(ANALYZE, KNOPF_BLOCK, "color", "Analyse-Knopf");
    expect(tinte, `der Knopf malt seine Tinte selbst: ${tinte}`).toBe("var(--brand-red)");
    const farbe = inkInScope(css, "--brand-red", ".app-shell");
    expect(farbe, "--brand-red löst nicht zur ausgelieferten Marke auf").toBe(
      rootToken("brand-red"),
    );
    // Keine Dimmung: `disabled:opacity-50` ist weg, kein zweiter Ton für denselben
    // Zustand — das Wort „Analysing…/Analyse läuft…“ trägt den Status allein.
    expect(
      withoutComments(ANALYZE).match(/disabled=\{isAnalyzing\}[\s\S]*?className="([^"]*)"/)?.[1],
      "der Knopf hält eine disabled:opacity-Klasse",
    ).not.toMatch(/disabled:opacity-/);
    expect(
      stateDim(ANALYZE),
      "eine inline-Opazität dimmt wieder — gedimmte Wort-Tinte drückt unter die Stufe",
    ).toBe(1);
    // Feld: die Popover-Platte rgba(16,16,14,0.96) über den vier hellen Gründen,
    // darüber der rote Wasch des laufenden Zustands.
    const felder = plattenFelder(ANALYZE, FENSTER_BLOCK, "Analyse-Popover");
    expect(felder).toHaveLength(GRÜNDE.length);
    const washWert = withoutComments(ANALYZE).match(
      /background:\s*isAnalyzing\s*\?\s*"(rgba\(232, ?80, ?60, ?[\d.]+\))"/,
    )?.[1];
    expect(washWert, "der laufende Zustand malt keinen lesbaren roten Wasch").toBeDefined();
    const wasch = parseColor(washWert as string);
    expect(
      wasch.alpha,
      "der Wasch des laufenden Zustands ist nicht der gemessene 0,05-Ton",
    ).toBeLessThanOrEqual(0.1);
    for (const [i, grund] of GRÜNDE.entries()) {
      const feld = felder[i]!;
      const c = contrast(farbe, toHex(composite(wasch, feld)));
      expect(c, `${grund.sagt}: Marke über ${feld}: ${c.toFixed(2)}`).toBeGreaterThanOrEqual(STUFE);
      // Gegenlauf: das alte Dunkelrot, ungedimmt und dann mit der alten
      // 0,5-Dimmung über demselben Feld — beide müssen durch die Masche fallen.
      const altOhne = contrast("#a03a2c", toHex(composite(wasch, feld)));
      expect(
        altOhne,
        `der alte Ton hielte ungedimmt ${altOhne.toFixed(2)} — die Masche wäre zu locker`,
      ).toBeLessThan(STUFE);
      const feldGedimmt = mischung(toHex(composite(wasch, feld)), 0.5, feld);
      const tinteGedimmt = mischung("#a03a2c", 0.5, feld);
      const altMit = contrast(tinteGedimmt, feldGedimmt);
      expect(
        altMit,
        `der alte gedimmte Ton hielte ${altMit.toFixed(2)} — die Masche wäre zu locker`,
      ).toBeLessThan(STUFE);
    }
  });

  it("setzt das ungeprüft-Wort des Tooltip-Badges auf die Leiter — als Wort, nicht als Fläche", () => {
    // Zwei Tinten, ein Grad — die severityTextColor-Regel (ScanSummary.tsx:258-290):
    // die Wort-Tinte steht am badgeInk, die Signalfarbe bleibt Fläche und Rand.
    expect(
      withoutComments(TOOLTIP_SRC).match(/badgeInk\s*=\s*"var\(--meta-strong\)"/),
      "das Badge-Wort malt keine Leiter-Tinte",
    ).not.toBeNull();
    expect(
      withoutComments(TOOLTIP_SRC).match(/color:\s*badgeInk \|\| badgeColor/),
      "die Badge-Deklaration zieht den Wort-Ton nicht ein",
    ).not.toBeNull();
    const felder = plattenFelder(TOOLTIP_SRC, PLATTE_BLOCK, "Tooltip-Platte");
    expect(felder).toHaveLength(GRÜNDE.length);
    const werte = [inkInScope(css, "--meta-strong", ".app-shell"), rootToken("meta-strong")];
    for (const tinte of werte) {
      for (const feld of felder) {
        // Das Badge streut über der Platte seinen eigenen 8-%-Wasch der Signalfarbe.
        const badgeFeld = mischung(UNCHECKED_COLOR, 0x15 / 255, feld);
        const c = contrast(tinte, badgeFeld);
        expect(c, `${tinte} über ${badgeFeld}: ${c.toFixed(2)}`).toBeGreaterThanOrEqual(STUFE);
      }
      // Gegenlauf: dieselbe Masche mit der alten Wort-Tinte — der Ton war für
      // AREA geschrieben (2,5:1-Boden, palette.ts:232), nicht für ein 12-px-Wort.
      const alt = contrast(UNCHECKED_COLOR, mischung(UNCHECKED_COLOR, 0x15 / 255, felder[0]!));
      expect(
        alt,
        `die alte Wort-Tinte hielte ${alt.toFixed(2)} — die Masche wäre zu locker`,
      ).toBeLessThan(STUFE);
    }
  });

  it("führt den Tour-Pfad auf die gemessene --meta-Stufe der Leiter", () => {
    const pfad = withoutComments(TOUR).match(PFAD_BLOCK);
    expect(pfad, "der Pfad-Span der Tour ist nicht zu lesen").not.toBeNull();
    const tinte = /color:\s*"([^"]+)"/.exec((pfad as RegExpMatchArray)[1] ?? "")?.[1];
    expect(tinte, `der Pfad malt seine Tinte selbst: ${tinte}`).toBe("var(--meta)");
    const felder = plattenFelder(TOUR, TOUR_BLOCK, "Tour-Platte");
    expect(felder).toHaveLength(GRÜNDE.length);
    for (const stufe of [inkInScope(css, "--meta", ".app-shell"), rootToken("meta")]) {
      for (const feld of felder) {
        const c = contrast(stufe, feld);
        expect(c, `${stufe} über ${feld}: ${c.toFixed(2)}`).toBeGreaterThanOrEqual(STUFE);
      }
    }
    // Gegenlauf: das umgangen Literal — 3,35–3,45:1, und die Leiter sagt 4,71:1
    // hart erstritten an (globals.css:1038-1054), bevor jemand sie verlässt.
    for (const feld of felder) {
      const alt = contrast("#5a7090", feld);
      expect(
        alt,
        `der alte Pfadton hielte ${alt.toFixed(2)} — die Masche wäre zu locker`,
      ).toBeLessThan(STUFE);
    }
  });

  it("lässt die Signalfarbe des Badges dort, wo sie gehört: Fläche, Rand, Signal", () => {
    // Niemand „fixt“ das Signal weg: UNCHECKED_COLOR bleibt AREA-Ton der Platte
    // und bleibt an beiden Badge-Stellen der Flächen-Treiber.
    expect(
      PALETTE.match(/export const UNCHECKED_COLOR = "#6b6a63"/),
      "die Palette wirft den ungeprüft-Ton raus — das Signal wäre blind",
    ).not.toBeNull();
    const quelltext = withoutComments(TOOLTIP_SRC);
    expect(
      quelltext.match(/badgeColor = UNCHECKED_COLOR;/g)?.length,
      "die Bezirks-Zeile verliert die Signalfarbe als Flächen-Treiber",
    ).toBe(1);
    expect(
      quelltext.match(/\? UNCHECKED_COLOR : REVIEWED_BEACON_COLOR/),
      "die Datei-Zeile verliert die Signalfarbe als Flächen-Treiber",
    ).not.toBeNull();
    expect(
      quelltext.match(/background:\s*`\$\{badgeColor\}15`/),
      "der Badge-Wasch zieht die Signalfarbe nicht mehr",
    ).not.toBeNull();
    expect(
      quelltext.match(/border:\s*`1px solid \$\{badgeColor\}44`/),
      "der Badge-Rand zieht die Signalfarbe nicht mehr",
    ).not.toBeNull();
    // Zwei Tinten, ein Grad: die Wort-Tinte ist nicht die Flächen-Tinte — sonst
    // wäre der eine Ton durch die andere Pflicht wieder unsichtbar.
    const werte = [inkInScope(css, "--meta-strong", ".app-shell"), rootToken("meta-strong")];
    for (const tinte of werte) {
      expect(tinte.toLowerCase(), "Wort und Fläche teilen sich wieder einen Ton").not.toBe(
        UNCHECKED_COLOR,
      );
    }
    // Und das ruhige Grün derselben Zeile behält seinen eigenen Wort-Pfad
    // (7,5–7,8:1 über denselben Feldern gemessen) — diese Runde greift es nicht an.
    expect(
      quelltext.match(/badgeColor = UNCHECKED_COLOR;\s*\n\s*badgeInk = "var\(--meta-strong\)";/),
      "die Bezirks-Zeile: nur die ungeprüft-Stufe darf auf die Leiter, kein anderer Badge-Ton",
    ).not.toBeNull();
    expect(
      quelltext.match(
        /badgeColor = [^\n]*\? UNCHECKED_COLOR : REVIEWED_BEACON_COLOR;\s*\n\s*badgeInk = badgeColor === UNCHECKED_COLOR \? "var\(--meta-strong\)" : "";/,
      ),
      "die Datei-Zeile: Leiter nur für ungeprüft, das ruhige Grün bleibt bei seiner eigenen Tinte",
    ).not.toBeNull();
  });
});

/* ── Die Leiter als Token, nicht als Rohwert (2026-10-26) ───────────────────
 * Ein Inventurdurchgang zählte in vier schwebenden Platten Rohwerte für Größen,
 * die die Skala als Token besitzt: `fontSize: "0.75rem"` auf der Tooltip-Platte
 * (= 12 px, und kein Blatt überschreibt die 16-px-Wurzel), `text-[12px]` und
 * `text-[13px]` als 15 Klassenwerte in HeatmapToggle und ContextCard. Drei
 * Größen stehen NICHT auf der Leiter: 15 px (Card-Titel) und zweimal 22 px
 * (die zwei Census-Zahlen). Die Leiter endet bei `--fs-body` 13 px
 * (globals.css:103-106); für eine Anzeige über ihrer eigenen Obergrenze gab es
 * keinen Schritt zum Hinsetzen, und diese Runde erfindet ihn nicht still-
 * schweigend — die Anzeigen bleiben Literal, stehen aber beim Namen, damit eine
 * spätere Runde sie nicht als Übersehen „repariert“ oder eine dritte Größe
 * daneben legt.
 *
 * Ein Rohwert, der einer Stufe gleichkommt, ist kein Stilfehler nebenbei: die
 * Leiter ist der Ort, an dem Typboden (11 px) und die gemessenen Tinten hängen.
 * Eine Klasse, die an ihr vorbeischreibt, bleibt zurück, sobald die Leiter
 * wandert — derselbe Grund, warum `typeFloor.test.ts` den Boden guardiert.
 *
 * Fünf Fälle: (1) der Scan über vier Dateien mit benannten Anzeigen, (2) sein
 * Gegenlauf mit einem `text-[14px]` in einer Kopie, (3) die Tooltip-Stufe,
 * (4) das Schwerewort des Badge (Wort-Tinte statt Flächen-Signal; gemessen
 * 3,06:1 → 8,75:1 an der schwächsten Paarung), (5) die Marke des Baubalkens —
 * und der Grund, warum seine Fläche ihr Literal behält.
 */
describe("Die Typ-Skala der vier Platten trägt ihre Stufen als Token", () => {
  const TOOLTIP = quelle("../src/components/Tooltip.tsx");
  const HEAT = quelle("../src/components/HeatmapToggle.tsx");
  const CARD = quelle("../src/components/ContextCard.tsx");
  const HUD = quelle("../src/components/HudOverlay.tsx");
  const PLATTEN = {
    "Tooltip.tsx": TOOLTIP,
    "HeatmapToggle.tsx": HEAT,
    "ContextCard.tsx": CARD,
    "HudOverlay.tsx": HUD,
  } as const;
  const NAMEN = Object.keys(PLATTEN) as (keyof typeof PLATTEN)[];

  /** Die Leiter, aus dem Blatt gelesen — in dieser Datei steht kein Stufenwert. */
  const STUFEN = ["fs-meta", "fs-small", "fs-body"].map((n) => ({
    token: `--${n}`,
    px: Number((rootToken(n).match(/^([\d.]+)px$/) as RegExpMatchArray)[1]),
  }));

  /** Größen über der Leiter, die deliberately Literal bleiben — jede mit Grund.
   *  Ein Fund, der hier nicht beim Namen steht, ist rot; ein Eintrag ohne Fund
   *  ist rot (siehe `anzahl` unten). */
  const ANZEIGE: Array<{ datei: string; px: number; grund: string }> = [
    { datei: "ContextCard.tsx", px: 15, grund: "Card-Titel — die Leiter endet bei 13 px" },
    { datei: "ContextCard.tsx", px: 22, grund: "die zwei Census-Zahlen — kein Display-Schritt" },
  ];

  type Fund = { datei: string; zeile: number; roh: string; px: number };

  /** Ein Rohwert für eine Schriftgröße: Klassensyntax oder inline-`fontSize`.
   *  `text-[length:var(--fs-…)]` und `fontSize: "var(--fs-…)"` sind keine Funde —
   *  sie lesen die Leiter dort, wo die Leiter steht. */
  const rohwerte = (text: string, datei: string): Fund[] => {
    const zeile = (index: number): number => text.slice(0, index).split("\n").length;
    const funds: Fund[] = [];
    for (const m of text.matchAll(/text-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
      funds.push({
        datei,
        zeile: zeile(m.index),
        roh: m[0],
        px: Number(m[1]) * (m[2] === "rem" ? 16 : 1),
      });
    }
    for (const m of text.matchAll(/fontSize:\s*["']?(\d+(?:\.\d+)?)(px|rem)["']?/g)) {
      funds.push({
        datei,
        zeile: zeile(m.index),
        roh: m[0],
        px: Number(m[1]) * (m[2] === "rem" ? 16 : 1),
      });
    }
    for (const m of text.matchAll(/fontSize:\s*["']?(\d+(?:\.\d+)?)(?![\w.])/g)) {
      funds.push({ datei, zeile: zeile(m.index), roh: m[0], px: Number(m[1]) });
    }
    return funds;
  };

  /** Verboten ist ein Rohwert, der einer Stufe gleichkommt (die hat ein Token),
   *  oder einer, der keine benannte Anzeige ist. */
  const istisch = (f: Fund): boolean =>
    STUFEN.some((s) => s.px === f.px) || !ANZEIGE.some((a) => a.datei === f.datei && a.px === f.px);
  const melde = (f: Fund): string => `${f.datei}:${f.zeile} ${f.roh} (= ${f.px} px)`;

  it("kennt in den vier Platten jede Leiter-Stufe nur als Token", () => {
    // Die Leiter selbst: drei Schritte 11/12/13. Bewegt sie sich, ist die
    // Anzeige-Liste neu zu lesen — dieser Fall wird dann nicht stillschweigend grün.
    expect(
      STUFEN.map((s) => s.px),
      "die Leiter hat sich bewegt; die benannten Anzeigen gehören nachgelesen",
    ).toEqual([11, 12, 13]);
    const funds = NAMEN.flatMap((d) => rohwerte(PLATTEN[d], d));
    const fehlen = funds.filter(istisch);
    expect(
      fehlen.map(melde),
      `Rohwerte, wo ein Stufen-Token steht, oder eine unbenannte Größe:\n${fehlen
        .map(melde)
        .join("\n")}`,
    ).toEqual([]);
    // Nicht leerlaufend: genau die benannten Größen stehen wirklich in der
    // Quelle — eine (15 px) und zweimal (22 px).
    const anzahl = ANZEIGE.map(
      (a) => funds.filter((f) => f.datei === a.datei && f.px === a.px).length,
    );
    expect(
      anzahl,
      "die benannten Anzeigen stehen nicht mehr so in der Quelle, wie diese Wache sie nennt",
    ).toEqual([1, 2]);
    // Jede gemeldete Größe ist ≥ Typboden 11 px — die Wache ersetzt
    // `typeFloor.test.ts` nicht, sie liest sie nur mit.
    for (const f of funds) {
      expect(f.px, `${melde(f)} liegt unter dem Typboden`).toBeGreaterThanOrEqual(11);
    }
  });

  it("fällt, sobald eine neue Rohgröße neben die Leiter gesetzt wird", () => {
    // Gegenlauf in einer Kopie: dieselbe Masche, ein `text-[14px]` mehr. 14 px
    // ist weder Stufe noch benannte Anzeige — die Masche muss es melden.
    const STUFE = "text-[length:var(--fs-small)] tracking-wider text-[color:var(--meta)]";
    // The line the copy puts the raw value on is where the ladder token sits in
    // the real file — read, not remembered. A pinned number here went stale the
    // moment an unrelated row was added above it, and a control that fails
    // because the source grew is a control that teaches people to edit numbers.
    const stufeZeile = HEAT.slice(0, HEAT.indexOf(STUFE)).split("\n").length;
    expect(stufeZeile, "die Leiter-Stufe steht nicht mehr in HeatmapToggle").toBeGreaterThan(1);
    const text = HEAT.replace(STUFE, "text-[14px] tracking-wider text-[color:var(--meta)]");
    expect(text, "die Kopie erreicht HeatmapToggle nicht").not.toBe(HEAT);
    const funds = rohwerte(text, "HeatmapToggle.tsx");
    expect(
      funds.map((f) => f.roh),
      "der Kopie lief der Rohwert vorbei",
    ).toContain("text-[14px]");
    expect(
      funds.filter(istisch).map(melde),
      "ein text-[14px] wäre als Leiter-Stufe durchgegessen",
    ).toEqual([`HeatmapToggle.tsx:${stufeZeile} text-[14px] (= 14 px)`]);
    // Dieselbe Masche auf der echten Quelle: grün, aber nicht, weil sie nichts sähe.
    expect(
      NAMEN.flatMap((d) => rohwerte(PLATTEN[d], d)).filter(istisch),
      "die echte Quelle trägt wieder einen unbenannten Rohwert",
    ).toEqual([]);
  });

  const TOOLTIP_PLATTE = /role="tooltip"[\s\S]*?style=\{\{([\s\S]*?)\}\}/;

  it("liest die Tooltip-Platte ihre Stufe von der Leiter, nicht in rem", () => {
    const stufe = inlineDeklaration(TOOLTIP, TOOLTIP_PLATTE, "fontSize", "Tooltip-Platte");
    expect(stufe, `die Platte malt ihre Größe selbst: ${stufe}`).toBe("var(--fs-small)");
    const px = Number(
      (resolveVars(stufe, tokensOf(css)).match(/([\d.]+)px/) as RegExpMatchArray)[1],
    );
    // Der vorherige Wert war `0.75rem` — derselbe Satz Pixel, weil niemand die
    // Wurzel überschreibt. Geprüft, nicht vorausgesetzt.
    expect(
      allCss.match(/(?:^|\n)\s*html\s*\{[^}]*font-size:/),
      "ein Blatt überschreibt die Wurzel; 0,75 rem wäre nicht mehr 12 px gewesen",
    ).toBeNull();
    expect(px, "--fs-small ist nicht die 12 px, die die Platte vorher malte").toBe(12);
    expect(px, `${px} px unter dem Typboden`).toBeGreaterThanOrEqual(11);
    // Die Chip-Zeilen derselben Platte standen schon vor dieser Runde auf
    // `--fs-meta`; ihre Zahl bleibt, damit niemand sie „vereinfacht“.
    expect(
      withoutComments(TOOLTIP).match(/text-\[length:var\(--fs-meta\)\]/g)?.length,
      "die Meta-Stufen der Tooltip-Platte haben sich bewegt",
    ).toBe(4);
  });

  it("setzt das Schwerewort des Badge auf die Wort-Tinte — die Fläche behält das Signal", () => {
    const quelltext = withoutComments(TOOLTIP);
    expect(
      quelltext.match(/badgeInk = severityTextColor\(worst, colorblind\);/),
      "das Schwerewort des Badge malt wieder die Flächenfarbe",
    ).not.toBeNull();
    expect(
      quelltext.match(/badgeColor = severityColor\(worst, colorblind\);/),
      "die Badge-Fläche hat ihr Signal verloren",
    ).not.toBeNull();
    expect(
      quelltext.match(/color:\s*badgeInk \|\| badgeColor/),
      "die Badge-Deklaration zieht den Wort-Ton nicht ein",
    ).not.toBeNull();
    const felder = hintergrundFelder(
      resolveVars(
        inlineDeklaration(TOOLTIP, TOOLTIP_PLATTE, "background", "Tooltip-Platte"),
        tokensOf(css),
      ),
    ).felder;
    expect(felder, "die Tooltip-Platte malt kein auflösbares Feld").toHaveLength(GRÜNDE.length);

    /** Der Badge-Wasch: `${badgeColor}15` über dem Feld der Platte. */
    const wasch = (signal: string, feld: string): string =>
      toHex(composite({ rgb: parseColor(signal).rgb, alpha: 0x15 / 255 }, feld));

    const wortSchwach: number[] = [];
    const flachenFaelle: string[] = [];
    for (const sev of ["P0", "P1", "P2"] as const) {
      for (const cvd of [false, true]) {
        const signal = severityColor(sev, cvd);
        const wort = severityTextColor(sev, cvd);
        const bad = felder.map((f) => wasch(signal, f));
        for (const [i, feld] of bad.entries()) {
          const c = contrast(wort, feld);
          wortSchwach.push(c);
          expect(
            c,
            `Schwerewort ${sev}${cvd ? "/cvd" : ""} über ${GRÜNDE[i]!.sagt} (${feld}): ${c.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(STUFE);
        }
        // Gegenlauf: dieselbe Masche mit der reinen Flächenfarbe als Wort-Tinte.
        const schwach = Math.min(...bad.map((f) => contrast(signal, f)));
        if (schwach < STUFE) flachenFaelle.push(`${sev}${cvd ? "/cvd" : ""}:${schwach.toFixed(2)}`);
      }
    }
    // Nicht leerlaufend, und die Zahl, die diese Runde behauptet: die Flächen-
    // farbe als Wort fiel in drei der sechs Paarungen unter die Stufe — am
    // tiefsten am blinden P1 („1 hoher Fund“) mit 3,06:1; das Wort trägt jetzt
    // 8,75:1. P2/norm ist beide Male derselbe Ton (Mischung 0) — dort ist nichts
    // gewonnen, nur die Regel erfüllt.
    expect(
      flachenFaelle,
      "die Flächenfarbe als Wort-Tinte müsste in genau drei Paarungen fallen",
    ).toEqual(["P0:4.34", "P0/cvd:4.04", "P1/cvd:3.06"]);
    expect(
      Math.min(...wortSchwach),
      "die schwächste Wort-Tinte des Badge ist nicht mehr gerechnet worden",
    ).toBeGreaterThanOrEqual(STUFE);
  });

  it("hält die Füllung des Baubalkens auf der Marke — und nennt die Fläche, die nicht tauschen durfte", () => {
    const fuellung = /width: `\$\{pct\}%`, background: "([^"]+)"/.exec(withoutComments(HUD))?.[1];
    expect(fuellung, "der Baubalken malt seine Füllung selbst").toBeDefined();
    expect(fuellung, `die Füllung liegt als Literal im Component: ${fuellung}`).toBe(
      "var(--brand-red)",
    );
    expect(HUD, "ein zweites #e8503c-Literal sitzt in HudOverlay").not.toMatch(/"#e8503c"/);
    // Warum das ein Tausch ohne Wertdifferenz ist, gelesen statt geglaubt: der
    // Token hat denselben Wert wie das vorherige Literal, und die Shell, in der
    // der Balken steht, stellt ihn nicht um.
    expect(rootToken("brand-red"), "die Marke ist nicht mehr #e8503c").toBe("#e8503c");
    expect(
      inkInScope(css, "--brand-red", ".app-shell"),
      ".app-shell stellt --brand-red um — der Tausch wäre kein identischer Ton",
    ).toBe(rootToken("brand-red"));
    // Und der Grund, warum dieselbe Inventur zwei Zeilen weiter ihr Literal
    // behielt: `--glass-bg`/`--glass-border` SIND in der Shell andere Werte; ein
    // Tausch wäre eine Materialentscheidung, keine Hygiene. Diese Wache nagelt
    // die Asymmetrie fest, damit niemand sie als Vergesslichkeit korrigiert.
    expect(
      inkInScope(css, "--glass-bg", ".app-shell"),
      "--glass-bg wäre in der Shell ein anderer Ton — hier darf nicht stillschweigend getauscht werden",
    ).not.toBe(rootToken("glass-bg"));
    const rand = /background: "rgba\(20, 20, 18, 0\.82\)",\s*\n\s*border: "([^"]+)"/.exec(
      withoutComments(HUD),
    );
    expect(
      rand,
      "der Banner-Hintergrund hat sein Literal verloren — die Liste ist neu zu lesen",
    ).not.toBeNull();
    expect(
      (rand as RegExpMatchArray)[1],
      "die Banner-Fläche ist auf ein Token gewandert, ohne dass die Shell denselben Ton malt",
    ).toBe("1px solid rgba(242, 239, 232, 0.14)");
    // Zwei Tinten ohne Token-Pendant: #dedbd3 (Wort) und #3c3c35 (Balken-Rinne).
    // Kein Blatt definiert diese Werte, und diese Runde erfindet keine neue
    // Variable. Beide bleiben Literal, und die Zeile unten fällt, sobald jemand
    // sie umbaut, ohne sie benannt zu haben.
    // #31 hat die Wort-Tinte auf drei Zeilen gehoben: der Baubalken sagt jetzt
    // auch, wie lange er baut, und die Uhr sitzt auf derselben Platte im
    // selben Ton — kein neuer Wert, deshalb wächst nur die Zahl der Treffer.
    expect(
      [...HUD.matchAll(/style=\{\{ color: "(#[0-9a-f]{6})" \}\}/g)].map((m) => m[1]),
      "die drei unbenannten Banner-Tinten haben sich verändert",
    ).toEqual(["#dedbd3", "#dedbd3", "#dedbd3"]);
    expect(
      allCss.includes("#dedbd3:") || allCss.includes("--dedbd3"),
      "doch ein Ton für #dedbd3 erfunden — diese Runde meldet sie, sie definiert sie nicht",
    ).toBe(false);
  });
});

/* ── Fall 17 — die Queue-Ziffern des Docks (2026-10-26) ──────────────────────
 * Zwei Ternaries malten den "offen"-Zähler der Triage-Warteschlange: Gold,
 * wenn `queue.open > 0`, und das grüne Literal `#29d398`, wenn alles beurteilt
 * war. Beides war ein Regelbruch, keiner war Geschmack: Gold ist die Fokus-
 * farbe des Rings (`--focus-ring`), und das grüne Literal misst — mit diesem
 * Blatt kompositet, nicht nachgebaut — 4,37:1 über dem nackten Dock-Feld und
 * 4,03:1 unter der roten Waschung des Steppers, beides unter der AA-Stufe
 * 4,5 für 12-px-Text. Das Zustand beider Stellen trägt schon sein Wort
 * ("open"/"offen", dict.ts `actions.triageOpenWord*`) und seine Zahl; die
 * Farbe war ein zweiter Träger, der an der einen Stelle eine belegte Farbe
 * lügt und an der anderen unter der Leiter fällt. Gewählt: die Dock-eigene
 * Tinte `#dedbd3`, gemessen 6,11:1 / 5,64:1 auf denselben Feldern.
 *
 * Feldmodell (dasselbe wie `chromeState` für jede Chrome-Fläche): die
 * regierende `.action-dock-row`-Deklaration — Sheen über
 * `--glass-control-bg` über jedem der vier Stadtgründe — plus die inline
 * `rgba(232,80,60,0.14)`-Waschung von Stepper und Startknopf darüber.
 *
 * Drei Fälle: (1) kein `var(--accent-gold)` und kein `#29d398` mehr in
 * ActionBar.tsx, (2) die beiden Zähler-Spans existieren in der erwarteten
 * Form — ein weglaufendes Ternary ist hier rot, nicht still grün, (3) ihre
 * Tinte hält ≥ 4,5 auf jedem Dock-Feld, frei und unter der Waschung. */
describe("Dock-Queue: die Ziffern-Tinte hält AA, Gold und Sub-AA-Grün sind weg", () => {
  const dockState = chromeState(css).find((s) => s.surface.name === "action dock");
  expect(
    dockState && dockState.winner,
    "das Dock hat seine regierende Hintergrund-Regel verloren — das Feldmodell ist neu zu lesen",
  ).toBeTruthy();

  it("lässt Gold und das grüne Literal nie wieder auf die Queue-Ziffern", () => {
    expect(
      ACTION_BAR,
      "Gold ist die Fokusfarbe des Rings — die Queue-Ziffern dürfen den Zustand nicht in Gold malen",
    ).not.toContain("var(--accent-gold)");
    expect(
      ACTION_BAR,
      "#29d398 liegt auf den Dock-Feldern unter 4,5:1 — als Wort-Tinte verboten",
    ).not.toContain("#29d398");
  });

  it("liest beide Zähler-Spans in ihrer erwarteten Form", () => {
    const spans = [
      ...ACTION_BAR.matchAll(
        /queue && queue\.total > 0 && \(\s*<span\s+className="[^"]*"\s*style=\{\{ color: "(#[0-9a-f]{6})" \}\}/g,
      ),
    ];
    expect(
      spans,
      "die beiden Queue-Zähler-Spans sind nicht mehr als Span+Inline-Tinte zu lesen",
    ).toHaveLength(2);
  });

  it("hält die Ziffern-Tinte über jedem Dock-Feld und unter der roten Waschung", () => {
    const { fields } = dockState as Szene;
    const inks = [
      ...ACTION_BAR.matchAll(
        /queue && queue\.total > 0 && \(\s*<span\s+className="[^"]*"\s*style=\{\{ color: "(#[0-9a-f]{6})" \}\}/g,
      ),
    ].map((m) => m[1] as string);
    const washes = [
      ...ACTION_BAR.matchAll(/background:\s*"(rgba\(232,\s*80,\s*60,\s*[\d.]+\))"/g),
    ].map((m) => m[1] as string);
    expect(
      washes.length,
      "die rote Waschung des Steppers ist nicht mehr zu lesen",
    ).toBeGreaterThanOrEqual(1);
    const wash = parseColor(washes[0] as string);
    for (const [feldIndex, feld] of fields.entries()) {
      const ueberWaschung = toHex(composite(wash, feld));
      for (const ink of [...new Set(inks)]) {
        expect(
          contrast(ink, feld),
          `${ink} über Dock-Feld ${feldIndex} (${feld}) ohne Waschung`,
        ).toBeGreaterThanOrEqual(STUFE);
        expect(
          contrast(ink, ueberWaschung),
          `${ink} über Dock-Feld ${feldIndex} (${feld}) unter der Waschung (${ueberWaschung})`,
        ).toBeGreaterThanOrEqual(STUFE);
      }
    }
  });
});

/* ── Fall 18 — Stadt-Blatt: Gold trägt nur noch den Fokusring (2026-10-26) ───
 * Fall 17 guardierte ActionBar-Quelle; die CSS-Seite ließ die Lücke (Defect-
 * Handoff 08:23): `.workspace-search-toggle` malte Hover und den OPEN-Zustand
 * (`aria-expanded="true"`) in `var(--accent-gold)` bzw. der Goldfamilie
 * `rgba(232,178,60,…)`, und `.handoff-action` — ein ständiges Angebot (SARIF/
 * Link), kein Zustand — trug Rand, Boden und Tinte derselben Familie. Wer die
 * Regel „Gold heißt: dein Cursor ist hier" gelernt hat, las beide als Fokus.
 * Gewählt: die Oberflächen-eigenen Vocabeln — Hover erbt `.btn-ghost` (Vermilion
 * + `--brand-ink`), offen hebt neutral (`--glass-chrome-border`-Rand, Hebe-
 * Fläche wie `.panel-close:hover`, Tinte `--brand-ink`), das Angebot sitzt auf der
 * Platten-Vokabel von `.panel-close` (`rgba(242,239,232,0.1)` /
 * `rgba(255,255,255,0.05)` / `--meta-strong`). Zustände behalten ihre Träger:
 * `aria-expanded` + Feldtext + das sich öffnende Feld; Handoff-Chips tragen
 * Wörter (`panel.sarifExport`, `actions.copyLink`).
 *
 * Drei Behauptungen: (1) im ganzen Blatt regiert `--focus-ring`, kein
 * `var(--accent-gold)`, und die beiden kontrollierten Selektorenblöcke sind
 * goldfrei; (2) die Rest-Familie steht nur noch auf den drei namentlich
 * gemeldeten Deko-Stellen (`.ide-hint`, `.search-hit`, `.findings-moved-title`)
 * — eine vierte Stelle macht rot; (3) die Positivkontrolle: eine mit Gold
 * vergiftete Kopie von `.handoff-action` muss dem Wächter auffallen, sonst ist
 * er wertlos. Dazu die beiden neuen Tinten gemessen auf ihren vier Feldern. */
describe("Stadt-Blatt: Gold verlässt Zustand und Angebot, der Fokusring bleibt", () => {
  const STADT = quelle("../src/design/stadt-ui.css");
  const HUD_SRC = quelle("../src/components/HudOverlay.tsx");
  const INFO_SRC = quelle("../src/components/InfoPanel.tsx");

  /** Regelblöcke eines Blatts: [Selektor, Rumpf]-Paare, Kommentare getilgt.
   *  `@media`-Hüllen enthalten selbst Klammern und fallen aus dem Muster —
   *  ihre inneren Regeln erscheinen einzeln, genau wie es gebraucht wird. */
  const bloque = (text: string): Array<[string, string]> => {
    const re = /([^{}@]+)\{([^{}]*)\}/g;
    return [...withoutComments(text).matchAll(re)].map(
      ([, sel, body]) => [(sel ?? "").trim().replace(/\s+/g, " "), body ?? ""] as [string, string],
    );
  };
  const FAMILIE = /232,\s*178,\s*60|#d8c9a3|var\(--accent-gold\)/;
  const GOLD_SELEKTOREN = (text: string): string[] =>
    bloque(text)
      .filter(([, body]) => FAMILIE.test(body))
      .map(([sel]) => sel);

  it("kennt im ganzen Blatt kein var(--accent-gold) mehr — Fokus lebt auf --focus-ring", () => {
    expect(
      STADT,
      "Gold ist die Fokusfarbe des Rings; im Stadt-Blatt darf ihr nur --focus-ring entnehmen",
    ).not.toContain("var(--accent-gold)");
    expect(STADT, "der Fokusring des Blatts ist verschwunden").toContain(
      "outline: 2px solid var(--focus-ring)",
    );
  });

  it("hält Such-Schalter und Handoff-Angebot goldfrei", () => {
    const kontrolliert = bloque(STADT).filter(([sel]) =>
      /workspace-search-toggle|handoff-action/.test(sel),
    );
    expect(
      kontrolliert.length,
      "die kontrollierten Selektoren sind aus dem Blatt gelaufen",
    ).toBeGreaterThanOrEqual(3);
    for (const [sel, body] of kontrolliert) {
      expect(body, `${sel} malt wieder die Goldfamilie`).not.toMatch(FAMILIE);
    }
  });

  it("duldet die Rest-Familie nur auf den drei gemeldeten Deko-Stellen", () => {
    const ERLAUBT = [".ide-hint", ".search-hit", ".findings-moved-title"];
    for (const sel of GOLD_SELEKTOREN(STADT)) {
      expect(
        ERLAUBT,
        `neue Goldfamilie-Stelle im Stadt-Blatt: ${sel} — sie gehört gemeldet, nicht still geduldet`,
      ).toContain(sel);
    }
  });

  it("trägt offene Tür und Angebot an ihren echten Zustands- und Wort-Trägern", () => {
    const offen = bloque(STADT).find(([sel]) =>
      sel.includes('.workspace-search-toggle[aria-expanded="true"]'),
    );
    expect(offen, "der Open-Zustand des Such-Schalters hat seine Regel verloren").toBeTruthy();
    expect((offen as [string, string])[1]).toContain("var(--glass-chrome-border)");
    expect((offen as [string, string])[1]).toContain("var(--brand-ink)");
    expect(
      bloque(STADT).some(([sel]) => sel.includes(".workspace-search-toggle:hover")),
      "die Gold-Hover-Obersteuerung ist zurück — Hover gehört .btn-ghost",
    ).toBe(false);
    expect(
      HUD_SRC,
      "der Such-Schalter muss seinen Zustand weiter durch aria-expanded ansagen",
    ).toMatch(/className="btn-ghost workspace-search-toggle"\s+aria-expanded=\{searchOpen\}/);
    expect(INFO_SRC).toContain("panel.sarifExport");
    expect(INFO_SRC).toContain("actions.copyLink");
  });

  it("misst die neuen Tinten über jedem Feld ihrer Fläche", () => {
    const szene = chromeState(css);
    const header = szene.find((s) => s.surface.name === "workspace header");
    const karte = szene.find((s) => s.surface.name === "file panel");
    expect(
      header && header.winner,
      "die Kopfzeilen-Fläche ist aus dem Feldmodell gelaufen",
    ).toBeTruthy();
    expect(karte && karte.winner, "die Karten-Platte ist aus dem Feldmodell gelaufen").toBeTruthy();
    const brandInk = rootToken("brand-ink");
    const metaStrong = rootToken("meta-strong");
    for (const feld of (header as Szene).fields) {
      expect(
        contrast(brandInk, feld),
        `${brandInk} über Kopfzeilen-Feld ${feld}`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
    for (const feld of (karte as Szene).fields) {
      expect(
        contrast(metaStrong, feld),
        `${metaStrong} über Karten-Feld ${feld}`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
  });

  it("fällt rot, sobald .handoff-action wieder in Gold gemalt wird (Positivkontrolle)", () => {
    const kopie = STADT.replace(
      ".handoff-action {\n  display: inline-flex;",
      ".handoff-action {\n  border: 1px solid var(--accent-gold);\n  display: inline-flex;",
    );
    expect(
      kopie,
      "die Kopie hat ihre Zielregel nicht gefunden — die Kontrolle ist wertlos",
    ).not.toBe(STADT);
    expect(GOLD_SELEKTOREN(kopie), "die Wache ließ eine vergoldete handoff-action durch").toContain(
      ".handoff-action",
    );
    expect(
      GOLD_SELEKTOREN(STADT),
      "die echte Quelle ist schon betroffen — Kontrolle zeigt nichts",
    ).not.toContain(".handoff-action");
  });
});

/* ── Fall 19 — die Restliste der Gold-Inventur (2026-10-26) ────────────────
 * Fälle 17/18 räumeren Dock, Suchschalter und Handoff-Chip; die Inventur
 * meldete zwölf weitere Stellen, an denen Gold einen Zustand malt oder ein
 * ständiges Angebot in der Fokusfarbe anzieht. Nachgemessen, Stelle für
 * Stelle, gegen die Blätter und Quellen selbst:
 *
 * geraäumt (Zustand, sein Wort/Form-Traeger bleibt):  start.css —
 *   Fortschrittpunkte done/current (Tinte jetzt dieselbe Leiter wie ihr Wort:
 *   done `--meta-strong`, current `--brand-ink`, aria-current + Schritttext
 *   unverändert), Guide-Chip inkl. Hover (auf die streifeneigene Chrome-Fibel
 *   des nebenstehenden Pins gesetzt; Wort `summary.guideGo`, Pfeilform und
 *   die `--focus-ring`-Regel bleiben), Pin `is-on` (◉/○-Form + `aria-pressed`
 *   + Wort tragen den Zustand), globals.css — Live-Band-Punkt, is-paused-Ring,
 *   Zähler und Bandknöpfe (die Band ist `role="status"`: jedes Wort bleibt),
 *   footprint-stale (Zahl + Wort im status-Absatz), share.css — blocked-Waschung
 *   (war zusätzlich ein erfundenes Hex #f0d79b) und live-Statuszeile (Wörter,
 *   role=status). Stadt-Blatt: `.surface-failed-retry` trug `--focus-ring` als
 *   Dauerrand — jetzt Platten-Fibel; den Ring leiht die globale `:focus-visible`-
 *   Regel. HudOverlay: Skip-Hover auf `--brand-ink`, die beiden JSX-Ringe aufs
 *   Ring-Token umbenannt (Gold war dort korrekt, der Tokenname nicht).
 *   AnalyzePanel: Popover-Rahmen idle → `--glass-chrome-border`, Picker-Punkt →
 *   `--brand-ink` (Wort `picker.waiting` trägt). SearchBar: der Offen-Rand IST
 *   der Fokus-Rand (open ⇄ focused, outline:none) — er bezieht nun
 *   `var(--focus-ring)` statt eines harten Gold-Hex, damit die helle Stufe des
 *   Chrome-Ink-Leiters ihn trifft.
 *
 * belassen und gemeldet (Signal, kein Fokus): FindingsPanel `"to-fix"` —
 *   Wertungssignal mit Wort (`reviewLabelToFix`), läuft aber NICHT über
 *   `severityColor(…, colorblind)`: echter Befund, Betreiberfrage, keine
 *   stille Änderung. Ebenso gemeldet: die Amber-Familie (start-state-limits ist
 *   im Blatt dokumentiert; update-banner, rescue-button, share…, boot is-slow)
 *   und die Analyse-Kicker — nicht in der Liste, hier namentlich geduldet,
 *   eine weitere ungemeldete Stelle macht rot.
 * Task-9-Räumung (2026-10-26, dieselbe Familie): die vier Ziffern-Tinten
 *   (start-elapsed/budget-wait/stage-hold/state-figure) stehen jetzt auf
 *   `--meta-strong` — dieselbe Leiter wie ihr Wort (7,0 gemessen auf dem
 *   Kartenfeld über dem hellsten Grund); der Escape-Knopf des Analyse-Pickers
 *   rahmt sich in `--glass-chrome-border` mit `--meta-strong`-Tinte (7,09 auf
 *   dem Popover-Feld); die gedrückten Ephe-Chips tragen den Blatteigenen
 *   Current-Schritt-Aufrieb (`--brand-ink`-Rand + Ink-Glanz, 15 auf der
 *   Vitrine) statt `--focus-ring` als Dauerschmuck. `aria-pressed`, Wort und
 *   Form bleiben; keine dieser Stellen malt je wieder Fokusfarbe. */
describe("Gold-Sweep: die Restliste trägt ihre Zustände in words und Leiter-Tinten; Signale bleiben gemeldet", () => {
  const START = quelle("../src/design/start.css");
  const GLOBALS = quelle("../src/design/globals.css");
  const SHARE = quelle("../src/design/share.css");
  const STADT = quelle("../src/design/stadt-ui.css");
  const SEARCH_SRC = quelle("../src/components/SearchBar.tsx");
  const HUD_SRC = quelle("../src/components/HudOverlay.tsx");
  const FIND_SRC = quelle("../src/components/FindingsPanel.tsx");
  const ANALYZE_SRC = quelle("../src/components/AnalyzePanel.tsx");
  const LOOK_SRC = quelle("../src/components/EpheLookControls.tsx");
  const ARRIVAL_SRC = quelle("../src/components/ArrivalProgress.tsx");
  const SCAN_SRC = quelle("../src/components/ScanSummary.tsx");
  const BAND_SRC = quelle("../src/components/LiveBand.tsx");
  const LANDING_SRC = quelle("../src/components/Landing.tsx");
  const STUDIO_SRC = quelle("../src/components/ShareStudio.tsx");

  const bloque = (text: string): Array<[string, string]> => {
    const re = /([^{}@]+)\{([^{}]*)\}/g;
    return [...withoutComments(text).matchAll(re)].map(
      ([, sel, body]) => [(sel ?? "").trim().replace(/\s+/g, " "), body ?? ""] as [string, string],
    );
  };
  const FAMILIE =
    /232,\s*178,\s*60|255,\s*217,\s*138|var\(--accent-gold\)|#e8b23c|#f0d79b|#d8c9a3|#ffd98a/;
  const goldZeilen = (src: string): string[] =>
    withoutComments(src)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => FAMILIE.test(l));
  const goldSelektoren = (text: string): string[] =>
    bloque(text)
      .filter(([, body]) => FAMILIE.test(body))
      .map(([sel]) => sel);

  /** Geduldete Rest-Gold-Stellen: Selektor-Muster mit Grund. */
  const ERLAUBT_CSS: Record<string, Array<[RegExp, string]>> = {
    "start.css": [
      [
        /\.ephe-preview-panel$/,
        "Ephe-Vorschau-Rahmen: bewusste Marke, nicht in der Inventur-Liste",
      ],
      [/\.ephe-name-tag$/, "Bewohner-Namensschild: bewusste Marke"],
      [/\.landing-resume$/, "Wiederaufnahme-Platte: Randlinie derselben Familie"],
      [
        /\.landing-resume-open$/,
        "Wiederaufnahme-Link: gemeldeter Mitbewohner (nicht in der Liste)",
      ],
      [/\.start-plate$/, "Platten-Frost α 0,05 (Deko)"],
      [/is-indeterminate::after$/, "Unentschieden-Schimmer (Animations-Deko)"],
      [
        /start-state--/,
        "dokumentiertes Amber: a limit is amber (Schwere-Familie, Glyphen und Wörter tragen)",
      ],
      [
        /\.start-summary-guide-who$/,
        "Guide-Stimme-Label: die Marke der Guide; der Chip selbst wurde geraeumt",
      ],
      [/start-summary-drops li::before$/, "Listen-Marker ▪/◦ (Form traegt, Deko)"],
      [/\.start-coach-glyph$/, "Coach-Glyphe (Deko)"],
      [
        /start-boot\.is-slow/,
        "Amber „langsamer Start“ — Signal, gemeldet (CVD-Frage an den Betreiber)",
      ],
    ],
    "globals.css": [
      [/:root$/, "die Token-Definitionen wohnen hier (--accent-gold, --focus-ring)"],
      [/\.blue-glow$/, "CRT-Effekt-Familie der alten Neon-Klassen (Deko, kein Zustand)"],
      [/\.crt-border-blue$/, "CRT-Effekt-Familie (Deko)"],
      [/summary:focus-visible$/, "Fokusregel — hier trägt Gold zu Recht den Ring"],
      [
        /\.city-coach$/,
        "Chrome-Ink-Leiter: die helle Stufe dient dem Ring auf hellen Balken (Token-Wert, kein Zustand)",
      ],
      [/\.landing-update-banner$/, "Amber-Update-Hinweis: Signal mit eigenem Wort — gemeldet"],
      [
        /\.rescue-button/,
        "gekoppelte :hover- und :focus-visible-Regel: Fokuscharakter dominiert; Teilung nicht in der Liste — gemeldet",
      ],
      [/\.resident-card$/, "Bewohner-Begrüßung: Gold-Rahmen der Begegnung (bewusste Marke)"],
      [/\.resident-kicker$/, "Begrüßungs-Kicker (Marke)"],
    ],
    "share.css": [],
    "stadt-ui.css": [],
  };

  const ERLAUBT_TSX: Record<string, Array<[RegExp, string]>> = {
    "SearchBar.tsx": [
      [
        /rgba\(232,178,60,0\.1\)/,
        "Fokus-Glanz, Haarlinien und Tastatur-Kursor des offenen Felds — open ⇄ focused (onBlur schließt); Glanz = Hausmuster der Fokusregel",
      ],
      [
        /rgba\(232,178,60,0\.22\)/,
        "Rahmen des offenen Felds — sichtbar nur, während das Feld fokussiert ist",
      ],
      [
        /rgba\(232,178,60,0\.07\)/,
        "Haarlinie des Tastatur-Kursors (isActive ⇄ aria-activedescendant) = Fokus",
      ],
    ],
    "HudOverlay.tsx": [],
    "FindingsPanel.tsx": [
      [
        /"to-fix": "var\(--accent-gold\)"/,
        "Bewertungs-Signal, nicht Fokus: Wort trägt (reviewLabelToFix); läuft NICHT über severityColor(…, colorblind) — echter Befund, Betreiberfrage, diese Runde nicht still geändert",
      ],
    ],
    "AnalyzePanel.tsx": [
      [
        /\[color:var\(--accent-gold\)\] tracking-widest/,
        "Kicker-Labels des Popovers (Deko/Marke, nicht in der Liste)",
      ],
    ],
  };

  /** Geraeumte Selektoren: müssen existieren und goldfrei sein. */
  const GERAeUMT: Array<[string, string, RegExp]> = [
    ["start.css", "done-Punkt", /data-state="done"\] \.start-progress-dot$/],
    ["start.css", "current-Punkt", /data-state="current"\] \.start-progress-dot$/],
    ["start.css", "Guide-Chip", /^\.start-summary-guide-go, \.start-summary-strip-guide$/],
    [
      "start.css",
      "Guide-Chip-Hover",
      /^\.start-summary-guide-go:hover, \.start-summary-strip-guide:hover$/,
    ],
    ["start.css", "Pin is-on", /^\.start-summary-pin\.is-on$/],
    ["globals.css", "footprint-stale", /^\.landing-footprint-stale$/],
    ["globals.css", "live-Punkt", /^\.live-dot$/],
    ["globals.css", "live-Punkt paused", /^\.live-band\.is-paused \.live-dot$/],
    ["globals.css", "live-Zaehler", /^\.live-counts$/],
    ["globals.css", "live-Knopf", /^\.live-scan$/],
    ["globals.css", "live-Knopf-Hover", /^\.live-scan:hover$/],
    ["share.css", "blocked-Waschung", /^\.share-blocked$/],
    ["share.css", "live-Zeile", /^\.share-live$/],
    ["start.css", "elapsed-Ziffer", /^\.start-elapsed$/],
    ["start.css", "budget-Warte-Ziffer", /^\.start-budget-wait$/],
    ["start.css", "Stufen-Halte-Ziffer", /^\.start-stage-hold$/],
    ["start.css", "Zustands-Ziffer", /^\.start-state-figure$/],
    ["start.css", "Varianten-Chip gedrückt", /^\.ephe-variant\[aria-pressed="true"\]$/],
    ["start.css", "Marken-Chip gedrückt", /^\.ephe-mark\[aria-pressed="true"\]$/],
    // #29: die Ankunfts-Karten und ihr Vorwärtsknopf tragen Tinte wie die
    // übrigen Felder — Gold gehört ausschließlich dem Fokusring.
    ["start.css", "Welcome-Platte", /\.landing-welcome$/],
    ["start.css", "Welcome-Knopf", /\.landing-welcome-begin$/],
    ["start.css", "Guide-Platte", /\.landing-guide$/],
    ["start.css", "Guide-Marker", /\.landing-guide-steps li::marker$/],
  ];
  const blätter: Record<string, string> = {
    "start.css": START,
    "globals.css": GLOBALS,
    "share.css": SHARE,
  };

  it("hält jede geraeumte Stelle goldfrei — und in ihrer Regel", () => {
    for (const [blatt, , selRe] of GERAeUMT) {
      const treffer = bloque(blätter[blatt] as string).filter(([sel]) => selRe.test(sel));
      expect(treffer.length, `${blatt}: ${selRe} hat seine Regel verloren`).toBeGreaterThanOrEqual(
        1,
      );
      for (const [sel, body] of treffer) {
        expect(body, `${sel} malt wieder die Goldfamilie`).not.toMatch(FAMILIE);
      }
    }
  });

  it("duldet jede Rest-Gold-Stelle im Blatt nur mit Grund", () => {
    for (const [blatt, text] of Object.entries(blätter)) {
      const gründe = ERLAUBT_CSS[blatt] ?? [];
      for (const sel of goldSelektoren(text)) {
        expect(
          gründe,
          `${blatt}: neue Goldstelle ${sel} — sie gehört gemeldet, nicht still geduldet`,
        ).toContain(gründe.find(([re]) => re.test(sel)));
      }
    }
  });

  it("duldet jede Rest-Gold-Zeile in den Quellen nur mit Grund; das Blatt share.css und HudOverlay sind goldfrei", () => {
    for (const [name, src] of [
      ["SearchBar.tsx", SEARCH_SRC],
      ["HudOverlay.tsx", HUD_SRC],
      ["FindingsPanel.tsx", FIND_SRC],
      ["AnalyzePanel.tsx", ANALYZE_SRC],
    ] as const) {
      for (const zeile of goldZeilen(src)) {
        expect(
          (ERLAUBT_TSX[name] ?? []).some(([re]) => re.test(zeile)),
          `${name}: Goldzeile ohne Grund — ${zeile.slice(0, 80)}`,
        ).toBe(true);
      }
    }
    expect(goldZeilen(HUD_SRC), "HudOverlay trägt wieder ein Gold-Literal").toHaveLength(0);
  });

  it("lässt den Fokusring-Token nur noch in Fokusregeln des Stadt- und Start-Blatts", () => {
    for (const [blatt, text] of [
      ["stadt-ui.css", STADT],
      ["start.css", START],
    ] as const) {
      for (const [sel, body] of bloque(text)) {
        if (body.includes("var(--focus-ring)")) {
          expect(sel, `Dauerschmuck mit Ring-Token in ${blatt}: ${sel}`).toMatch(/focus/);
        }
      }
    }
    // der gedrückte Ephe-Chip: Zustand hat Rand + Glanz aus der Leiter, nie den Ring
    for (const chip of ['.ephe-variant[aria-pressed="true"]', '.ephe-mark[aria-pressed="true"]']) {
      const gedrückt = bloque(START).find(([sel]) => sel === chip);
      expect(gedrückt, `${chip} ist aus dem Blatt gelaufen`).toBeTruthy();
      expect((gedrückt as [string, string])[1]).toContain("var(--brand-ink)");
      expect((gedrückt as [string, string])[1]).toContain("box-shadow");
    }
    const retry = bloque(STADT).find(([sel]) => sel === ".surface-failed-retry");
    expect(retry, "die Retry-Regel ist aus dem Blatt gelaufen").toBeTruthy();
    expect((retry as [string, string])[1]).toContain("var(--meta-strong)");
    expect(
      SEARCH_SRC,
      "der offene Such-Rand muss aus dem Ring-Token sprechen (helle Stufe inbegriffen)",
    ).toMatch(/open \? "var\(--focus-ring\)"/);
    expect(HUD_SRC).toMatch(/focus:ring-\[var\(--focus-ring\)\]/);
  });

  it("trägt jeden geräumten Zustand an seinem Wort, seiner Form oder seinem aria-Anker", () => {
    expect(ARRIVAL_SRC).toContain('aria-current={s.current ? "step" : undefined}');
    expect(ARRIVAL_SRC).toContain("landing.arrivalDone");
    expect(SCAN_SRC).toContain("summary.guideGo");
    expect(SCAN_SRC).toContain("aria-pressed={pinned}");
    expect(SCAN_SRC).toContain('"◉"');
    expect(BAND_SRC).toContain('"live.paused"');
    expect(BAND_SRC).toContain('"live.fullScan"');
    expect(LANDING_SRC).toContain("landing.footprintStale");
    expect(STUDIO_SRC).toMatch(/className="share-blocked" role="status"/);
    expect(ANALYZE_SRC).toContain("picker.waiting");
    // Task-9: der Fluchtweg des Pickers behält sein Wort und seinen Anker
    expect(ANALYZE_SRC).toContain("picker.alternative");
    expect(ANALYZE_SRC).toContain('aria-describedby="analyze-picker-status"');
    // Task-9: die gedrückten Ephe-Chips behalten aria-pressed und ihr Wort
    expect(LOOK_SRC).toContain("aria-pressed={index === look.jacket}");
    expect(LOOK_SRC).toContain("aria-pressed={kind === look.mark}");
    expect(LOOK_SRC).toContain("aria-label={t(lang, label)}");
    expect(LOOK_SRC).toContain("aria-label={t(lang, MARK_LABELS[kind])}");
  });

  it("malt die Punkte in derselben Leiter wie ihr Wort", () => {
    const wert = (text: string, selRe: RegExp, prop: RegExp): string => {
      const block = bloque(text).find(([sel]) => selRe.test(sel));
      expect(block, `Regel ${selRe} fehlt`).toBeTruthy();
      const m = (block as [string, string])[1].match(prop);
      expect(m, `${selRe}: Pflicht ${prop.source} fehlt`).toBeTruthy();
      return (m as RegExpMatchArray)[1]!.trim();
    };
    expect(
      wert(START, /data-state="done"\]$/ as RegExp, /color:\s*([^;]+);/),
      "das done-Wort und sein Punkt müssen dieselbe Tinte tragen",
    ).toBe("var(--meta-strong)");
    expect(wert(START, /data-state="done"\] \.start-progress-dot$/, /background:\s*([^;]+);/)).toBe(
      "var(--meta-strong)",
    );
    expect(
      wert(START, /data-state="current"\] \.start-progress-dot$/, /border-color:\s*([^;]+);/),
    ).toBe("var(--brand-ink)");
    expect(wert(GLOBALS, /^\.live-dot$/, /background:\s*([^;]+);/)).toBe("var(--brand-ink)");
    // Task-9: die vier Ziffern-Tinten stehen auf derselben Stufe wie ihr Wort
    for (const ziffer of [
      /^\.start-elapsed$/,
      /^\.start-budget-wait$/,
      /^\.start-stage-hold$/,
      /^\.start-state-figure$/,
    ]) {
      expect(
        wert(START, ziffer, /color:\s*([^;]+);/),
        `${ziffer}: Ziffer außerhalb der Leiter-Tinte ihres Wortes`,
      ).toBe("var(--meta-strong)");
    }
  });

  it("misst die neuen Tinten über den Feldern, auf denen sie sitzen", () => {
    const szene = chromeState(css);
    const dock = szene.find((s) => s.surface.name === "action dock") as Szene;
    const leiste = szene.find((s) => s.surface.name === "scan announcement") as Szene;
    const streifen = szene.find((s) => s.surface.name === "scan summary strip") as Szene;
    expect(dock?.winner, "das Dock-Feld ist aus dem Modell gelaufen").toBeTruthy();
    expect(leiste?.winner, "die Ankündigungsplatte ist aus dem Modell gelaufen").toBeTruthy();
    expect(streifen?.winner, "der Streifen ist aus dem Modell gelaufen").toBeTruthy();
    // die Live-Band teilt sich Glasmuster und Leiter mit Dock und Kopfzeile:
    const leiter = bloque(GLOBALS).find(([sel]) => /\.city-coach$/.test(sel));
    expect(leiter, "die Chrome-Ink-Leiter ist aus dem Blatt gelaufen").toBeTruthy();
    const gehoben = (
      (leiter as [string, string])[1].match(/--meta-strong:\s*(#[0-9a-f]{6})/) as RegExpMatchArray
    )[1]!;
    const brandInk = rootToken("brand-ink");
    for (const feld of dock.fields) {
      expect(
        contrast(gehoben, feld),
        `${gehoben} über Dock-Feld ${feld} (live-Band)`,
      ).toBeGreaterThanOrEqual(STUFE);
      expect(
        contrast(brandInk, feld),
        `${brandInk} über Dock-Feld ${feld} (Punkt/Hover)`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
    for (const feld of [...leiste.fields, ...streifen.fields]) {
      // Chip- und Pin-Tinten auf Platte und Streifen:
      expect(
        contrast("#cfcabe", feld),
        `#cfcabe über Feld ${feld} (Guide-Chip)`,
      ).toBeGreaterThanOrEqual(STUFE);
      expect(
        contrast(brandInk, feld),
        `${brandInk} über Feld ${feld} (is-on)`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
    // Share-Platte ist Eigenfeld: α 0,97 über dem hellsten Grund, den die Stadt zeigen kann.
    const panelRegel = bloque(SHARE).find(([sel]) => sel === ".panel-share-studio");
    expect(panelRegel, "die Share-Platte hat ihre Feldregel verloren").toBeTruthy();
    const tint = parseColor(
      (
        (panelRegel as [string, string])[1].match(
          /background:\s*(rgba\([^)]+\))/,
        ) as RegExpMatchArray
      )[1]!,
    );
    const hellster = GRÜNDE.map((g) => g.farbe as string).sort(
      (a, b) => relLum(b) - relLum(a),
    )[0] as string;
    const feld = toHex(composite(tint, hellster));
    expect(
      contrast(rootToken("meta-strong"), feld),
      `meta-strong über Share-Feld ${feld}`,
    ).toBeGreaterThanOrEqual(STUFE);
    // Task-9: Ziffern auf Fortschritts- und Zustandskarte (Wortspalten-Scrim
    // ≥ 0,93, die kleinste Stufe über der die Karten stehen), Flucht-Tinte im
    // Analyse-Popover, gedrückter Rand auf der Vitrine — jeweils über dem
    // hellsten Grund, den die Stadt zeigen kann.
    expect(START, "die Wortspalte der Landung hat ihre Scrim-Stufe verloren").toContain(
      "rgba(23, 23, 21, 0.93)",
    );
    const wortscrim = toHex(composite(parseColor("rgba(23, 23, 21, 0.93)"), hellster));
    const cssFeld = (sel: string, ground: string): string => {
      const regel = bloque(START).find(([s]) => s === sel);
      expect(regel, `${sel}: hat seine Feldregel verloren`).toBeTruthy();
      const feldTint = (regel as [string, string])[1].match(/background:\s*(rgba\([^)]+\))/)?.[1];
      expect(feldTint, `${sel}: kein Feldton zu messen`).toBeTruthy();
      return toHex(composite(parseColor(feldTint as string), ground));
    };
    const meta = rootToken("meta-strong");
    for (const [karte, feldName] of [
      [".start-progress", "Fortschrittskarte"],
      [".start-state", "Zustandskarte"],
    ] as const) {
      const kartenFeld = cssFeld(karte, wortscrim);
      expect(
        contrast(meta, kartenFeld),
        `${meta} über ${feldName} ${kartenFeld} (Ziffern)`,
      ).toBeGreaterThanOrEqual(STUFE);
    }
    const vitrineFeld = cssFeld(".ephe-preview-panel", hellster);
    expect(
      contrast(rootToken("brand-ink"), vitrineFeld),
      `${rootToken("brand-ink")} über Vitrine ${vitrineFeld} (gedrückter Rand)`,
    ).toBeGreaterThanOrEqual(STUFE);
    const popTint = ANALYZE_SRC.match(/background:\s*"(rgba\([^)]+\))"/)?.[1];
    expect(popTint, "das Analyse-Popover hat seine Feldtinte verloren").toBeTruthy();
    const popFeld = toHex(composite(parseColor(popTint as string), hellster));
    expect(
      contrast(meta, popFeld),
      `${meta} über Analyse-Popover ${popFeld} (Flucht-Tinte)`,
    ).toBeGreaterThanOrEqual(STUFE);
  });

  // #29: die Vorwärtsentscheidung der Ankunft sitzt auf der Platte der Platte —
  // gemessen wird sie auf deren Feldton, über dem hellsten Grund, den die
  // Stadt zeigen kann, durch denselben Wortspalten-Scrim wie die Karten oben.
  it("misst die Tinte der Ankunfts-Karten auf ihrem Feld (#29)", () => {
    const hellster = GRÜNDE.map((g) => g.farbe as string).sort(
      (a, b) => relLum(b) - relLum(a),
    )[0] as string;
    const wortscrim = toHex(composite(parseColor("rgba(23, 23, 21, 0.93)"), hellster));
    const regel = bloque(START).find(([s]) => /\.landing-welcome$/.test(s));
    expect(regel, "die Welcome-Platte hat ihre Feldregel verloren").toBeTruthy();
    const tint = (regel as [string, string])[1].match(/background:\s*(rgba\([^)]+\))/)?.[1];
    expect(tint, "kein Welcome-Feldton zu messen").toBeTruthy();
    const feld = toHex(composite(parseColor(tint as string), wortscrim));
    const knopf = bloque(START).find(([s]) => /\.landing-welcome-begin$/.test(s));
    expect(knopf, "der Vorwärtsknopf hat seine Regel verloren").toBeTruthy();
    const tinte = (knopf as [string, string])[1].match(/color:\s*var\(--brand-ink\)/)
      ? rootToken("brand-ink")
      : "";
    expect(tinte, "der Knopf trägt nicht die Marken-Tinte der Leiter").toBe(rootToken("brand-ink"));
    expect(
      contrast(tinte, feld),
      `${tinte} über Welcome-Feld ${feld} (Knopf-Tinte)`,
    ).toBeGreaterThanOrEqual(STUFE);
    const rand = toHex(composite(parseColor("rgba(242, 239, 232, 0.4)"), feld));
    expect(
      contrast(rand, feld),
      `Knopf-Rand ${rand} über Welcome-Feld ${feld} (UI-Komponente, 3:1)`,
    ).toBeGreaterThanOrEqual(3);
    const wort = bloque(START).find(([s]) => /\.landing-welcome-body$/.test(s));
    expect(wort, "der Willkommenssatz hat seine Regel verloren").toBeTruthy();
    const wortTinte = (
      ((wort as [string, string])[1].match(/color:\s*(#[0-9a-f]{6})/) as RegExpMatchArray)[1] ?? ""
    ).toLowerCase();
    expect(
      contrast(wortTinte, feld),
      `${wortTinte} über Welcome-Feld ${feld} (Fließtext)`,
    ).toBeGreaterThanOrEqual(STUFE);
  });

  it("fällt rot, sobald eine geraeumte Stelle wieder vergoldet wird (Positivkontrolle)", () => {
    const kopie = START.replace(
      "background: var(--meta-strong);\n  border-color: var(--meta-strong);",
      "background: var(--accent-gold);\n  border-color: var(--accent-gold);",
    );
    expect(
      kopie,
      "die Kopie hat ihre Zielregel nicht gefunden — die Kontrolle ist wertlos",
    ).not.toBe(START);
    const sel =
      '.landing-shell.start-v2 .start-progress-steps li[data-state="done"] .start-progress-dot';
    expect(goldSelektoren(kopie), "die Wache ließ einen vergoldeten done-Punkt durch").toContain(
      sel,
    );
    expect(
      goldSelektoren(START),
      "die echte Quelle ist schon betroffen — Kontrolle zeigt nichts",
    ).not.toContain(sel);
    const searchKopie = SEARCH_SRC.replace('"var(--focus-ring)"', '"rgba(232,178,60,0.6)"');
    expect(searchKopie, "die Such-Kopie traf ihren Ring nicht").not.toBe(SEARCH_SRC);
    const nichtErlaubt = goldZeilen(searchKopie).filter(
      (z) => !(ERLAUBT_TSX["SearchBar.tsx"] ?? []).some(([re]) => re.test(z)),
    );
    expect(nichtErlaubt, "die Zeilen-Wache ließ einen goldenen Offen-Rand durch").not.toHaveLength(
      0,
    );
    // Task-9: dieselbe Kontrolle an jeder neu abgeräumten Stelle, an Kopien —
    // die echten Blätter und Quellen bleiben unberührt.
    const zifferKopie = START.replace(
      /(\.start-elapsed\s*\{[^}]*?color:\s*)var\(--meta-strong\)/,
      "$1var(--accent-gold)",
    );
    expect(zifferKopie, "die Ziffer-Kopie traf .start-elapsed nicht").not.toBe(START);
    expect(goldSelektoren(zifferKopie), "die Wache ließ eine vergoldete Ziffer durch").toContain(
      ".start-elapsed",
    );
    expect(goldSelektoren(START), "das echte Blatt ist schon betroffen").not.toContain(
      ".start-elapsed",
    );
    const fluchtKopie = ANALYZE_SRC.replace(
      "border border-[var(--glass-chrome-border)]",
      "border border-[var(--accent-gold)]",
    );
    expect(fluchtKopie, "die Flucht-Kopie traf den Escape-Knopf nicht").not.toBe(ANALYZE_SRC);
    const fluchtOhneGrund = goldZeilen(fluchtKopie).filter(
      (z) => !(ERLAUBT_TSX["AnalyzePanel.tsx"] ?? []).some(([re]) => re.test(z)),
    );
    expect(
      fluchtOhneGrund,
      "die Zeilen-Wache ließ den goldenen Escape-Rand durch",
    ).not.toHaveLength(0);
    const ringKopie = START.replace(
      '.ephe-variant[aria-pressed="true"] {\n  border-color: var(--brand-ink);',
      '.ephe-variant[aria-pressed="true"] {\n  border-color: var(--focus-ring);',
    );
    expect(ringKopie, "die Ring-Kopie traf den gedrückten Chip nicht").not.toBe(START);
    const dauerring = bloque(ringKopie).filter(
      ([sel, body]) => body.includes("var(--focus-ring)") && !/focus/.test(sel),
    );
    expect(
      dauerring,
      "die Ring-Wache ließ den Dauerring am gedrückten Chip durch",
    ).not.toHaveLength(0);
    // #29: vergoldet die Welcome-Platte wieder, sieht es die Platten-Wache.
    const welcomeKopie = START.replace(
      ".landing-shell.start-v2 .landing-welcome {\n  max-width: 620px;",
      ".landing-shell.start-v2 .landing-welcome {\n  border-left: 2px solid var(--accent-gold);\n  max-width: 620px;",
    );
    expect(welcomeKopie, "die Platten-Kopie traf die Welcome-Regel nicht").not.toBe(START);
    expect(
      goldSelektoren(welcomeKopie),
      "die Wache ließ eine vergoldete Welcome-Platte durch",
    ).toContain(".landing-shell.start-v2 .landing-welcome");
    expect(goldSelektoren(START), "das echte Blatt ist schon betroffen").not.toContain(
      ".landing-shell.start-v2 .landing-welcome",
    );
    // #29: und vergoldet der Vorwärtsknopf wieder, sieht es die Knopf-Wache.
    const knopfKopie = START.replace(
      "background: none;\n  border: 1px solid rgba(242, 239, 232, 0.4);\n  color: var(--brand-ink);",
      "background: var(--accent-gold);\n  border: 1px solid var(--accent-gold);\n  color: #201e18;",
    );
    expect(knopfKopie, "die Knopf-Kopie traf den Vorwärtsknopf nicht").not.toBe(START);
    expect(
      goldSelektoren(knopfKopie),
      "die Wache ließ einen vergoldeten Vorwärtsknopf durch",
    ).toContain(".landing-shell.start-v2 .landing-welcome-begin");
    expect(goldSelektoren(START), "das echte Blatt ist schon betroffen").not.toContain(
      ".landing-shell.start-v2 .landing-welcome-begin",
    );
  });
});
