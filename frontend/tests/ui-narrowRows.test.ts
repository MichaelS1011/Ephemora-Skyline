// @vitest-environment node
// Measured on the running app (demo city, real clicks; probes:
// a local measurement script that is not shipped and laneB-dock.mjs):
//   - from 760 px down every one of the three ModeBar buttons had the search
//     field painted over its centre — no view mode was reachable by mouse;
//   - the breadcrumb chip's `max-width: calc(50% - 178px)` applied at every
//     width, so at 320 px it computed to -18 px and the chip rendered 0 px wide
//     with 83 px of content scrolled inside it;
//   - `.action-dock-row { flex-wrap: nowrap }` pushed the dock past both screen
//     edges at 320 px (content 309 px in a 292 px box: Triage at -4, More at
//     324 of a 320 px window).
//
// jsdom cannot lay out CSS, and a "does the file mention it" match proved too
// weak for this file: the first attempt declared the narrow values inside the
// @media (max-width: 760px) block near the top and the app still measured
// top:85..115, because the base rule further down won the cascade. So this guard
// replays the cascade — it asks which declaration a browser applies at a given
// width, in source order, last one wins.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const file = path.resolve(import.meta.dirname, "../src/design/globals.css");
const css = readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

interface Declared {
  selector: string;
  prop: string;
  value: string;
  /** The enclosing @media/@supports condition, or null when always applicable. */
  cond: string | null;
}

/** The index of the `}` that closes the `{` at `open`. */
function matchBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** Split a selector list on commas that are not inside `:has(…)`. */
function selectorsOf(head: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of head) {
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

function collect(head: string, body: string, cond: string | null, out: Declared[]): void {
  for (const selector of selectorsOf(head)) {
    for (const decl of body.split(";")) {
      const at = decl.indexOf(":");
      if (at === -1) continue;
      out.push({
        selector,
        prop: decl.slice(0, at).trim(),
        value: decl.slice(at + 1).trim(),
        cond,
      });
    }
  }
}

/** Walks the stylesheet, descending into at-rule blocks, in source order. */
function parse(source: string, cond: string | null, from: number, out: Declared[]): number {
  let i = from;
  while (i < source.length) {
    const open = source.indexOf("{", i);
    if (open === -1) break;
    const head = source.slice(i, open);
    // A `}` before the next `{` ends the block we were handed.
    if (head.includes("}")) return i + head.lastIndexOf("}") + 1;
    const close = matchBrace(source, open);
    const trimmed = head.trim();
    if (/^@(media|supports)/.test(trimmed)) {
      i = parse(source, trimmed.replace(/^@\w+/, "").trim(), open + 1, out);
      continue;
    }
    if (trimmed.startsWith("@")) {
      // @keyframes / @font-face: replaying their inner steps is not layout
      i = close + 1;
      continue;
    }
    if (trimmed) collect(trimmed, source.slice(open + 1, close), cond, out);
    i = close + 1;
  }
  return i;
}

const declared: Declared[] = [];
parse(css, null, 0, declared);

/** Whether a condition like `(max-width: 760px) and (min-width: 300px)` holds. */
function condHolds(cond: string | null, width: number): boolean {
  if (!cond) return true;
  const max = /max-width:\s*(\d+)px/.exec(cond);
  const min = /min-width:\s*(\d+)px/.exec(cond);
  if (max && width > Number(max[1])) return false;
  if (min && width < Number(min[1])) return false;
  return true;
}

/** The value a browser applies for `selector`/`prop` at `width` (last one wins). */
function applied(selector: string, prop: string, width: number): string | undefined {
  const hits = declared.filter(
    (d) => d.selector === selector && d.prop === prop && condHolds(d.cond, width),
  );
  return hits.length > 0 ? hits[hits.length - 1]!.value : undefined;
}

describe("the cascade replay sees the file the way the browser does", () => {
  it("reads the wide-screen layout", () => {
    // Calibration: if these read wrong, every assertion below reads wrong too.
    expect(applied(".workspace-modes", "top", 1600)).toBe("78px");
    expect(applied(".workspace-breadcrumbs", "max-width", 1024)).toBe("calc(50% - 178px)");
    expect(applied(".search-control", "width", 1600)).toBe("320px");
    expect(applied(".city-coach", "bottom", 1600)).toContain("var(--dock-h");
  });
});

describe("the narrow workspace gives every control its own row", () => {
  it("moves the mode bar below the search field and the toast band", () => {
    for (const width of [760, 480, 420, 380, 360, 320]) {
      const top = applied(".workspace-modes", "top", width) ?? "none";
      expect(Number.parseInt(top, 10), `mode bar top at ${width}px`).toBeGreaterThanOrEqual(176);
    }
  });

  it("keeps the breadcrumb cap wide-screen only", () => {
    expect(applied(".workspace-breadcrumbs", "max-width", 320)).toMatch(/^calc\(100%/);
    expect(applied(".workspace-breadcrumbs", "max-width", 760)).toMatch(/^calc\(100%/);
    expect(applied(".workspace-breadcrumbs", "max-width", 761)).toBe("calc(50% - 178px)");
  });

  it("lets the action dock wrap instead of running off both edges", () => {
    expect(applied(".action-dock-row", "flex-wrap", 320)).toBe("wrap");
    expect(applied(".action-dock-row", "flex-wrap", 700)).toBe("wrap");
  });

  it("clears the dock by its published height, not by a fixed offset", () => {
    // A wrapped dock is taller than the fixed 86px band the panels, the heat
    // toggle and the tour used to sit on.
    for (const selector of [".panel-info", ".panel-findings", ".security-tour"]) {
      const bottom = applied(selector, "bottom", 320) ?? "none";
      expect(bottom, `${selector} bottom at 320px`).toContain("var(--dock-h");
    }
    // the heat bar is the last of them still standing on that band; the `[?]`
    // note it shared it with is one of the surfaces the arrival budget folds
    expect(applied(".workspace-heatmap", "bottom", 320)).toContain("var(--dock-h");
  });

  it("leaves the scan toast on its 128px band", () => {
    // Watching rule: the toast keeps clear of the mode switch, and the mode
    // switch now lives below it — the two must not swap places.
    expect(applied('div[role="status"].animate-toast-in', "top", 1600)).toBe("128px !important");
    expect(applied('div[role="status"].animate-toast-rise', "top", 320)).toBe("128px !important");
  });
});
