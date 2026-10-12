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
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { ENV } from "../src/city/palette";
import { contrast } from "./colourMath";

const DESIGN = path.resolve(import.meta.dirname, "../src/design");
const css = ["globals.css", "stadt-ui.css", "start.css", "city-funktion.css"].map(
  (f) => [f, readFileSync(path.join(DESIGN, f), "utf-8")] as const,
);
const allCss = css.map(([, t]) => t).join("\n");

/** Every surface the chrome tint is allowed on. */
const CHROME = [
  ".workspace-header",
  ".panel-card",
  ".action-dock-row",
  ".start-coach",
  ".workspace-modes .glass",
  ".workspace-heatmap .glass",
];

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

/** The four bright grounds the city can show behind a frosted bar. The plaza is
 *  the brightest floor in the picture; the haze at the horizon is a close second. */
const GROUNDS = [ENV.plot, ENV.ground, ENV.fog, ENV.crosswalk];

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

function tokensFrom(files: readonly (readonly [string, string])[]): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, text] of files) {
    for (const m of withoutComments(text).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (!tokens.has(m[1] as string)) tokens.set(m[1] as string, (m[2] as string).trim());
    }
  }
  return tokens;
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

/** Every rule with the at-rules sitting around it. A brace walk, because the
 *  linear regex the case above uses cannot tell a media block from its host. */
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

function rulesFrom(files: readonly (readonly [string, string])[]): Rule[] {
  return LOAD_ORDER.flatMap((f, i) => {
    const text = files.find(([name]) => name === f)?.[1];
    if (text === undefined) throw new Error(`${f} is in the load order but not read`);
    return parseRules(text, f, i * 1e5);
  });
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
    const hits = rule.sel
      .split(",")
      .map((s) => s.trim())
      .filter((s) => hitsSurface(s, surface));
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
function inkInScope(
  files: readonly (readonly [string, string])[],
  name: string,
  scope: string,
): string {
  const rules = rulesFrom(files);
  const scoped = rules
    .filter((r) =>
      r.sel
        .split(",")
        .map((s) => s.trim())
        .includes(scope),
    )
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
  files: readonly (readonly [string, string])[],
  source: string,
  rule: RegExp,
  what: string,
  group = 1,
): string {
  const m = withoutComments(source).match(rule);
  expect(m, `${what}: keine regierende Farb-Deklaration zu lesen`).not.toBeNull();
  const raw = (m as RegExpMatchArray)[group]!.trim();
  const token = raw.match(/^var\((--[\w-]+)\)$/)?.[1];
  return token ? inkInScope(files, token, ".app-shell") : resolveVars(raw, tokensFrom(files));
}

const designFile = (files: readonly (readonly [string, string])[], name: string): string => {
  const text = files.find(([f]) => f === name)?.[1];
  expect(text, `${name} ist nicht geladen`).not.toBeUndefined();
  return text as string;
};

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

const COACH_HINT = /\.start-coach-strip-hint\s*\{[^}]*color:\s*([^;]+);/;
const DISABLED_LABEL = /color:\s*unavailable\s*\?\s*["'`]([^"'`]+)["'`]/;
const HEAT_CAPTION = /text-\[(#[0-9a-f]{6})\][^>]*>HEAT</;

/* The dock's own three inks, read off the component rather than typed in here.
 * None of them is a token: the step buttons and the triage start paint a
 * brighter cream than `--color-text`, the ordinary dock label paints a duller
 * one, and the overflow menu hands a third cream to its items inline. */
const STEP_LABEL = /style=\{\{\s*color:\s*"(#[0-9a-f]{6})"[^{}]*whiteSpace: "nowrap"/;
const ACTION_LABEL = /color:\s*active\s*\?\s*"(#[0-9a-f]{6})"\s*:\s*"(#[0-9a-f]{6})"/;
const MENU_LABEL = /className="action-secondary-menu[\s\S]{0,700}?color:\s*"(#[0-9a-f]{6})"/;
const MORE_LABEL = /color:\s*menuOpen \? "[^"]+" : "(#[0-9a-f]{6})"/;

/** Every component whose inline styles put text on a frosted bar. Read once,
 *  outside the sheet copies the mutation cases pass through `chromeState`: an
 *  inline style is not a design file, and no mutation of a sheet is expected to
 *  move it. */
const HEAT_TOGGLE = readFileSync(
  path.resolve(import.meta.dirname, "../src/components/HeatmapToggle.tsx"),
  "utf-8",
);
const ACTION_BAR = readFileSync(
  path.resolve(import.meta.dirname, "../src/components/ActionBar.tsx"),
  "utf-8",
);

/** Every ink that sits on a frosted bar. The four token inks are what the shell
 *  resolves for a label; the ones below are what these surfaces additionally
 *  paint from their own declarations — the coach's hint line, the disabled
 *  switch, the bar's caption, and the three literals the dock and its overflow
 *  menu carry inline. There is no exception here: a state a reader is asked to
 *  read (the struck-through CHURN channel, an empty step in the triage queue) is
 *  text like any other, and an ink list that names only the tokens measures
 *  labels the bars never paint.
 *  An inline `opacity` belongs to the ink, not to the surface — it is folded in
 *  where the contrast is taken, because that blend is what the eye gets. */
function chromeInks(files: readonly (readonly [string, string])[]) {
  const dockDim = stateDim(ACTION_BAR);
  return [
    { name: "--color-text", colour: inkInScope(files, "--color-text", ".app-shell"), opacity: 1 },
    {
      name: "--meta-strong (.app-shell)",
      colour: inkInScope(files, "--meta-strong", ".app-shell"),
      opacity: 1,
    },
    { name: "--meta (.app-shell)", colour: inkInScope(files, "--meta", ".app-shell"), opacity: 1 },
    { name: "--brand-ink", colour: inkInScope(files, "--brand-ink", ".app-shell"), opacity: 1 },
    // The header's 11 px caption, read off the running app on 2026-10-11.
    { name: "header caption", colour: "rgb(146, 156, 135)", opacity: 1 },
    {
      name: "coach hint strip",
      colour: declaredColour(
        files,
        designFile(files, "start.css"),
        COACH_HINT,
        ".start-coach-strip-hint",
      ),
      opacity: 1,
    },
    {
      name: "disabled heat label",
      colour: declaredColour(
        files,
        HEAT_TOGGLE,
        DISABLED_LABEL,
        "HeatmapToggle: deaktiviertes Label",
      ),
      opacity: stateDim(HEAT_TOGGLE),
    },
    {
      name: "HEAT caption",
      colour: (HEAT_TOGGLE.match(HEAT_CAPTION)?.[1] as string) ?? "",
      opacity: 1,
    },
    // The dock's step buttons and its start button; `#fff2e9` is brighter than
    // any token, which is exactly why no token read covered it.
    {
      name: "dock step label",
      colour: declaredColour(files, ACTION_BAR, STEP_LABEL, "ActionBar: Schritt-Label ‹ / ›"),
      opacity: dockDim,
    },
    {
      name: "dock action label",
      colour: declaredColour(
        files,
        ACTION_BAR,
        ACTION_LABEL,
        "ActionBar: Aktionsknopf, zweite Farbe",
        2,
      ),
      opacity: dockDim,
    },
    // The overflow menu's trigger, closed: the one label on the bar that is
    // deliberately quieter than the rest, and still a word a reader has to make
    // out. The open state takes `--brand-ink`, already in this list.
    {
      name: "dock more label",
      colour: declaredColour(files, ACTION_BAR, MORE_LABEL, "ActionBar: Mehr-Knopf, geschlossen"),
      opacity: dockDim,
    },
    // The overflow menu's items inherit this from the menu container's inline
    // style; the container's own plate is opaque `#20201e`, darker than every
    // field this file composites, so holding the ink to the glass fields is the
    // stricter read, not a different one.
    {
      name: "export menu label",
      colour: declaredColour(files, ACTION_BAR, MENU_LABEL, "ActionBar: Tinte des Export-Popups"),
      opacity: dockDim,
    },
  ];
}

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
function chromeState(files: readonly (readonly [string, string])[]) {
  const rules = rulesFrom(files);
  const tokens = tokensFrom(files);
  const grounds = GROUNDS;
  const inks = chromeInks(files).map((ink) => ({ ...ink, parsed: parseColor(ink.colour) }));
  return SURFACES.map((surface) => {
    const { ranked, winner } = backgroundOwners(surface, rules, tokens);
    const unlayered = ranked.filter((o) => !o.rule.layer);
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
    const imageLayer = layers.find((l) => /gradient\(/i.test(l));
    const sheen = imageLayer ? (imageLayer.match(/rgba?\([^)]*\)/)?.[0] ?? null) : null;
    const bg = colourLayer ? parseColor(colourLayer) : null;
    const fields = bg
      ? grounds.map((ground) => {
          const tinted = toHex(composite(bg, ground));
          return sheen ? toHex(composite(parseColor(sheen), tinted)) : tinted;
        })
      : [];
    // What the eye gets: the ink laid over this field at its own opacity. At
    // opacity 1 this is the declared colour unchanged; a dimmed label blends
    // toward the field, which is exactly how it drops off the floor.
    const onField = (ink: (typeof inks)[number], field: string): string =>
      toHex(composite({ rgb: ink.parsed.rgb, alpha: ink.opacity }, field));
    const worst = bg
      ? Math.min(
          ...fields.flatMap((field) => inks.map((ink) => contrast(onField(ink, field), field))),
        )
      : 0;
    const worstInk = bg
      ? inks.reduce(
          (acc, ink) => {
            const c = Math.min(...fields.map((field) => contrast(onField(ink, field), field)));
            return c < acc.c ? { ink: ink.name, c } : acc;
          },
          { ink: inks[0]?.name ?? "", c: Number.POSITIVE_INFINITY },
        )
      : { ink: "", c: 0 };
    return {
      surface,
      ranked,
      unlayered,
      winner,
      colourLayer: colourLayer ?? "",
      sheen,
      fields,
      worst,
      worstInk,
    };
  });
}

const SURFACES: Surface[] = [
  { name: "workspace header", own: ["workspace-header"], ancestors: [["app-shell"]] },
  {
    name: "findings panel",
    own: ["panel-findings", "panel-card", "pointer-events-auto"],
    ancestors: [["app-shell"], ["construction-ui"]],
  },
  {
    name: "file panel",
    own: ["panel-info", "panel-card", "panel-scroll", "animate-slide-right", "pointer-events-auto"],
    ancestors: [["app-shell"], ["construction-ui"]],
  },
  {
    name: "action dock",
    own: [
      "action-dock-row",
      "flex",
      "flex-wrap",
      "items-center",
      "justify-center",
      "gap-1",
      "rounded-xl",
      "p-1.5",
    ],
    ancestors: [["action-dock"], ["app-shell"], ["construction-ui"]],
  },
  {
    name: "first-look coach",
    own: ["city-coach", "start-coach"],
    ancestors: [["app-shell"], ["construction-ui"]],
  },
  {
    name: "mode bar",
    own: [
      "glass",
      "flex",
      "items-center",
      "gap-1",
      "rounded",
      "px-2",
      "py-1.5",
      "pointer-events-auto",
    ],
    ancestors: [["workspace-modes"], ["construction-ui"], ["app-shell"]],
  },
  {
    name: "heat channel",
    own: ["glass", "flex", "items-center", "gap-1", "rounded", "px-2", "py-1.5"],
    ancestors: [["workspace-heatmap"], ["construction-ui"], ["app-shell"]],
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
  const tint = (): ReturnType<typeof parseColor> => parseColor(rootToken("glass-chrome-bg"));

  it("trägt eine eigene Token-Schicht, keine verstreuten Zahlen", () => {
    expect(tint().alpha).toBeGreaterThan(0);
    expect(tint().alpha).toBeLessThan(1);
    expect(rootToken("glass-chrome-blur")).toContain("blur(");
  });

  it("hält die Schrift auf dem hellsten Grund, der je hinter ihr liegen kann", () => {
    // The plaza is the brightest floor in the picture; the sky behind the header
    // and the haze at the horizon are close seconds. Whichever of these sits
    // under a frosted bar is the worst case for the label on it.
    const grounds = [ENV.plot, ENV.ground, ENV.fog, ENV.crosswalk];
    // The inks that actually sit on a glassed surface, read off the running app
    // on 2026-10-11: the header's brand line and the heat bar's label are the
    // two darkest things on the frost. `--meta-faint` is deliberately NOT in
    // this set — it is a landing-screen ink and appears on none of the five
    // glassed surfaces, which is what the old "AA on glass" note beside it
    // meant: that promise was measured over the dark shell, not over the city.
    const inks = ["color-text", "meta-strong", "meta", "brand-ink"].map((t) =>
      parseColor(rootToken(t)),
    );
    inks.push(parseColor("rgb(146, 156, 135)")); // the header's 11px caption
    for (const ground of grounds) {
      const field = toHex(composite(tint(), ground));
      for (const ink of inks) {
        const c = contrast(toHex(ink.rgb), field);
        expect(
          c,
          `Text ${toHex(ink.rgb)} auf Glas über ${ground} (${field})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("hält auch auf dem dunkelsten Grund", () => {
    const field = toHex(composite(tint(), "#0d0d0c"));
    for (const t of ["color-text", "meta-strong"]) {
      const ink = parseColor(rootToken(t));
      expect(contrast(toHex(ink.rgb), field), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  /** Every rule of the design files, split into header and body — linear, and
   *  a nested-quantifier regex over 1.5k lines of CSS hangs the runner. */
  function rules(text: string): Array<{ sel: string; body: string }> {
    const out: Array<{ sel: string; body: string }> = [];
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ sel: (m[1] ?? "").trim(), body: m[2] ?? "" });
    }
    return out;
  }
  const allRules = css.flatMap(([f, t]) => rules(t).map((r) => ({ ...r, file: f })));

  it("legt das Glas auf jede Chrome-Fläche", () => {
    for (const sel of CHROME) {
      const hits = allRules.filter((r) =>
        r.sel.split(",").some((one) => one.trim().endsWith(sel.trim())),
      );
      expect(hits.length, `${sel} hat keine Regel mehr`).toBeGreaterThan(0);
      expect(
        hits.some((r) => /backdrop-filter/.test(r.body)),
        `${sel} bekommt kein Glas`,
      ).toBe(true);
      expect(
        hits.some((r) => /var\(--glass-chrome-bg\)/.test(r.body)),
        `${sel} benutzt nicht die eine Token-Schicht`,
      ).toBe(true);
    }
  });

  it("lässt die Welt-Labels in Ruhe — dort ist das der gemessene Ausfall", () => {
    // 1,83:1 was the district plate under a frosted layer over the plaza. The
    // fix is not a better tint: it is that nothing tints them at all.
    const worldRules = allCss.match(/\.cf-[a-z-]+[^{}]*\{[^}]*\}/g) ?? [];
    expect(
      worldRules.length,
      "keine Welt-Label-Regeln gefunden — Wächter taugt nichts",
    ).toBeGreaterThan(3);
    for (const rule of worldRules) {
      expect(rule, `Welt-Fläche wird verglast:\n${rule.slice(0, 120)}`).not.toMatch(
        /backdrop-filter/,
      );
    }
  });

  it("widerruft die Accessibility-Entscheidung nicht stillschweigend", () => {
    const dock = allCss.match(/\.action-dock-row\s*\{([^}]*)\}/g) ?? [];
    const text = dock.join("\n");
    expect(
      text,
      "die alte Solid-Regel ist noch da UND das Glas auch — zwei Quellen für eine Fläche",
    ).not.toMatch(/background:\s*#20201e\s*!important/);
    const comment = css.find(([, t]) => t.includes("glass-chrome-bg"))?.[1] ?? "";
    expect(comment, "keine Zeile erklärt, warum das Glas wieder da ist").toMatch(/accessibility/i);
  });

  /* ── The four cases below read the ruling declaration, not the token. ──── */

  it("lädt globals.css zuletzt — die Ordnung, gegen die eine zweite Regel gewinnen würde", () => {
    // Every tie in this cascade is decided by file order, so the order is a
    // fact the guard has to hold on to rather than a premise it borrows.
    const main = readFileSync(path.resolve(import.meta.dirname, "../src/main.tsx"), "utf-8");
    const appImport = main.indexOf(`from "./App"`);
    const designImport = main.indexOf(`import "./design/globals.css"`);
    expect(appImport, "main.tsx importiert App nicht").toBeGreaterThan(-1);
    expect(designImport, "main.tsx importiert globals.css nicht").toBeGreaterThan(appImport);
    // The other three sheets come in through the component graph, which runs
    // first: measured in the browser as the order of style[data-vite-dev-id].
    for (const file of ["stadt-ui.css", "start.css", "city-funktion.css"]) {
      expect(LOAD_ORDER.indexOf(file), `${file} ist nicht vor globals.css geladen`).toBeLessThan(
        LOAD_ORDER.indexOf("globals.css"),
      );
    }
  });

  it("dass über jeder Chrome-Fläche genau eine Regel regiert", () => {
    for (const state of chromeState(css)) {
      const owners = state.unlayered.map(
        (o) => `${o.rule.file}:${o.rule.line} → ${o.decl.value.slice(0, 60)}`,
      );
      expect(
        owners,
        `${state.surface.name} wird von ${owners.length} Regeln regiert:\n  ${owners.join("\n  ")}`,
      ).toHaveLength(1);
    }
  });

  it("hält die Fläche, die diese Regel berechnet, die Tinte über jedem Grund", () => {
    const token = rootToken("glass-chrome-bg");
    const sheenStop = (rootToken("glass-chrome-sheen")
      .replace(/\s+/g, " ")
      .match(/rgba?\([^)]*\)/) ?? [""])[0];
    for (const state of chromeState(css)) {
      const winner = state.winner;
      expect(winner, `${state.surface.name} hat regierenden Hintergrund`).not.toBeNull();
      expect(
        winner?.decl.value.replace(/\s+/g, " "),
        `${state.surface.name} wird nicht aus einer Hand verglast: ${winner?.rule.file}:${winner?.rule.line} → ${winner?.decl.value}`,
      ).toContain("var(--glass-chrome-bg)");
      expect(state.colourLayer, `${state.surface.name}: kein Grundton zu lesen`).not.toBe("");
      expect(
        parseColor(state.colourLayer).rgb,
        `${state.surface.name}: die regierende Regel rechnet nicht zum Chrome-Token`,
      ).toEqual(parseColor(token).rgb);
      // The same declaration carries the sheen, so the field this case measures
      // is the field the browser draws: colour first, then the top stop of
      // exactly this gradient on top of it.
      expect(state.sheen, `${state.surface.name}: kein Glanz auf der Fläche`).not.toBeNull();
      expect(
        parseColor(state.sheen as string),
        `${state.surface.name}: der Glanz auf der Fläche ist nicht der des Tokens`,
      ).toEqual(parseColor(sheenStop));
      expect(
        state.fields,
        `${state.surface.name}: Feldfarben ${state.fields.join(" ")}`,
      ).toHaveLength(4);
      expect(state.worstInk.ink, `${state.surface.name}: keine Tinte gemessen`).not.toBe("");
      // 4,5 is the criterion, not a measured number: every value this case
      // prints comes out of the composite above.
      expect(
        state.worst,
        `${state.surface.name} hält nur ${state.worst.toFixed(2)} (${state.worstInk.ink}) über ${state.fields.join(" ")}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("hält jede Tinte der Liste über jedem Grund, und die Liste ist vollständig", () => {
    // The guard against an exception. None of these are tokens: the coach's hint
    // line is a literal in start.css, and every other one is an inline style in
    // a component. Naming them here is what turns "the ink list drops one
    // surface's text" into a red case instead of a quietly smaller measurement —
    // a guard that excepts a surface does not guard it.
    const carried = [
      { ink: "coach hint strip", surface: "first-look coach" },
      { ink: "disabled heat label", surface: "heat channel" },
      { ink: "HEAT caption", surface: "heat channel" },
      { ink: "dock step label", surface: "action dock" },
      { ink: "dock action label", surface: "action dock" },
      { ink: "dock more label", surface: "action dock" },
      // The export items hang off the dock and inherit the menu's ink. Held to
      // the dock's fields rather than to their own plate, because the plate is
      // opaque `#20201e` and every glass field this file computes is brighter.
      { ink: "export menu label", surface: "action dock" },
    ];
    const states = chromeState(css);
    const inks = chromeInks(css);
    const floor = 4.5;
    const rows: string[] = [];
    let lowest = Number.POSITIVE_INFINITY;
    for (const c of carried) {
      const ink = inks.find((i) => i.name === c.ink);
      expect(
        ink,
        `${c.ink} fehlt in der Tintenliste — eine Fläche ist wieder ausgenommen`,
      ).toBeDefined();
      const state = states.find((s) => s.surface.name === c.surface);
      expect(state, `${c.surface} ist keine Chrome-Fläche`).toBeDefined();
      const parsed = parseColor(ink!.colour);
      // The dimming belongs to the ink, not to the surface: text at `opacity`
      // over the field it sits on is what the eye gets.
      const opacity = parsed.alpha * ink!.opacity;
      const cells = GROUNDS.map((ground, i) => {
        const field = state!.fields[i] as string;
        const effective = toHex(composite({ rgb: parsed.rgb, alpha: opacity }, field));
        const ratio = contrast(effective, field);
        lowest = Math.min(lowest, ratio);
        return `${ground}→${field}${effective !== ink!.colour.toLowerCase() ? `≈${effective}` : ""} ${ratio.toFixed(2)}`;
      });
      rows.push(
        `  ${c.ink.padEnd(21)} ${ink!.colour}${opacity < 1 ? ` ×${opacity}` : ""}: ${cells.join("   ")}`,
      );
    }
    expect(
      lowest,
      `Tinte auf der festen Schale, gefordert ≥ ${floor} über jedem Grund:\n${rows.join("\n")}`,
    ).toBeGreaterThanOrEqual(floor);
  });

  it("fällt, sobald die Konstante oder die Fläche geändert wird — der Wächter hat Zähne", () => {
    // A guard that cannot fail has not checked anything, so both mutations run
    // the same machinery as the cases above: no number is typed in here, every
    // one is what the composite of this file returns for the copied sheets.
    const good = chromeState(css);
    const lighter: Array<readonly [string, string]> = css.map(
      ([f, t]) =>
        [
          f,
          f === "globals.css"
            ? t.replace(
                /--glass-chrome-bg:\s*rgba\(14,\s*16,\s*21,\s*0\.92\)/,
                "--glass-chrome-bg: rgba(14, 16, 21, 0.8)",
              )
            : t,
        ] as const,
    );
    expect(lighter[0]?.[1], "die Kopie hat die Konstante nicht erreicht").not.toBe(css[0]?.[1]);
    const washed = chromeState(lighter);
    for (const [i, state] of washed.entries()) {
      expect(state.worst, `${state.surface.name} bei 0,80`).toBeLessThan(4.5);
      expect(state.worst, `${state.surface.name} fällt nicht gegenüber 0,92`).toBeLessThan(
        good[i]?.worst as number,
      );
    }

    // A second, later rule over one surface, appended in a copy of the sheet —
    // the shape that actually shipped here: a flat `#243747` sitting later in
    // globals.css than the token, which left the mode bar at rgb(36, 55, 71)
    // in the running app while the old case still found "a rule with token and
    // blur" somewhere in the tree and signed the surface off.
    const flat: Array<readonly [string, string]> = css.map(
      ([f, t]) =>
        [
          f,
          f === "globals.css" ? `${t}\n.workspace-modes .glass {\n  background: #243747;\n}\n` : t,
        ] as const,
    );
    expect(
      flat.find(([f]) => f === "globals.css")?.[1],
      "die Kopie hat die Flächen-Regel nicht erreicht",
    ).not.toBe(css.find(([f]) => f === "globals.css")?.[1]);
    const before = chromeState(css).find((s) => s.surface.name === "mode bar");
    const modeBar = chromeState(flat).find((s) => s.surface.name === "mode bar");
    expect(
      before?.unlayered.length,
      "schon im echten Baum regieren zwei Regeln die Modusleiste",
    ).toBe(1);
    expect(
      modeBar?.unlayered.map((o) => `${o.rule.file}:${o.rule.line}`),
      "eine zweite Regel über derselben Fläche, und die Zahl der Eigentümer bleibt bei eins",
    ).toHaveLength(2);
    expect(
      modeBar?.winner?.colour,
      "die flache Farbe gewinnt, aber der Auswerter nennt immer noch das Token",
    ).toBe("#243747");
    expect(modeBar?.worst, "die flache Modusleiste hält 4,5 — der Wächter ist blind").toBeLessThan(
      4.5,
    );
  });
});
