/**
 * Focus tiers — the semantic depth of field behind a selection.
 *
 * When a file building is selected, the city stages the selection:
 *   tier 0 = the selected building (100 %)
 *   tier 1 = its direct dependencies (both import directions, ~65 %)
 *   tier 2 = the same district (everything else on the current plaza, ~30 %)
 *   tier 3 = the rest (rarely visible on the plaza level, ~15 %)
 *
 * Pure and renderer-agnostic: no THREE, no store, no React. Without a
 * selection the map is EMPTY — filtering (threat/rule) keeps running through
 * its own `dimmed` path and must never mix with focus dimming.
 */

import type { CityData } from "./types";

export type FocusTier = 0 | 1 | 2 | 3; // 0 selected, 1 direct dependency, 2 same district, 3 rest

/**
 * Compute the focus tier for every rendered file.
 *
 * @param selectedFileId    currently selected file, or null
 * @param files             all files rendered on the current plaza
 * @param fileConnections   CityData edges ({from, to, weight}, file ids)
 * @param districtOf        district key for a file id (the focusPath chain;
 *                          all plaza files of one level share one district)
 * @returns fileId → tier. Empty map when nothing is selected or the
 *          selection is not among the rendered files (e.g. selected on a
 *          different zoom level) — nothing dims in that case.
 */
export function computeFocusTiers(
  selectedFileId: string | null,
  files: Array<{ id: string; path: string }>,
  fileConnections: CityData["fileConnections"],
  districtOf: (fileId: string) => string,
): Map<string, FocusTier> {
  const tiers = new Map<string, FocusTier>();
  if (selectedFileId === null) return tiers;

  const rendered = new Set(files.map((f) => f.id));
  if (!rendered.has(selectedFileId)) return tiers;

  const selectedDistrict = districtOf(selectedFileId);

  for (const f of files) {
    if (f.id === selectedFileId) {
      tiers.set(f.id, 0);
      continue;
    }
    const isDirectDep = fileConnections.some(
      (c) =>
        (c.from === selectedFileId && c.to === f.id) ||
        (c.to === selectedFileId && c.from === f.id),
    );
    if (isDirectDep) {
      tiers.set(f.id, 1);
    } else if (districtOf(f.id) === selectedDistrict) {
      tiers.set(f.id, 2);
    } else {
      tiers.set(f.id, 3);
    }
  }
  return tiers;
}
