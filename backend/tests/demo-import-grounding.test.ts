import { describe, it, expect } from "vitest";
import { getDemoResult } from "../src/server/routes/demo.js";
import { DEMO_IMPORT_FIXTURES, fixtureLineCounts } from "../src/server/routes/demoFixtures.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import { scanFileStructure } from "../src/services/analyzer/file-structure.js";
import type { CityDir } from "../src/utils/cityMapper.js";

/**
 * 004-A + N-11 — the import relationships in the demo city that a source file
 * actually says.
 *
 * Every other edge in the demo comes out of a seeded random generator
 * (`pickTargets`), which is fine for a picture of a codebase and useless as a
 * claim about one. These fixtures ground two relationships in real TypeScript
 * and derive them through `scanFileStructure`, the same pass a user's scan goes
 * through. The test does not accept a declaration that the edge is real; it
 * re-derives the edge from the source text and compares.
 *
 * Both pairs were chosen before looking at the generator: a scroll hook that
 * debounces its writes is a standard dependency on its own merits, and a
 * diagnostics overlay that reports where the reader stands depends on the hook
 * that knows. Several existing random edges (`useMediaQuery → useAuth`,
 * `useScrollPosition → useFetch`) would have needed a story invented for them,
 * and were rejected for exactly that.
 */

const IMPORTER = "frontend/src/hooks/useScrollPosition.ts";
const IMPORTED = "frontend/src/hooks/useDebounce.ts";
const PANEL = "frontend/src/components/DebugPanel.tsx";

const demo = getDemoResult();
const city = mapResultToCityData(demo);
/** Every building the city lays out, as id → path. */
const drawnFiles = (): Map<string, string> => {
  const out = new Map<string, string>();
  const walk = (node: CityDir): void => {
    for (const f of [...node.detailFiles, ...node.districtFiles]) out.set(f.id, f.path);
    for (const child of node.children) walk(child);
  };
  walk(city.tree);
  return out;
};

/** Paths the city marks "has exports, nothing imports them". */
const deadCandidates = (): Set<string> => {
  const out = new Set<string>();
  const walk = (node: CityDir): void => {
    for (const f of [...node.detailFiles, ...node.districtFiles]) {
      if (f.deadCodeCandidate) out.add(f.path);
    }
    for (const child of node.children) walk(child);
  };
  walk(city.tree);
  return out;
};

const drawn = drawnFiles();

const idOf = (path: string): string => {
  const hit = [...drawn].find(([, p]) => p === path);
  if (!hit) throw new Error(`the city draws no building for ${path}`);
  return hit[0];
};

const fixtureFor = (path: string): string => {
  const f = DEMO_IMPORT_FIXTURES.find((x) => x.path === path);
  if (!f) throw new Error(`no fixture for ${path}`);
  return f.content;
};

const edge = (from: string, to: string) =>
  city.fileConnections.find((e) => e.from === idOf(from) && e.to === idOf(to));

describe("the source really contains the import", () => {
  it("has a relative import statement in the importer's text", () => {
    expect(fixtureFor(IMPORTER)).toMatch(
      /import\s*\{\s*useDebounced\s*\}\s*from\s*"\.\/useDebounce"/,
    );
  });

  it("and the shipped extractor finds exactly that one internal edge", () => {
    const { imports } = scanFileStructure(IMPORTER, fixtureFor(IMPORTER));
    const internal = imports.filter((i) => !i.isExternal);
    expect(internal.map((i) => i.source)).toEqual(["./useDebounce"]);
    expect(internal[0]!.named).toEqual(["useDebounced"]);
  });

  it("leaves the imported file with no internal imports of its own", () => {
    // It imports React, which is external — so the edge is one-way and the
    // direction the city draws is the direction the source states.
    const { imports } = scanFileStructure(IMPORTED, fixtureFor(IMPORTED));
    expect(imports.filter((i) => !i.isExternal)).toEqual([]);
    expect(imports.map((i) => i.source)).toContain("react");
  });

  it("grounds the second pair the same way: a panel that reports the scroll position", () => {
    expect(fixtureFor(PANEL)).toMatch(
      /import\s*\{\s*useScrollPosition\s*\}\s*from\s*"\.\.\/hooks\/useScrollPosition"/,
    );
    const { imports } = scanFileStructure(PANEL, fixtureFor(PANEL));
    const internal = imports.filter((i) => !i.isExternal);
    expect(internal.map((i) => i.source)).toEqual(["../hooks/useScrollPosition"]);
    expect(internal[0]!.named).toEqual(["useScrollPosition"]);
  });
});

describe("the demo carries the parsed structure, not a declared one", () => {
  it("gives the importer the imports the extractor produced", () => {
    const entry = demo.files.find((f) => f.path === IMPORTER)!;
    const parsed = scanFileStructure(IMPORTER, fixtureFor(IMPORTER));
    expect(entry.imports.map((i) => i.source).sort()).toEqual(
      parsed.imports.map((i) => i.source).sort(),
    );
    // `line: 0` is what the analyzer records for a real scan — a regex pass has
    // no node position. Matching it keeps the fixture indistinguishable.
    for (const imp of entry.imports) expect(imp.line).toBe(0);
  });

  it("reports the hook the other file exports", () => {
    const entry = demo.files.find((f) => f.path === IMPORTED)!;
    expect(entry.exports.map((e) => e.name)).toContain("useDebounced");
  });

  it("keeps the fixture's own line count equal to the number the city draws from", () => {
    // The demo states a file's split as arithmetic over `loc`, and a tower's
    // height comes out of it. A fixture that disagreed would move a tower in a
    // city a recorded clip already shows — so the two must be identical.
    for (const fixture of DEMO_IMPORT_FIXTURES) {
      const entry = demo.files.find((f) => f.path === fixture.path)!;
      const got = fixtureLineCounts(fixture.content);
      expect(got.code, `${fixture.path} code lines`).toBe(entry.lines.code);
      expect(got.comment, `${fixture.path} comment lines`).toBe(entry.lines.comments);
      expect(got.blank, `${fixture.path} blank lines`).toBe(entry.lines.blank);
      expect(got.total, `${fixture.path} total lines`).toBe(entry.lines.total);
    }
  });

  it("takes the tower height from the source, not from the file list's index", () => {
    // The published code lines ARE the fixture's own. Reordering `HOOKS` or
    // appending to any other list therefore cannot move a grounded file's
    // height out from under its text — which is what these numbers also
    // hold still for the recorded clip.
    const pins: Record<string, number> = {
      "frontend/src/hooks/useScrollPosition.ts": 84,
      "frontend/src/hooks/useDebounce.ts": 48,
      "frontend/src/components/DebugPanel.tsx": 22,
    };
    for (const [path, code] of Object.entries(pins)) {
      const entry = demo.files.find((f) => f.path === path)!;
      expect(entry.lines.code, path).toBe(code);
    }
  });

  it("quotes the finding at the line the grounded source actually holds it on", () => {
    // N-11's hazard: a file gains a real import, and its invented security
    // finding stays wherever it was written. The demo says DebugPanel logs on
    // line 12, so line 12 of the fixture has to be that statement — otherwise
    // the card points at a comment.
    const finding = demo.files.find((f) => f.path === PANEL)!.vulnerabilities[0]!;
    const line = fixtureFor(PANEL).split("\n")[finding.line - 1]!;
    expect(line.trim()).toBe('console.log("frame", frameMs);');
    expect(finding.code).toBe(line.trim());
  });
});

describe("the edges reach the city in the right direction", () => {
  it("draws one arc from the importer to the imported", () => {
    const from = idOf(IMPORTER);
    const to = idOf(IMPORTED);
    expect(from).not.toBe("");
    const edges = city.fileConnections.filter(
      (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]!.from).toBe(from);
    expect(edges[0]!.to).toBe(to);
  });

  it("weights it by the named imports the source lists", () => {
    expect(edge(IMPORTER, IMPORTED)!.weight).toBe(1); // one named import: useDebounced
    expect(edge(PANEL, IMPORTER)!.weight).toBe(1); // one named import: useScrollPosition
  });

  it("keeps both endpoints buildings the demo actually draws", () => {
    expect(drawn.get(idOf(IMPORTER))).toBe(IMPORTER);
    expect(drawn.get(idOf(IMPORTED))).toBe(IMPORTED);
    expect(drawn.get(idOf(PANEL))).toBe(PANEL);
  });

  it("points the second arc the way the source points it", () => {
    // Measured before grounding: the generator had DebugPanel importing
    // `backend/src/server/routes/health.ts`, `frontend/src/components/ChatInput.tsx`
    // and `backend/src/services/metrics-aggregator.ts` — three relations that
    // file's text never states. All three are gone; the one the text states is
    // present, and it runs panel → hook, not the reverse.
    expect(edge(PANEL, IMPORTER)).toBeDefined();
    expect(edge(IMPORTER, PANEL)).toBeUndefined();
    for (const invented of [
      "backend/src/server/routes/health.ts",
      "frontend/src/components/ChatInput.tsx",
      "backend/src/services/metrics-aggregator.ts",
    ]) {
      expect(edge(PANEL, invented), `DebugPanel does not import ${invented}`).toBeUndefined();
    }
  });
});

describe("the dead-code mark follows the grounded edges", () => {
  it("takes the chip off the hook that the panel now imports", () => {
    // 0 incoming edges was the whole basis of the claim, and the demo put it on
    // the one file it uses to demonstrate a real relationship.
    expect(city.fileConnections.filter((e) => e.to === idOf(IMPORTER))).toHaveLength(1);
    expect(deadCandidates().has(IMPORTER)).toBe(false);
  });

  it("does not put the chip on the panel that gained an outgoing edge", () => {
    // Grounding replaces only the panel's OWN imports, so its three incoming
    // edges — the reason it is not dead — survive untouched.
    expect(city.fileConnections.filter((e) => e.to === idOf(PANEL))).toHaveLength(3);
    expect(deadCandidates().has(PANEL)).toBe(false);
  });

  it("orphans nothing: exactly one file loses the mark and none gains it", () => {
    // The three dropped edges pointed at files imported elsewhere, so removing
    // them cannot make a building look unused. Pinned as a set, because a
    // silent addition here would be the demo inventing a finding.
    expect([...deadCandidates()].sort()).toEqual(
      [
        "backend/src/server/routes/webhooks.ts",
        "docs/ARCHITECTURE.md",
        "docs/GETTING_STARTED.md",
        "docs/README.md",
        "docs/SECURITY.md",
        "frontend/src/components/AppShell.tsx",
        "frontend/src/components/ThemeToggle.tsx",
        "frontend/src/stores/authStore.ts",
        "infrastructure/ci.yml",
        "infrastructure/docker-compose.yml",
        "infrastructure/nginx.conf",
      ].sort(),
    );
  });
});

describe("reproducibility", () => {
  it("rebuilds the same edges, and the same demo, on a second call", () => {
    const again = mapResultToCityData(getDemoResult());
    const first = city.fileConnections
      .map((e) => `${e.from}>${e.to}:${e.weight}`)
      .sort()
      .join(" ");
    const second = again.fileConnections
      .map((e) => `${e.from}>${e.to}:${e.weight}`)
      .sort()
      .join(" ");
    expect(second).toBe(first);
    expect(again.fileConnections.length).toBe(city.fileConnections.length);
  });

  it("still declares itself a demo that was never scanned", () => {
    // Grounding two edges must not buy the rest of the city an analyzer's claims.
    expect(demo.files.find((f) => f.path === IMPORTER)!.vulnerabilities).toEqual([]);
    for (const f of demo.files)
      for (const v of f.vulnerabilities) expect(v.provenance).toBe("demo");
    // The payload's own statement of who looked: every engine says it did not.
    const provenance = city.scanProvenance!;
    expect(Object.values(provenance).every((seen) => seen === false)).toBe(true);
  });

  it("leaves every other demo file's edges as the generator made them", () => {
    const grounded = new Set(DEMO_IMPORT_FIXTURES.map((f) => f.path));
    const untouched = demo.files.filter((f) => !grounded.has(f.path) && f.imports.length > 0);
    // The rest of the city is still illustrative data; this round grounds two
    // relationships and explicitly does not pretend to have grounded the others.
    expect(untouched.length).toBeGreaterThan(30);
  });
});
