import type { ArrivalStage } from "../firstArrival";
import { t, type DictKey, type Lang } from "../i18n";

/**
 * MASTER-2027 §03.06 — a visible progress of the setup.
 *
 * The first arrival has two real beats (§03.03 greeting, §03.05 introduction).
 * This says where the reader stands in them — a filled mark for what is done, a
 * ring for where they are — so the setup is not a screen that changes with no
 * explanation. It is deliberately calm: no percentage, no countdown, nothing
 * that presses. And it is honest: it lists only steps that actually exist.
 * "Create an Ephe" and "choose a project" are NOT shown as steps yet, because
 * the first is §04 and the second leaves this screen entirely — a progress bar
 * that counts a step nobody can take is the false progress §22 forbids. When
 * §04 lands, its step joins this list as a real, observable one.
 *
 * It is shown only while the guided beats are on screen; once the reader is in
 * the landing the guide is over and the marks would only nag.
 */

interface Step {
  readonly labelKey: DictKey;
  readonly done: boolean;
  readonly current: boolean;
}

function stepsFor(stage: ArrivalStage): Step[] {
  return [
    {
      labelKey: "landing.arrivalStepWelcome",
      done: stage !== "welcome",
      current: stage === "welcome",
    },
    { labelKey: "landing.arrivalStepGuide", done: false, current: stage === "intro" },
  ];
}

export function ArrivalProgress({
  lang,
  stage,
  onSkip,
}: {
  lang: Lang;
  stage: ArrivalStage;
  onSkip?: () => void;
}) {
  const steps = stepsFor(stage);
  return (
    <nav className="start-progress-steps" aria-label={t(lang, "landing.arrivalAria")}>
      <ol>
        {steps.map((s) => (
          <li
            key={s.labelKey}
            data-state={s.done ? "done" : s.current ? "current" : "todo"}
            aria-current={s.current ? "step" : undefined}
            aria-label={`${t(lang, s.labelKey)} — ${t(
              lang,
              s.done
                ? "landing.arrivalDone"
                : s.current
                  ? "landing.arrivalCurrent"
                  : "landing.arrivalTodo",
            )}`}
          >
            <span aria-hidden="true" className="start-progress-dot" />
            {t(lang, s.labelKey)}
          </li>
        ))}
      </ol>
      <span className="start-progress-next">{t(lang, "landing.arrivalNext")}</span>
      {/* §03.07 — one Skip for the whole introduction, on the sequence's own
          chrome rather than repeated inside each card. The welcome keeps its
          single decision (§03.03); the escape hatch belongs to the guide, not
          to any one step. */}
      {onSkip && (
        <button type="button" className="start-progress-skip" onClick={onSkip}>
          {t(lang, "landing.arrivalSkip")}
        </button>
      )}
    </nav>
  );
}
