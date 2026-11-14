import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { t, type DictKey } from "../i18n";
import {
  challengeFetchUrl,
  challengeProgressPercent,
  parseChallengeResponse,
  shouldFetchChallenge,
  type ChallengeView,
} from "../findings/challengePanel";
import "../design/challenge.css";

/**
 * The classroom scoreboard, mounted.
 *
 * When the scanned folder is an exercise the backend grades it (see
 * `backend/src/server/routes/challenge.ts`), this card prints the grade: the
 * exercise title, a level chip, found/total, points, and one line per item —
 * a tick for the found ones, hint and points for the ones still missing. It
 * reads nothing else: an item nobody found keeps its path, line and type
 * behind the API boundary, and this file could not print them if it wanted to.
 *
 * Every reading rule — what counts as a scoreboard, what the bar means, when
 * to ask again — lives in `findings/challengePanel.ts` and is guarded there;
 * this component only seats it in the dock, silent until the answer arrives.
 */

/** Unknown levels print raw — a chip must not invent a school system. */
const LEVEL_LABEL: Record<string, DictKey> = {
  sek1: "challenge.level.sek1",
  sek2: "challenge.level.sek2",
  uni: "challenge.level.uni",
};

export function ChallengePanel() {
  const lang = useStore((s) => s.prefs.lang);
  const analysisId = useStore((s) => s.cityData?.analysisId ?? null);
  const [view, setView] = useState<ChallengeView | null>(null);
  // A ref, not state: the id we asked for is bookkeeping for the fetch, and
  // making it a dep of its own effect would cancel the fetch it just sent.
  const fetchedForRef = useRef<string | null>(null);

  // One request per stored scan. A re-scan mints a new id and re-asks; a
  // folder that is no exercise answers 404 and the card stays absent.
  useEffect(() => {
    if (!shouldFetchChallenge(analysisId, fetchedForRef.current)) return;
    let cancelled = false;
    fetchedForRef.current = analysisId;
    setView(null);
    void (async () => {
      if (analysisId === null) return;
      try {
        const res = await fetch(challengeFetchUrl(analysisId), {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const parsed = parseChallengeResponse(await res.json());
        if (!cancelled) setView(parsed);
      } catch {
        // Unreachable backend: no card, no claim — same silence as a 404.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  if (view === null) return null;

  const percent = challengeProgressPercent(view);
  const levelKey = LEVEL_LABEL[view.exercise.level];

  return (
    <section className="cf-challenge" aria-label={t(lang, "challenge.heading")}>
      <h3 className="cf-challenge-heading">
        {view.exercise.title[lang]}
        <span className="cf-challenge-level">
          {levelKey ? t(lang, levelKey) : view.exercise.level}
        </span>
      </h3>
      <p className="cf-challenge-score">
        {t(lang, "challenge.score", {
          found: view.foundCount,
          total: view.totalCount,
        })}
      </p>
      <p className="cf-challenge-points">
        {t(lang, "challenge.points", {
          earned: view.pointsEarned,
          total: view.pointsTotal,
        })}
      </p>
      <div
        className="cf-challenge-bar"
        role="progressbar"
        aria-label={t(lang, "challenge.progressAria")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="cf-challenge-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <ul className="cf-challenge-list">
        {view.items.map((item) => (
          <li
            key={item.id}
            className="cf-challenge-item"
            data-found={item.found || undefined}
            aria-label={
              item.found
                ? t(lang, "challenge.foundAria", { id: item.id, points: item.points })
                : t(lang, "challenge.missingAria", {
                    id: item.id,
                    points: item.points,
                    hint: item.hint[lang],
                  })
            }
          >
            <span aria-hidden="true" className="cf-challenge-mark">
              {item.found ? "✓" : "·"}
            </span>
            <span className="cf-challenge-item-id">{item.id}</span>
            <span className="cf-challenge-item-points">{item.points}</span>
            {!item.found && (
              <span className="cf-challenge-hint">
                {item.hint[lang]}
                <span className="cf-challenge-category">{item.categoryHint}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {view.finished && <p className="cf-challenge-finished">{t(lang, "challenge.finished")}</p>}
    </section>
  );
}
