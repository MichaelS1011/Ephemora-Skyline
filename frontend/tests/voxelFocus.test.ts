import { describe, it, expect } from "vitest";
import {
  generateVoxelLayout,
  findVoxelForLine,
  VOXEL_SIZE,
  type VoxelSectionSpec,
  type VoxelLayout,
} from "../src/city/voxels";
import type { CityFile } from "../src/city/types";

/** Deterministic file factory — mirrors tests/voxels.test.ts. */
function makeFile(overrides: Partial<CityFile> & { sections?: VoxelSectionSpec[] }): CityFile {
  return {
    id: "f1",
    name: "alpha.ts",
    path: "src/alpha.ts",
    language: "TypeScript",
    linesOfCode: 160,
    cyclomaticComplexity: 8,
    threatLevel: "safe",
    findings: [],
    exportedSymbols: 16,
    ...overrides,
  };
}

/** Three strata: imports (flat) / parse (depth inset) / Parser (flat). */
const SECTIONS: VoxelSectionSpec[] = [
  { name: "imports", kind: "imports", start: 1, end: 12, codeLines: 12, depth: 0 },
  { name: "parse", kind: "function", start: 13, end: 90, codeLines: 78, depth: 2 },
  { name: "Parser", kind: "class", start: 91, end: 160, codeLines: 70, depth: 0 },
];

describe("findVoxelForLine — section lookup", () => {
  it("maps a line in the middle of a section to that section's n-th cell", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    const hit = findVoxelForLine(layout, 50);
    expect(hit).not.toBeNull();
    // parse spans 13..90 → ordinal 50 - 13 = 37
    expect(hit!.sectionIndex).toBe(1);
    expect(hit!.cellIndex).toBe(37);
    expect(hit!.cell).toEqual(layout.sections[1]!.cells[37]);
  });

  it("maps the first line of a section to its first filled cell", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    const hit = findVoxelForLine(layout, 13);
    expect(hit!.sectionIndex).toBe(1);
    expect(hit!.cellIndex).toBe(0);
    expect(hit!.cell).toEqual(layout.sections[1]!.cells[0]!);
  });

  it("maps the last line of a section to its last filled cell", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    const hit = findVoxelForLine(layout, 90);
    expect(hit!.sectionIndex).toBe(1);
    const cells = layout.sections[1]!.cells;
    expect(hit!.cellIndex).toBe(cells.length - 1);
    expect(hit!.cell).toEqual(cells[cells.length - 1]!);
  });

  it("returns null for a line between two sections (no section contains it)", () => {
    const gapped: VoxelSectionSpec[] = [
      { name: "a", kind: "function", start: 1, end: 10, codeLines: 10, depth: 0 },
      { name: "b", kind: "function", start: 20, end: 30, codeLines: 11, depth: 0 },
    ];
    const layout = generateVoxelLayout(makeFile({ sections: gapped }));
    expect(findVoxelForLine(layout, 15)).toBeNull();
  });

  it("returns null outside every section range (before, after)", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    expect(findVoxelForLine(layout, 0)).toBeNull();
    expect(findVoxelForLine(layout, -5)).toBeNull();
    expect(findVoxelForLine(layout, 9999)).toBeNull();
  });

  it("prefers the smallest range when sections overlap", () => {
    const overlapped: VoxelSectionSpec[] = [
      { name: "wide", kind: "module", start: 1, end: 100, codeLines: 100, depth: 0 },
      { name: "inner", kind: "function", start: 40, end: 50, codeLines: 11, depth: 0 },
    ];
    const layout = generateVoxelLayout(makeFile({ sections: overlapped }));
    const hit = findVoxelForLine(layout, 45);
    expect(hit).not.toBeNull();
    expect(layout.sections[hit!.sectionIndex]!.name).toBe("inner");
    expect(hit!.cellIndex).toBe(45 - 40);
  });
});

describe("findVoxelForLine — degenerate inputs", () => {
  it("returns null for a layout without sections", () => {
    const empty: VoxelLayout = {
      footprintW: 1,
      footprintD: 1,
      height: 1,
      voxelSize: VOXEL_SIZE,
      sections: [],
      totalVoxels: 0,
    };
    expect(findVoxelForLine(empty, 1)).toBeNull();
  });

  it("returns null when the matched section degraded to a slab (detail=false)", () => {
    const big: VoxelSectionSpec[] = [1, 2, 3, 4, 5].map((n) => ({
      name: `chunk${n}`,
      kind: "function" as const,
      start: n * 4000 - 3999,
      end: n * 4000,
      codeLines: 4000,
      depth: 0,
    }));
    const layout = generateVoxelLayout(makeFile({ sections: big, linesOfCode: 20000 }));
    const slabIndex = layout.sections.findIndex((s) => !s.detail);
    expect(slabIndex).toBeGreaterThan(0);
    const slab = layout.sections[slabIndex]!;
    expect(findVoxelForLine(layout, slab.startLine)).toBeNull();
    expect(findVoxelForLine(layout, slab.endLine)).toBeNull();
  });

  it("is deterministic — two calls for the same line are deep-equal", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    expect(findVoxelForLine(layout, 77)).toEqual(findVoxelForLine(layout, 77));
  });
});

describe("findVoxelForLine — composition invariants (voxel focus V3)", () => {
  it("the hit cell stays inside the section's (possibly inset) grid", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    const gw = Math.round(layout.footprintW / VOXEL_SIZE);
    for (let line = 1; line <= 160; line++) {
      const hit = findVoxelForLine(layout, line);
      if (!hit) continue;
      const section = layout.sections[hit.sectionIndex]!;
      const inset = section.depth;
      // Terrace inset from packStrata: at least one cell per axis remains
      const maxIw = Math.max(1, gw - 2 * inset);
      expect(hit.cell.x).toBeGreaterThanOrEqual(0);
      expect(hit.cell.x).toBeLessThanOrEqual(maxIw);
      expect(hit.cell.z).toBeGreaterThanOrEqual(0);
      expect(hit.cell.z).toBeLessThanOrEqual(maxIw);
      expect(hit.cell.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("the hit cell's world position (base + cell·size) lands inside the footprint", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    for (let line = 1; line <= 160; line++) {
      const hit = findVoxelForLine(layout, line);
      if (!hit) continue;
      const section = layout.sections[hit.sectionIndex]!;
      const wx = section.base.x + hit.cell.x * VOXEL_SIZE;
      const wz = section.base.z + hit.cell.z * VOXEL_SIZE;
      expect(wx).toBeGreaterThanOrEqual(-layout.footprintW / 2 - 1e-9);
      expect(wx).toBeLessThanOrEqual(layout.footprintW / 2 + 1e-9);
      expect(wz).toBeGreaterThanOrEqual(-layout.footprintD / 2 - 1e-9);
      expect(wz).toBeLessThanOrEqual(layout.footprintD / 2 + 1e-9);
    }
  });

  it("resolves every materialized cell across all sections without gaps in its own stratum", () => {
    const layout = generateVoxelLayout(makeFile({ sections: SECTIONS }));
    layout.sections.forEach((section, sectionIndex) => {
      if (!section.detail) return;
      for (let ordinal = 0; ordinal < section.cells.length; ordinal++) {
        const line = section.startLine + ordinal;
        const hit = findVoxelForLine(layout, line);
        // Overlaps from neighboring ranges could win — but never for this
        // disjoint fixture: the hit must be exactly this section's cell.
        expect(hit!.sectionIndex).toBe(sectionIndex);
        expect(hit!.cellIndex).toBe(ordinal);
      }
    });
  });
});
