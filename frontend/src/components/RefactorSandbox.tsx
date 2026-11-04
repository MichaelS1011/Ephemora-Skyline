import { useState } from "react";
import type { CityData, CityFile } from "../city/types";
import {
  DEFAULT_SPLIT_PARTS,
  MAX_SPLIT_PARTS,
  MIN_SPLIT_PARTS,
  clampSplitParts,
  planRefactorSandbox,
  type SandboxAction,
} from "../city/refactorSandbox";
import { useSandboxStore } from "../stores/useSandboxStore";
import { useStore } from "../stores/useStore";
import { formatCount, formatDecimal } from "../i18n";
import { sandboxAssumptionCopy, sandboxCopy } from "./sandboxCopy";
import "../design/refactor.css";

const PART_OPTIONS = Array.from(
  { length: MAX_SPLIT_PARTS - MIN_SPLIT_PARTS + 1 },
  (_, i) => MIN_SPLIT_PARTS + i,
);

/**
 * A compact, read-only learning section for the selected file. The preview it
 * publishes lives in `useSandboxStore`, so a scene component can draw a ghost
 * without this panel reaching into the renderer.
 */
export function RefactorSandbox({ file, cityData }: { file: CityFile; cityData: CityData }) {
  const lang = useStore((s) => s.prefs.lang);
  const stored = useSandboxStore((s) => s.scenario);
  const setScenario = useSandboxStore((s) => s.setScenario);
  const resetStore = useSandboxStore((s) => s.reset);
  const [parts, setParts] = useState(DEFAULT_SPLIT_PARTS);

  const preview = stored && stored.fileId === file.id ? stored : null;
  const activeAction = preview?.action ?? null;
  const shownParts = activeAction === "split" ? preview!.parts : parts;

  const apply = (action: SandboxAction, nextParts: number): void => {
    setScenario(
      planRefactorSandbox(file, action, {
        parts: nextParts,
        connections: cityData.fileConnections,
      }),
    );
  };

  const reset = (): void => {
    resetStore();
    setParts(DEFAULT_SPLIT_PARTS);
  };

  const changeParts = (next: number): void => {
    const clamped = clampSplitParts(next);
    setParts(clamped);
    if (activeAction === "split") apply("split", clamped);
  };

  const metricRow = (label: string, original: string, scenario: string) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{original}</td>
      <td>{scenario}</td>
    </tr>
  );

  return (
    <section className="rs-sandbox" aria-labelledby="refactor-sandbox-title">
      <div className="rs-head">
        <h4 id="refactor-sandbox-title" className="rs-title">
          {sandboxCopy(lang, "title")}
        </h4>
        <span className="rs-badge">{sandboxCopy(lang, "heuristicBadge")}</span>
      </div>
      <p className="rs-heuristic">{sandboxCopy(lang, "heuristic")}</p>

      <div className="rs-actions" role="group" aria-label={sandboxCopy(lang, "chooseAction")}>
        {(["split", "extract", "test"] as const).map((action) => (
          <button
            key={action}
            type="button"
            className="rs-action"
            aria-pressed={activeAction === action}
            onClick={() => apply(action, action === "split" ? shownParts : parts)}
          >
            {sandboxCopy(lang, action)}
          </button>
        ))}
      </div>

      {activeAction === "split" && (
        <label className="rs-parts">
          <span>{sandboxCopy(lang, "parts")}</span>
          <select
            data-sandbox-parts
            value={shownParts}
            onChange={(event) => changeParts(Number(event.target.value))}
          >
            {PART_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="rs-parts-hint">{sandboxCopy(lang, "partsHint")}</span>
        </label>
      )}

      {preview && (
        <div className="rs-preview" data-sandbox-preview>
          <table className="rs-compare">
            <caption className="rs-caption">{sandboxCopy(lang, "comparison")}</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{sandboxCopy(lang, "original")}</th>
                <th scope="col">{sandboxCopy(lang, "scenario")}</th>
              </tr>
            </thead>
            <tbody>
              {metricRow(
                sandboxCopy(lang, "metricHeight"),
                formatDecimal(lang, preview.original.height, 1),
                formatDecimal(lang, preview.scenario.height, 1),
              )}
              {metricRow(
                sandboxCopy(lang, "metricComplexity"),
                formatDecimal(lang, preview.original.complexity, 2),
                formatDecimal(lang, preview.scenario.complexity, 2),
              )}
              {metricRow(
                sandboxCopy(lang, "metricLines"),
                formatCount(lang, preview.original.linesOfCode),
                formatCount(lang, preview.scenario.linesOfCode),
              )}
              {metricRow(
                sandboxCopy(lang, "metricModules"),
                formatCount(lang, preview.original.modules),
                formatCount(lang, preview.scenario.modules),
              )}
            </tbody>
          </table>

          <p className="rs-coupling">
            {sandboxCopy(lang, "importers", {
              count: formatCount(lang, preview.coupling.externalImporters),
            })}
          </p>

          {preview.coverageGoal && (
            <div className="rs-goal" role="note" data-coverage-goal="true">
              <span aria-hidden="true" className="rs-goal-mark">
                ◇
              </span>
              <span>
                <strong>
                  {sandboxCopy(lang, "coverageGoal", {
                    pct: preview.coverageGoal.targetPct,
                  })}
                </strong>
                <span className="rs-goal-note">{sandboxCopy(lang, "goalNotMeasured")}</span>
                <span className="rs-goal-note">{sandboxCopy(lang, "noHeightChange")}</span>
              </span>
            </div>
          )}

          <h5 className="rs-subhead">{sandboxCopy(lang, "assumptions")}</h5>
          <ul className="rs-assumptions">
            {preview.assumptions.map((assumption) => (
              <li key={assumption}>{sandboxAssumptionCopy(lang, assumption)}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="rs-reset" onClick={reset} disabled={!preview}>
        {sandboxCopy(lang, "reset")}
      </button>
    </section>
  );
}
