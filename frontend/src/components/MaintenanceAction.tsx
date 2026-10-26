import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { findFileById, getDirLayout } from "../city/layout";
import { maintenanceClaimFor, type MaintenanceClaim } from "../city/epheRoles";
import { prefersReducedMotion } from "../city/motion";
import { formatCount, plural, t } from "../i18n";
import "../design/city-funktion.css";

/**
 * 005-B12 — the Maintenance resident's errand: one metric, `cx`.
 *
 * The brief asked for exactly one existing metric rather than a role system, so
 * this block answers the one question the number already on the card raises —
 * what it counts and what it does to the shape in front of the reader — and
 * nothing else. Every figure in the sentence is read off `CityFile` and
 * `city/mapping.ts`: the decision count is that metric's own definition (1 +
 * one per decision point), the share is the weight table times the same factor
 * the renderer uses. Refactoring advice would be an opinion the payload does
 * not carry, so there is none here.
 *
 * The errand is refused rather than faked: a data file carries `cx` 1 by
 * construction, a file with no branches has nothing to point at, and a level
 * that does not draw the building has nowhere to walk.
 */
export function MaintenanceAction() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const selected = useStore((s) => s.selectedUnit);
  const guide = useStore((s) => s.guide);
  const guidePhase = useStore((s) => s.guidePhase);
  const startGuide = useStore((s) => s.startGuide);
  const cancelGuide = useStore((s) => s.cancelGuide);
  const [refused, setRefused] = useState(false);
  /** The selection is real but this level draws no building for it. */
  const [notDrawn, setNotDrawn] = useState(false);
  /** Reduced motion: the sentence is delivered without a walk. */
  const [shown, setShown] = useState<MaintenanceClaim | null>(null);
  const lastSelection = useRef<string | null>(null);

  const selectedId = selected?.kind === "file" ? selected.id : null;
  const hit = useMemo(
    () => (cityData && selectedId ? findFileById(cityData, selectedId) : null),
    [cityData, selectedId],
  );
  const claim = hit ? maintenanceClaimFor(hit.file) : null;

  // A new selection is a new building: both the errand and the sentence that
  // stood under it belong to the file the reader was looking at.
  useEffect(() => {
    if (
      lastSelection.current !== null &&
      lastSelection.current !== selectedId &&
      useStore.getState().guide?.role === "maintenance"
    )
      cancelGuide();
    lastSelection.current = selectedId;
    setShown(null);
    setRefused(false);
    setNotDrawn(false);
  }, [selectedId, cancelGuide]);

  // Escape means what it means everywhere else in the city. Scoped to this
  // role: the Explorer's own panel already answers for its errand.
  useEffect(() => {
    if (guide?.role !== "maintenance") return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      cancelGuide();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [guide, cancelGuide]);

  const mine = guide?.role === "maintenance" ? guide : null;
  const active = mine && hit && mine.targetFileId === hit.file.id ? mine : null;
  // B08 held to the letter: nothing is explained while the figure is still on
  // its way. The panel says "walking" until the arrival lands, and only then
  // the sentence — the same order the Explorer kept.
  const spoken = (active && guidePhase === "arrived" ? active.claim : null) ?? shown;
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  // The dossier is a scrolling column and the sentence lands at its bottom:
  // measured on the demo city, the arrival line sat below the fold, so the
  // reader saw the resident point at nothing they could read about. Bringing
  // it into view is the difference between an answer and a hidden answer.
  useEffect(() => {
    if (!spoken) return;
    statusRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [spoken]);

  if (!cityData || !hit || !claim) return null;

  const send = (): void => {
    if (active) {
      cancelGuide();
      return;
    }
    // Where the building stands on the level the camera has reached — the same
    // layout the renderer draws from, so the resident is sent to a building the
    // reader can see rather than to the coordinates one zoom level away have
    // for it. Asking the file's own directory instead would answer even when
    // this level shows the plot as a district block, and the figure would point
    // at a tower that is not on screen.
    const placement = getDirLayout(cityData, focusPath).buildings.find(
      (b) => b.file.id === hit.file.id,
    );
    if (!placement) {
      setNotDrawn(true);
      return;
    }
    if (prefersReducedMotion()) {
      setShown(claim);
      return;
    }
    setRefused(false);
    // Frontage, not plot centre: the same rule the Explorer and the Security
    // figure arrived at, because a guide that walks into its own tower ends up
    // behind it.
    startGuide({
      role: "maintenance",
      targetFileId: hit.file.id,
      x: placement.x,
      z: placement.z + placement.d / 2 + 0.8,
      claim,
    });
    // The figure can be mid-ride, in a doorway, or the crowd too small to carry
    // the role. All three read the same to the reader, so the panel says only
    // what it knows: the errand did not start.
    if (useStore.getState().guide === null) setRefused(true);
  };

  return (
    <section className="cf-guide">
      <p className="cf-guide-lead">{t(lang, "guide.maint.lead")}</p>
      <button
        type="button"
        className="cf-guide-file"
        aria-pressed={active !== null}
        onClick={send}
        title={claim.path}
      >
        {active
          ? t(lang, guidePhase === "arrived" ? "guide.stop" : "guide.cancel")
          : t(lang, "guide.maint.ask")}
      </button>
      {active && guidePhase !== "arrived" && (
        <p className="cf-guide-status">{t(lang, "guide.maint.walking", { file: hit.file.name })}</p>
      )}
      {refused && !active && <p className="cf-guide-refused">{t(lang, "guide.maint.busy")}</p>}
      {notDrawn && !active && (
        // Two different noths: the relation and the metric are real, only this
        // level draws no building to stand in front of.
        <p className="cf-guide-refused">{t(lang, "guide.maint.notDrawn")}</p>
      )}
      {spoken && (
        <p ref={statusRef} className="cf-guide-status" role="status" aria-live="polite">
          {t(lang, "guide.maint.claim", {
            cx: formatCount(lang, spoken.cyclomatic),
            name: spoken.name,
            points: plural(
              lang,
              spoken.decisions,
              lang === "de" ? "Entscheidungspunkt" : "decision point",
              lang === "de" ? "Entscheidungspunkte" : "decision points",
            ),
          })}{" "}
          {spoken.saturated
            ? t(lang, "guide.maint.saturated", {
                sat: formatCount(lang, spoken.saturatesAt),
              })
            : t(lang, "guide.maint.share", {
                share: formatCount(lang, spoken.heightSharePercent),
                sat: formatCount(lang, spoken.saturatesAt),
              })}
        </p>
      )}
      {spoken && <p className="cf-guide-more">{t(lang, "guide.maint.caveat")}</p>}
      {shown && <p className="cf-guide-more">{t(lang, "guide.maint.reduced")}</p>}
    </section>
  );
}
