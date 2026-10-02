import { describe, it, expect } from "vitest";
import {
  generateVoxelLayout,
  VOXEL_BUDGET,
  VOXEL_SIZE,
  type VoxelSectionSpec,
  type VoxelLayout,
} from "../src/city/voxels";
import type { CityFile } from "../src/city/types";
import { buildingFootprint, buildingHeight } from "../src/city/mapping";

/** Deterministic file factory — fields chosen so mapping stays identical across tests. */
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

/** Unique (x, z) columns occupied by any detailed cell — the occupied ground area. */
function occupiedColumns(layout: VoxelLayout): number {
  const set = new Set<string>();
  for (const s of layout.sections) {
    for (const c of s.cells) set.add(`${c.x}|${c.z}`);
  }
  return set.size;
}

function allCells(layout: VoxelLayout): VoxelLayout["sections"][number]["cells"] {
  return layout.sections.flatMap((s) => s.cells);
}

describe("generateVoxelLayout — volume honesty", () => {
  it("totalVoxels equals the sum of section codeLines", () => {
    const sections: VoxelSectionSpec[] = [
      { name: "imports", kind: "imports", start: 1, end: 12, codeLines: 12, depth: 0 },
      { name: "parse", kind: "function", start: 13, end: 90, codeLines: 78, depth: 1 },
      { name: "Parser", kind: "class", start: 91, end: 160, codeLines: 70, depth: 0 },
    ];
    const layout = generateVoxelLayout(makeFile({ sections }));
    expect(layout.totalVoxels).toBe(160);
    const sum = layout.sections.reduce((s, sec) => s + sec.codeLines, 0);
    expect(sum).toBe(layout.totalVoxels);
  });

  it("totalVoxels equals linesOfCode when sections are absent", () => {
    const layout = generateVoxelLayout(makeFile({ linesOfCode: 137 }));
    expect(layout.totalVoxels).toBe(137);
  });
});

describe("generateVoxelLayout — section order and strata", () => {
  const sections: VoxelSectionSpec[] = [
    { name: "late", kind: "class", start: 91, end: 160, codeLines: 70, depth: 0 },
    { name: "first", kind: "imports", start: 1, end: 12, codeLines: 12, depth: 0 },
    { name: "middle", kind: "function", start: 13, end: 90, codeLines: 78, depth: 1 },
  ];

  it("packs sections in start order, first section in the lowest stratum", () => {
    const layout = generateVoxelLayout(makeFile({ sections }));
    expect(layout.sections.map((s) => s.startLine)).toEqual([1, 13, 91]);
    expect(layout.sections[0]!.name).toBe("first");
  });

  it("stacks strata strictly bottom-up (no vertical overlap between sections)", () => {
    const layout = generateVoxelLayout(makeFile({ sections }));
    const packed = layout.sections.filter((s) => s.cells.length > 0);
    expect(packed.length).toBe(3);
    for (let i = 1; i < packed.length; i++) {
      const below = packed[i - 1]!;
      const above = packed[i]!;
      const belowMaxY = Math.max(...below.cells.map((c) => c.y));
      const aboveMinY = Math.min(...above.cells.map((c) => c.y));
      expect(aboveMinY).toBeGreaterThan(belowMaxY);
    }
  });
});

describe("generateVoxelLayout — terraces from nesting depth", () => {
  const flat: VoxelSectionSpec[] = [
    { name: "body", kind: "function", start: 1, end: 40, codeLines: 40, depth: 0 },
  ];
  const tangled: VoxelSectionSpec[] = [
    { name: "body", kind: "function", start: 1, end: 40, codeLines: 40, depth: 2 },
  ];

  it("a depth=2 section occupies less ground than a depth=0 section of equal size", () => {
    const flatLayout = generateVoxelLayout(makeFile({ sections: flat }));
    const tangledLayout = generateVoxelLayout(makeFile({ sections: tangled }));
    // same input size and mapping fields → same footprint rails for both
    expect(flatLayout.footprintW).toBe(tangledLayout.footprintW);
    expect(occupiedColumns(flatLayout)).toBeGreaterThan(occupiedColumns(tangledLayout));
  });
});

describe("generateVoxelLayout — voxel budget degradation", () => {
  const big: VoxelSectionSpec[] = [1, 2, 3, 4, 5].map((n) => ({
    name: `chunk${n}`,
    kind: "function" as const,
    start: n * 4000 - 3999,
    end: n * 4000,
    codeLines: 4000,
    depth: 0,
  }));

  it("degrades top sections to slabs but keeps totalVoxels honest", () => {
    const layout = generateVoxelLayout(makeFile({ sections: big, linesOfCode: 20000 }));
    expect(layout.totalVoxels).toBe(20000);
    expect(layout.sections.some((s) => !s.detail)).toBe(true);
    const cellCount = allCells(layout).length;
    expect(cellCount).toBeLessThanOrEqual(VOXEL_BUDGET);
    // bottom (source-near) sections stay detailed, the building's end degrades first
    expect(layout.sections[0]!.detail).toBe(true);
    expect(layout.sections[layout.sections.length - 1]!.detail).toBe(false);
    // slabs still carry their metadata for the closed-floor renderer
    const slab = layout.sections[layout.sections.length - 1]!;
    expect(slab.cells).toEqual([]);
    expect(slab.codeLines).toBe(4000);
  });

  it("a 20k-line file without sections becomes one honest module slab", () => {
    const layout = generateVoxelLayout(makeFile({ linesOfCode: 20000, sections: undefined }));
    expect(layout.totalVoxels).toBe(20000);
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0]!.detail).toBe(false);
    expect(allCells(layout)).toEqual([]);
  });

  it("files under the budget stay fully detailed", () => {
    const layout = generateVoxelLayout(makeFile({ sections: big.slice(0, 1) }));
    expect(layout.sections.every((s) => s.detail)).toBe(true);
    expect(allCells(layout)).toHaveLength(4000);
  });
});

describe("generateVoxelLayout — fallback for old payloads", () => {
  it("synthesizes a single module section, volume-honest", () => {
    const layout = generateVoxelLayout(makeFile({ linesOfCode: 137, sections: undefined }));
    expect(layout.sections).toHaveLength(1);
    const only = layout.sections[0]!;
    expect(only.kind).toBe("module");
    expect(only.name).toBe("alpha.ts");
    expect(only.codeLines).toBe(137);
    expect(only.startLine).toBe(1);
    expect(only.endLine).toBe(137);
    expect(layout.totalVoxels).toBe(137);
  });
});

describe("generateVoxelLayout — mapping handrails (footprint/height caps)", () => {
  const cases: Array<Partial<CityFile>> = [
    { exportedSymbols: 0, linesOfCode: 50, cyclomaticComplexity: 2 },
    { exportedSymbols: 24, linesOfCode: 5000, cyclomaticComplexity: 5 },
    { linesOfCode: 900, cyclomaticComplexity: 3 }, // no exportedSymbols → LOC-scale footprint
  ];

  it.each(cases)("keeps footprint within [0.8, 1.6]× and height within [0.7, 1.4]× %#", (over) => {
    const file = makeFile(over);
    const layout = generateVoxelLayout(file);
    const fp = buildingFootprint(file);
    const bh = buildingHeight(file);
    expect(layout.footprintW).toBeGreaterThanOrEqual(fp * 0.8 - 1e-9);
    expect(layout.footprintW).toBeLessThanOrEqual(fp * 1.6 + 1e-9);
    expect(layout.footprintD).toBeGreaterThanOrEqual(fp * 0.8 - 1e-9);
    expect(layout.footprintD).toBeLessThanOrEqual(fp * 1.6 + 1e-9);
    expect(layout.height).toBeGreaterThanOrEqual(bh * 0.7 - 1e-9);
    expect(layout.height).toBeLessThanOrEqual(bh * 1.4 + 1e-9);
  });

  it("keeps the voxel grid consistent with the reported footprint", () => {
    const layout = generateVoxelLayout(makeFile({ sections: undefined }));
    const gw = Math.round(layout.footprintW / VOXEL_SIZE);
    const gd = Math.round(layout.footprintD / VOXEL_SIZE);
    for (const c of allCells(layout)) {
      // section-relative grid positions: within the section footprint corners
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(gw);
      expect(c.z).toBeGreaterThanOrEqual(0);
      expect(c.z).toBeLessThanOrEqual(gd);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(layout.height / VOXEL_SIZE + 1);
    }
  });
});

describe("generateVoxelLayout — determinism and integrity", () => {
  const sections: VoxelSectionSpec[] = [
    { name: "imports", kind: "imports", start: 1, end: 12, codeLines: 12, depth: 0 },
    { name: "parse", kind: "function", start: 13, end: 90, codeLines: 78, depth: 1 },
    { name: "Parser", kind: "class", start: 91, end: 160, codeLines: 70, depth: 0 },
    { name: "helper", kind: "function", start: 161, end: 220, codeLines: 55, depth: 3 },
    { name: "wrap", kind: "function", start: 221, end: 260, codeLines: 40, depth: 0 },
  ];

  it("two calls produce deep-equal layouts", () => {
    const file = makeFile({ sections });
    expect(generateVoxelLayout(file)).toEqual(generateVoxelLayout(file));
  });

  it("never places two voxels on the same grid cell", () => {
    const layout = generateVoxelLayout(makeFile({ sections }));
    const cells = allCells(layout);
    expect(cells.length).toBeGreaterThan(0);
    const keys = cells.map((c) => `${c.x}|${c.y}|${c.z}`);
    expect(new Set(keys).size).toBe(keys.length);
    // V1: every materialized cell is a code voxel
    expect(cells.every((c) => c.kind === "code")).toBe(true);
  });

  it("centers the building silhouette on (0, 0)", () => {
    // Corner-filling (spec) means partially filled floors bias the cell
    // centroid — the honest invariant is the symmetric extent of the grid.
    // Calibrate a full-floor fixture from the layout's own grid size.
    const probe = generateVoxelLayout(
      makeFile({
        sections: [{ name: "body", kind: "function", start: 1, end: 64, codeLines: 64, depth: 0 }],
      }),
    );
    const gw = Math.round(probe.footprintW / VOXEL_SIZE);
    const area = gw * gw;
    const layout = generateVoxelLayout(
      makeFile({
        linesOfCode: area,
        sections: [
          { name: "body", kind: "function", start: 1, end: area, codeLines: area, depth: 0 },
        ],
      }),
    );
    // footprintW is the world rail (≥ grid extent); the grid derives by rounding
    expect(Math.round(layout.footprintW / VOXEL_SIZE)).toBe(gw);
    const cells = allCells(layout);
    expect(cells.length).toBe(area); // exactly one full floor
    // Cells are SECTION-RELATIVE voxel centers (0-based grid + 0.5); the world
    // transform composes them with `base` (VoxelMesh). The base carries the
    // building centering: base + cell·size spans exactly the grid extent.
    const xs = cells.map((c) => c.x);
    const zs = cells.map((c) => c.z);
    expect(Math.min(...xs)).toBeCloseTo(0.5, 10);
    expect(Math.max(...xs)).toBeCloseTo(gw - 0.5, 10);
    expect(Math.min(...zs)).toBeCloseTo(0.5, 10);
    expect(Math.max(...zs)).toBeCloseTo(gw - 0.5, 10);
    // The section origin (base) sits at the building's west/north face.
    expect(layout.sections[0]!.base.x).toBeCloseTo((-gw / 2) * VOXEL_SIZE, 10);
    expect(layout.sections[0]!.base.z).toBeCloseTo((-gw / 2) * VOXEL_SIZE, 10);
    // COMPOSITION invariant (reviewed): base + cell·size must land inside the
    // building footprint for every cell — this catches double-offsets.
    for (const c of cells) {
      const wx = layout.sections[0]!.base.x + c.x * VOXEL_SIZE;
      const wz = layout.sections[0]!.base.z + c.z * VOXEL_SIZE;
      expect(wx).toBeGreaterThanOrEqual(-layout.footprintW / 2 - 1e-9);
      expect(wx).toBeLessThanOrEqual(layout.footprintW / 2 + 1e-9);
      expect(wz).toBeGreaterThanOrEqual(-layout.footprintD / 2 - 1e-9);
      expect(wz).toBeLessThanOrEqual(layout.footprintD / 2 + 1e-9);
    }
  });
});
