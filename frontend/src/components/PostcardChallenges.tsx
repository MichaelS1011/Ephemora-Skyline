/**
 * Postcard Challenges — local photo missions inside the share studio.
 *
 * The studio already owns the image path, so this panel never captures on its
 * own. It derives honest targets from the payload, flies to one, and lets the
 * PNG export above mark the mission. Completion lives in localStorage by scan
 * id; nothing leaves the machine and no score is kept.
 */

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../stores/useStore";
import {
  POSTCARD_CAPTURED_EVENT,
  clearPostcardMarks,
  derivePostcardChallenges,
  loadPostcardMarksRead,
  type PostcardChallengeKind,
  type PostcardMarksRead,
} from "../city/postcardChallenges";
import { postcardText, type PostcardCopyKey } from "./postcardCopy";
import "../design/postcards.css";

const TITLE: Record<PostcardChallengeKind, PostcardCopyKey> = {
  unshielded: "unshielded.title",
  cycle: "cycle.title",
  blast: "blast.title",
  coverage: "coverage.title",
  clone: "clone.title",
  district: "district.title",
};

export function PostcardChallenges() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const analysisId = useStore((s) => s.analysisId);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const selectedId = selectedUnit?.kind === "file" ? selectedUnit.id : null;
  const [marks, setMarks] = useState<PostcardMarksRead>({ state: "absent" });

  const scanId = analysisId ?? cityData?.analysisId ?? null;
  const challenges = useMemo(
    () => (cityData ? derivePostcardChallenges(cityData) : []),
    [cityData],
  );

  useEffect(() => {
    const refresh = (): void => setMarks(loadPostcardMarksRead(scanId ?? undefined));
    refresh();
    window.addEventListener(POSTCARD_CAPTURED_EVENT, refresh);
    return () => window.removeEventListener(POSTCARD_CAPTURED_EVENT, refresh);
  }, [scanId]);

  if (!cityData) return null;

  const captured = marks.state === "read" ? marks.value : {};
  const done = challenges.filter((challenge) => captured[challenge.id]).length;

  return (
    <section className="postcard-challenges" aria-labelledby="postcard-title">
      <header className="postcard-head">
        <h3 id="postcard-title">{postcardText(lang, { key: "section.title" })}</h3>
        {challenges.length > 0 && (
          <span className="postcard-count">
            {postcardText(lang, {
              key: "section.count",
              vars: { done, total: challenges.length },
            })}
          </span>
        )}
      </header>
      <p className="postcard-intro">{postcardText(lang, { key: "section.intro" })}</p>

      {!scanId && <p className="postcard-note">{postcardText(lang, { key: "section.noScan" })}</p>}
      {marks.state === "unreadable" && (
        <p className="postcard-note" role="status">
          {postcardText(lang, { key: "section.unreadable" })}
        </p>
      )}

      {challenges.length === 0 ? (
        <p className="postcard-empty">{postcardText(lang, { key: "section.empty" })}</p>
      ) : (
        <ol className="postcard-list">
          {challenges.map((challenge) => {
            const isCaptured = !!captured[challenge.id];
            const isSelected = selectedId === challenge.target.fileId;
            return (
              <li
                key={challenge.id}
                className={`postcard-mission${isCaptured ? " is-captured" : ""}${isSelected ? " is-selected" : ""}`}
              >
                <div className="postcard-mission-head">
                  <h4>{postcardText(lang, { key: TITLE[challenge.kind] })}</h4>
                  <span className="postcard-state">
                    {postcardText(lang, { key: isCaptured ? "state.captured" : "state.pending" })}
                  </span>
                </div>
                <p className="postcard-target">
                  <span>{postcardText(lang, { key: "target.label" })}</span>{" "}
                  <code>{challenge.target.path}</code>
                </p>
                <p className="postcard-reason">{postcardText(lang, challenge.reason)}</p>
                <p className="postcard-action">{postcardText(lang, challenge.action)}</p>
                {isSelected && !isCaptured && (
                  <p className="postcard-selected" role="status">
                    {postcardText(lang, { key: "state.selected" })}
                  </p>
                )}
                {!isCaptured && (
                  <button
                    type="button"
                    className="postcard-fly"
                    aria-label={postcardText(lang, {
                      key: "action.flyAria",
                      vars: { path: challenge.target.path },
                    })}
                    onClick={() => navigateToFile(challenge.target.fileId)}
                  >
                    {postcardText(lang, { key: "action.fly" })}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {done > 0 && scanId && (
        <button
          type="button"
          className="postcard-clear"
          onClick={() => {
            clearPostcardMarks(scanId);
            setMarks(loadPostcardMarksRead(scanId));
          }}
        >
          {postcardText(lang, { key: "section.clear" })}
        </button>
      )}
    </section>
  );
}
