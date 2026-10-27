import type { DictKey } from "../i18n";
import type { HeatChannel } from "../stores/useStore";

/**
 * What the height of the field MEANS right now — the one source the legends
 * read, so no legend can name a measure the field does not draw with.
 *
 * Up close every tower stands at complexity height (city/mapping's
 * heightForComplexity), whatever channel the heat toggle happens to hold.
 * At far zoom the buildings collapse into the heat grid (CityTree mounts
 * HeatCells exactly there), and `HeatCells.heatCellRise` re-raises each cell
 * by the picked channel: findings for threat, the churn score for churn, the
 * stood-share at the slider's date for time. The CX channel keeps the
 * complexity sentence — same measure, same words.
 *
 * Before this function the legends ("Height = complexity" in the world mast,
 * the HUD key and the project card) printed the constant while the TIME
 * channel drew height after "stood already / not yet" — a panel showing one
 * quantity and naming another (handoff 2026-10-27T103430, befund_3).
 * Pinned by tests/heat-axis-legend.test.tsx.
 */
export function heightAxisKey(heatGridShown: boolean, channel: HeatChannel): DictKey {
  if (!heatGridShown) return "hud.heightComplexity";
  switch (channel) {
    case "threat":
      return "hud.axisThreat";
    case "churn":
      return "hud.axisChurn";
    case "time":
      return "hud.axisTime";
    case "complexity":
      return "hud.heightComplexity";
  }
}
