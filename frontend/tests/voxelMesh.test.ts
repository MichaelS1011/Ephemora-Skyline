// @vitest-environment jsdom
// The helpers live next to the R3F component (single ownership file), so the
// module import pulls the fiber stack — jsdom keeps that import happy.

import { describe, it, expect } from "vitest";
import { buildInstanceTransforms, sectionBandHeights } from "../src/components/VoxelMesh";
import {
  VOXEL_BUDGET,
  VOXEL_SIZE,
  generateVoxelLayout,
  type VoxelCell,
  type VoxelLayout,
  type VoxelSectionLayout,
} from "../src/city/voxels";
import type { CityFile } from "../src/city/types";

function cell(x: number, y: number, z: number, kind: VoxelCell["kind"] = "code"): VoxelCell {
  return { x, y, z, kind };
}

function section(partial: Partial<VoxelSectionLayout> & { name: string }): VoxelSectionLayout {
  return {
    kind: "function",
    startLine: 1,
    endLine: 10,
    base: { x: 0, z: 0 },
    detail: true,
    cells: [],
    codeLines: 10,
    depth: 0,
    ...partial,
  };
}

function layout(sections: VoxelSectionLayout[], overrides: Partial<VoxelLayout> = {}): VoxelLayout {
  return {
    footprintW: 6,
    footprintD: 6,
    height: 40,
    voxelSize: VOXEL_SIZE,
    sections,
    totalVoxels: 100,
    ...overrides,
  };
}

function stubFile(): CityFile {
  return {
    id: "f1",
    name: "a.ts",
    path: "src/a.ts",
    language: "TypeScript",
    linesOfCode: 120,
    cyclomaticComplexity: 5,
    threatLevel: "safe",
    findings: [],
  };
}

describe("buildInstanceTransforms", () => {
  it("counts exactly the detail sections' cells — slab sections contribute nothing", () => {
    const l = layout([
      section({ name: "fnA", cells: [cell(0, 0, 0), cell(1, 0, 0), cell(0, 1, 0)] }),
      section({ name: "module", detail: false, cells: [], codeLines: 40 }),
      section({ name: "fnB", cells: [cell(2, 2, 2), cell(3, 2, 2)] }),
    ]);
    expect(buildInstanceTransforms(l)).toHaveLength(5);
  });

  it("is deterministic: same layout in, same list out — sections then cells in order", () => {
    const l = layout([
      section({ name: "fnA", cells: [cell(0, 0, 0), cell(1, 0, 0)] }),
      section({ name: "fnB", base: { x: 1, z: 1 }, cells: [cell(0, 5, 0)] }),
    ]);
    const first = buildInstanceTransforms(l);
    const second = buildInstanceTransforms(l);
    expect(second).toEqual(first);
    // Order: first section's cells, then the second's — array order inside
    expect(first[0]).toMatchObject({ x: 0, y: 0.5 * VOXEL_SIZE, z: 0 });
    expect(first[1]).toMatchObject({ x: VOXEL_SIZE, y: 0.5 * VOXEL_SIZE, z: 0 });
    expect(first[2]).toMatchObject({
      x: 1 + 0 * VOXEL_SIZE,
      y: 5.5 * VOXEL_SIZE,
      z: 1 + 0 * VOXEL_SIZE,
    });
  });

  it("applies the section base offset and centers cell rows on the base plane", () => {
    const l = layout([
      section({
        name: "fn",
        base: { x: 2, z: -1 },
        cells: [cell(1, 0, 3), cell(-2, 7, 0, "comment")],
      }),
    ]);
    const t = buildInstanceTransforms(l);
    expect(t[0]).toMatchObject({
      x: 2 + 1 * VOXEL_SIZE,
      y: 0.5 * VOXEL_SIZE,
      z: -1 + 3 * VOXEL_SIZE,
      kind: "code",
    });
    expect(t[1]).toMatchObject({
      x: 2 + -2 * VOXEL_SIZE,
      y: 7.5 * VOXEL_SIZE,
      z: -1,
      kind: "comment",
    });
  });

  it("has no duplicate positions for a unique layout", () => {
    const cells: VoxelCell[] = [];
    for (let y = 0; y < 4; y++)
      for (let z = -2; z <= 2; z++)
        for (let x = -2; x <= 2; x++) cells.push(cell(x, y, z, x % 2 === 0 ? "code" : "comment"));
    const l = layout([section({ name: "fn", cells })]);
    const t = buildInstanceTransforms(l);
    expect(t).toHaveLength(cells.length);
    const keys = new Set(t.map((i) => `${i.x}|${i.y}|${i.z}`));
    expect(keys.size).toBe(t.length);
  });

  it("caps the instance count at VOXEL_BUDGET, keeping deterministic order", () => {
    const cells: VoxelCell[] = [];
    for (let i = 0; i < 6100; i++) {
      cells.push(cell(i % 7, Math.floor(i / 7) % 40, Math.floor(i / 280)));
    }
    const l = layout([section({ name: "big", cells })]);
    const t = buildInstanceTransforms(l);
    expect(t).toHaveLength(VOXEL_BUDGET);
    // The prefix of the full deterministic order survives the cap
    expect(t[0]).toMatchObject({ x: 0, y: 0.5 * VOXEL_SIZE, z: 0 });
    expect(t[VOXEL_BUDGET - 1]).toBeDefined();
  });
});

describe("sectionBandHeights", () => {
  it("returns no bands for a single-section (stub) layout", () => {
    const l = layout([section({ name: "module", detail: false, cells: [], codeLines: 120 })], {
      height: 12,
    });
    expect(sectionBandHeights(l)).toEqual([]);
    // And the shipped stub layout behaves the same
    expect(sectionBandHeights(generateVoxelLayout(stubFile()))).toEqual([]);
  });

  it("ends detail sections at their highest cell row and drops the roofline", () => {
    const l = layout([
      section({ name: "fnA", cells: [cell(0, 0, 0), cell(0, 3, 0)] }),
      section({ name: "fnB", cells: [cell(0, 7, 0)] }),
    ]);
    const bands = sectionBandHeights(l);
    expect(bands).toEqual([(3 + 1) * VOXEL_SIZE]);
  });

  it("stacks slab sections by codeLines * voxelSize", () => {
    const l = layout([
      section({ name: "imports", detail: false, cells: [], codeLines: 10 }),
      section({ name: "module", detail: false, cells: [], codeLines: 20 }),
      section({ name: "tail", detail: false, cells: [], codeLines: 5 }),
    ]);
    expect(sectionBandHeights(l)).toEqual([10 * VOXEL_SIZE, 30 * VOXEL_SIZE]);
  });

  it("clamps to layout.height and skips near-duplicate boundaries", () => {
    const s = VOXEL_SIZE;
    const l = layout(
      [
        section({ name: "a", detail: false, cells: [], codeLines: 1 }), // top = 1s
        section({ name: "b", detail: false, cells: [], codeLines: 1 }), // top = 2s
        section({ name: "c", detail: false, cells: [], codeLines: 1 }), // clamped to 2.4s
        section({ name: "d", detail: false, cells: [], codeLines: 1 }), // clamped to 2.4s (roofline)
      ],
      { height: 2.4 * s },
    );
    // 2.4s survives as a candidate but sits < 0.75s above the 2s band → merged
    expect(sectionBandHeights(l)).toEqual([1 * s, 2 * s]);
  });

  it("skips boundaries too close to the ground", () => {
    const s = VOXEL_SIZE;
    const l = layout([
      section({ name: "a", detail: false, cells: [], codeLines: 0.5 }), // top = 0.5s < 0.75s → skipped
      section({ name: "b", detail: false, cells: [], codeLines: 1 }), // top = 1.5s
      section({ name: "c", detail: false, cells: [], codeLines: 10 }), // roofline
    ]);
    expect(sectionBandHeights(l)).toEqual([1.5 * s]);
  });
});
