// @vitest-environment node
/**
 * The preview sample. A large folder must become a cross-section of its
 * top-level districts, not the first 2,000 files the walk happened to meet, and
 * the accounting must carry both numbers: what was read and what was not.
 */
import { describe, expect, it } from "vitest";
import {
  PREVIEW_SAMPLE_BYTES,
  PREVIEW_SAMPLE_FILES,
  applyPreview,
  buildPreviewSample,
} from "../src/hooks/useLocalAnalysis/preview";
import type { Candidate, FolderPlan } from "../src/hooks/useLocalAnalysis";

const fileOf = (name: string, size: number): File => ({ name, size }) as unknown as File;
const candidate = (rel: string, size = 100, git = false): Candidate => ({
  rel,
  file: fileOf(rel, size),
  git,
});

const planOf = (candidates: Candidate[], found: number, bytes: number): FolderPlan => ({
  candidates,
  found,
  bytes,
  dropped: {
    pathTooLong: 0,
    unsafePath: 0,
    tooLarge: 0,
    unreadable: 0,
    excluded: 0,
    gitIgnored: 0,
    gitBudget: 0,
    unsupportedFormat: 0,
    preview: 0,
  },
  overCap: false,
  setAside: new Set(),
});

describe("the large-folder preview", () => {
  it("takes a cross-section of every top-level district, not the first folder", () => {
    const districts = ["src", "docs", "tests", "scripts", "backend", "frontend"];
    const candidates = districts.flatMap((d) =>
      Array.from({ length: 100 }, (_, i) => candidate(`${d}/file-${i}.ts`)),
    );
    const sample = buildPreviewSample(candidates, 60, PREVIEW_SAMPLE_BYTES);
    expect(sample.sampledFiles).toBe(60);
    expect(sample.districts).toBe(6);
    for (const district of districts) {
      expect(sample.picked.filter((c) => c.rel.startsWith(`${district}/`))).toHaveLength(10);
    }
  });

  it("respects the byte budget without starving a district", () => {
    const candidates = [
      candidate("src/huge.ts", 10 * 1024 * 1024),
      candidate("src/small.ts", 1),
      candidate("docs/a.ts", 10),
      candidate("tests/a.ts", 10),
    ];
    const sample = buildPreviewSample(candidates, 100, 25);
    expect(sample.sampledBytes).toBeLessThanOrEqual(25);
    expect(sample.picked.map((c) => c.rel)).toContain("src/small.ts");
    expect(sample.picked.map((c) => c.rel)).toContain("docs/a.ts");
    expect(sample.picked.map((c) => c.rel)).toContain("tests/a.ts");
    expect(sample.picked.map((c) => c.rel)).not.toContain("src/huge.ts");
  });

  it("carries git metadata outside the source budget", () => {
    const candidates = [
      candidate(".git/objects/pack", 1000, true),
      candidate("src/a.ts", 10),
      candidate("docs/a.ts", 10),
    ];
    const sample = buildPreviewSample(candidates, 2, PREVIEW_SAMPLE_BYTES);
    expect(sample.sampledFiles).toBe(2);
    expect(sample.picked.filter((c) => c.git)).toHaveLength(1);
  });

  it("leaves a small folder alone", () => {
    const plan = planOf([candidate("src/a.ts"), candidate("docs/b.ts")], 2, 200);
    expect(applyPreview(plan)).toBe(false);
    expect(plan.preview).toBeUndefined();
    expect(plan.dropped.preview).toBe(0);
  });

  it("samples an over-cap folder and counts what it left out", () => {
    const candidates = Array.from({ length: 12_000 }, (_, i) =>
      candidate(`${i % 6 === 0 ? "src" : i % 6 === 1 ? "docs" : "tests"}/f-${i}.ts`),
    );
    const plan = planOf(candidates, 12_000, 1_200_000);
    expect(applyPreview(plan)).toBe(true);
    expect(plan.overCap).toBe(false);
    expect(plan.preview).toMatchObject({
      totalFiles: 12_000,
      sampledFiles: PREVIEW_SAMPLE_FILES,
    });
    expect(plan.found).toBe(PREVIEW_SAMPLE_FILES);
    expect(plan.candidates).toHaveLength(PREVIEW_SAMPLE_FILES);
    expect(plan.dropped.preview).toBe(12_000 - PREVIEW_SAMPLE_FILES);
  });

  it("samples a folder that only crosses the byte wall", () => {
    const candidates = Array.from({ length: 100 }, (_, i) => candidate(`src/f-${i}.ts`, 2_000_000));
    const plan = planOf(candidates, 100, 200_000_000);
    expect(plan.found).toBeLessThanOrEqual(10_000);
    expect(applyPreview(plan)).toBe(true);
    expect(plan.preview?.totalBytes).toBe(200_000_000);
    expect(plan.bytes).toBeLessThanOrEqual(PREVIEW_SAMPLE_BYTES);
    expect(plan.dropped.preview).toBe(100 - (plan.preview?.sampledFiles ?? 0));
  });

  it("refuses to invent a sample when nothing can be read", () => {
    const plan = planOf([], 20_000, 0);
    expect(applyPreview(plan)).toBe(false);
    expect(plan.dropped.preview).toBe(0);
  });
});
