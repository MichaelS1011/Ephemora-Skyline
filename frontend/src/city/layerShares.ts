import type { CityDir, CityFile } from "./types";

/**
 * The layer view (Zielbild 2026-10-22, element #21): four numbers, one per
 * layer the city is drawn from.
 *
 * Each is a SHARE OF FILES the layer has an answer for, never a quality score.
 * That distinction is the whole content of the block: "Security findings 12 %"
 * means 12 % of the files carry at least one finding, and the other 88 % are
 * not clean — some of them are simply unexamined, which the card already says
 * with its own line (`ctx.unchecked`). A bar that looked like a grade would be
 * a second, contradicting claim about the same payload.
 *
 * The four answers come from four different fields, and each field is absent
 * rather than zero when the layer did not run: `coveragePct` needs an lcov
 * report, `importCount` is a count the reader produces for source files only,
 * `findings` is empty both for a clean file and for one no scanner opened. So
 * the denominators are honest only per layer, and each row names its own.
 */
export type LayerKey = "structure" | "security" | "dependencies" | "coverage";

export interface LayerShare {
  key: LayerKey;
  /** Files the layer answers, out of `total`. */
  answered: number;
  /** Files the layer was run over at all — the field is present on them. */
  read: number;
  total: number;
  /**
   * Whole percent, rounded; 0 when there are no files at all; **null when the
   * layer never ran**. The last case is the one that matters: the demo payload
   * carries no coverage report for any file, and a row reading "0 %" there
   * claims the opposite of what happened — nothing was measured, not that
   * nothing is covered.
   */
  pct: number | null;
}

/** The order the block shows, and the two questions each row answers. */
const FRAGE: Record<
  LayerKey,
  { gelesen: (f: CityFile) => boolean; beantwortet: (f: CityFile) => boolean }
> = {
  // Structure: every drawn file has lines; the layer ran wherever it ran.
  structure: {
    gelesen: () => true,
    beantwortet: (f) => f.linesOfCode > 0,
  },
  // Security: an empty findings list is an answer, so the layer always ran.
  security: {
    gelesen: (f) => Array.isArray(f.findings),
    beantwortet: (f) => f.findings.length > 0,
  },
  // Dependencies: `importCount: 0` means the reader looked and found nothing,
  // so the row's share is the files that actually depend on something.
  dependencies: {
    gelesen: (f) => typeof f.importCount === "number" && Number.isFinite(f.importCount),
    beantwortet: (f) => typeof f.importCount === "number" && f.importCount > 0,
  },
  // Coverage: only a report names a file, and a report of 0 % is still a report.
  coverage: {
    gelesen: (f) => typeof f.coveragePct === "number" && Number.isFinite(f.coveragePct),
    beantwortet: (f) => typeof f.coveragePct === "number" && f.coveragePct > 0,
  },
};

export const LAYER_ORDER: readonly LayerKey[] = [
  "structure",
  "security",
  "dependencies",
  "coverage",
];

/** The row's name, as a dictionary key — kept here so the block cannot grow a
 *  fifth row nobody taught. */
export const LAYER_LABEL: Record<
  LayerKey,
  "ctx.layer.structure" | "ctx.layer.security" | "ctx.layer.dependencies" | "ctx.layer.coverage"
> = {
  structure: "ctx.layer.structure",
  security: "ctx.layer.security",
  dependencies: "ctx.layer.dependencies",
  coverage: "ctx.layer.coverage",
};

/**
 * The files a plaza holds — its own drawn ones plus every folded district's.
 *
 * `dir.detailFiles` alone is not the plaza: at the root of the demo it is empty
 * while its six districts hold all 74 files, so a share computed on it would
 * say nothing at exactly the moment the reader arrives. This is the same walk
 * `folderShape` in `verify.ts` uses, for the same reason: the files the mapper
 * delivered, not only the towers one sub-district draws.
 */
export function plazaFiles(dir: CityDir | undefined): CityFile[] {
  const out: CityFile[] = [];
  const walk = (node: CityDir | undefined): void => {
    if (!node) return;
    for (const f of node.detailFiles ?? []) out.push(f);
    for (const child of node.children ?? []) walk(child);
  };
  walk(dir);
  return out;
}

/**
 * The four shares over one plaza's files. Pure: the same payload always gives
 * the same four numbers, which is what the acceptance check re-derives from the
 * demo JSON rather than from the rendered card.
 */
export function layerShares(files: readonly CityFile[]): LayerShare[] {
  const total = files.length;
  return LAYER_ORDER.map((key) => {
    const { gelesen, beantwortet } = FRAGE[key];
    let read = 0;
    let answered = 0;
    for (const f of files) {
      if (!gelesen(f)) continue;
      read++;
      if (beantwortet(f)) answered++;
    }
    return {
      key,
      answered,
      read,
      total,
      pct: read === 0 ? null : Math.round((answered * 100) / total),
    };
  });
}
