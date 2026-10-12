import type { CityData } from "./types";

/** Open a large world at its first branching level rather than a single
 * wrapper district. Never hide files that actually live at a skipped level.
 * The breadcrumb keeps every skipped directory reachable. */
export function defaultOverviewPath(city: CityData): string[] {
  if (city.totalFiles < 200) return [];
  let dir = city.tree;
  const chain: string[] = [];
  while (dir.children.length === 1 && dir.detailFiles.length === 0 && dir.remainingFiles === 0) {
    dir = dir.children[0]!;
    chain.push(dir.name);
  }
  return dir.children.length > 1 ? chain : [];
}
