import { formatCount, t, type Lang } from "../../i18n";
import { progressLine } from "../../config/scanStages";
import type { AnalysisState } from "../useLocalAnalysis";

/**
 * The stage line and the reading counter, split out of `useLocalAnalysis.ts`
 * (K3): one writer builds the line the user sees while the flow runs. The hook
 * owns every state cell and passes them in as `deps`.
 */

type Ref<T> = { current: T };

export interface PublishStageDeps {
  langRef: Ref<Lang>;
  stateRef: Ref<AnalysisState>;
  stageRef: Ref<string | null>;
  waitingRef: Ref<boolean>;
  budgetWaitRef: Ref<number>;
  elapsedRef: Ref<number>;
  setAnalysisStage: (s: string) => void;
}

/**
 * The one writer of the stage line: the server's stage (in the display
 * language), the seconds since the run started, and the read-budget wait when
 * the server has closed the window. Both consumers print it as it is.
 */
export function publishStage(deps: PublishStageDeps): void {
  const l = deps.langRef.current;
  // Nothing uploaded yet and no stage named: the reading counter owns the line
  // (the landing block shows it), and "uploading" would be a lie.
  if (deps.stateRef.current === "picking") return;
  if (!deps.stageRef.current && deps.stateRef.current === "collecting") return;
  const base = deps.stageRef.current
    ? progressLine(l, deps.stageRef.current)
    : t(l, deps.waitingRef.current ? "scan.waiting" : "scan.uploading");
  const parts = [base, t(l, "scan.elapsed", { s: deps.elapsedRef.current })];
  if (deps.budgetWaitRef.current > 0) {
    parts.push(`${t(l, "limit.waiting")} · ${deps.budgetWaitRef.current} s`);
  }
  deps.setAnalysisStage(parts.join(" · "));
}

export interface SetReadingLineDeps {
  l: Lang;
  read: number;
  total: number;
  setAnalysisStage: (s: string) => void;
}

/** The reading counter, in the display language: "150 Dateien gelesen · 150 von 312" */
export function setReadingLine(deps: SetReadingLineDeps): void {
  const parts = [
    t(deps.l, deps.read === 1 ? "scan.readingOne" : "scan.reading", {
      n: formatCount(deps.l, deps.read),
    }),
  ];
  if (deps.total > 0)
    parts.push(
      t(deps.l, "scan.readingOf", {
        n: formatCount(deps.l, deps.read),
        total: formatCount(deps.l, deps.total),
      }),
    );
  deps.setAnalysisStage(parts.join(" · "));
}
