import type { ArrivalStage } from "../firstArrival";
import { t, type DictKey, type Lang } from "../i18n";

/**
 * MASTER-2027 §03.06 — a visible progress of the setup.
 *
 * The first arrival has two real beats (§03.03 greeting, §03.05 introduction).
 * This says where the reader stands in them — a filled mark for what is done, a
 * ring for where they are — so the setup is not a screen that changes with no
 * explanation. It is deliberately calm: no percentage, no countdown, nothing
 * that presses.
 *
 * §03.07 gives it one way out, and the Erste Reise round (2026-10-28) gave that
 * way out the word for what it ends: a bare "Skip" over a sequence that never
 * said its length read as "there is nothing here".
 *
 * #30 put a third entry in this row — the folder action, in the button's own
 * words. Measured on the first beat, that row was then four prompts wide (three
 * entries and the Skip), one of them a name for a control that is not on the
 * screen and will not be for two more clicks, and two of them the beat's own
 * title printed again 117 px above the card that is titled with it. The marks
 * stay — they are the progress — but they stop borrowing words: each beat is
 * named once, on the card, and this row says how far the reader has to go.
 * The beat names and their state words remain the accessible name of each mark,
 * so a reader who cannot see the row still hears "Welcome — now".
 */

interface Mark {
  readonly labelKey: DictKey;
  readonly stage: ArrivalStage;
}

/** The beats the sequence actually has. "Create an Ephe" (§04) is not one of
 *  them, and the folder choice is an action, not a beat: it arrives with the
 *  plain landing, two clicks later. */
const MARKS: readonly Mark[] = [
  { labelKey: "landing.arrivalStepWelcome", stage: "welcome" },
  { labelKey: "landing.arrivalStepGuide", stage: "intro" },
];

function stateOf(stage: ArrivalStage, mark: Mark, lang: Lang): { state: string; word: string } {
  const here = MARKS.findIndex((m) => m.stage === stage);
  const mine = MARKS.findIndex((m) => m.stage === mark.stage);
  if (mine < here) return { state: "done", word: t(lang, "landing.arrivalDone") };
  if (mine === here) return { state: "current", word: t(lang, "landing.arrivalCurrent") };
  return { state: "todo", word: t(lang, "landing.arrivalTodo") };
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
  const here = MARKS.findIndex((m) => m.stage === stage) + 1;
  return (
    <nav className="start-progress-steps" aria-label={t(lang, "landing.arrivalAria")}>
      <ol>
        {MARKS.map((m) => {
          const s = stateOf(stage, m, lang);
          return (
            <li
              key={m.labelKey}
              data-state={s.state}
              aria-current={s.state === "current" ? "step" : undefined}
              aria-label={`${t(lang, m.labelKey)} — ${s.word}`}
            >
              <span aria-hidden="true" className="start-progress-dot" />
            </li>
          );
        })}
      </ol>
      {/* The length, said once, in the reader's own frame: how many screens of
          introduction are left. `landing.arrivalAria` names the row beside it. */}
      <p className="start-progress-position">
        {t(lang, "landing.arrivalAria")}
        <span aria-hidden="true"> · </span>
        {t(lang, "landing.arrivalPosition", { i: here, n: MARKS.length })}
      </p>
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
