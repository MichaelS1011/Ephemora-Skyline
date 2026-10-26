import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { findFileById, getDirLayout, allFiles } from "../city/layout";
import { frontageTowards, guideClaimFor, type GuideClaim } from "../city/epheRoles";
import { prefersReducedMotion } from "../city/motion";
import { formatCount, t } from "../i18n";
import "../design/city-funktion.css";

/** How many neighbours the panel offers a walk to. Beyond this the list is a
 *  wall, and the impact block already names every one of them. */
const CANDIDATES_MAX = 5;

/**
 * 005-B — the Explorer's errand, asked for from the file dossier.
 *
 * The resident is not a chat window: it has no text of its own. What it can do
 * is walk a real route to a real building and point at it, and the one sentence
 * it speaks is assembled from the edge that joins the two files. No edge, no
 * errand — the button does not appear.
 */
export function GuideAction() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const selected = useStore((s) => s.selectedUnit);
  const guide = useStore((s) => s.guide);
  const guidePhase = useStore((s) => s.guidePhase);
  const startGuide = useStore((s) => s.startGuide);
  const cancelGuide = useStore((s) => s.cancelGuide);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const [refused, setRefused] = useState(false);
  const lastSelection = useRef<string | null>(null);

  const selectedId = selected?.kind === "file" ? selected.id : null;

  /** Every file the selection is joined to by a real edge, drawn or not. */
  const joined = useMemo(() => {
    if (!cityData || !selectedId)
      return [] as Array<{ id: string; path: string; claim: GuideClaim }>;
    const paths = new Map<string, string>(
      allFiles(cityData).map(({ file }) => [file.id, file.path]),
    );
    const seen = new Set<string>();
    const out: Array<{ id: string; path: string; claim: GuideClaim }> = [];
    for (const edge of cityData.fileConnections) {
      const other: string | null =
        edge.from === selectedId ? edge.to : edge.to === selectedId ? edge.from : null;
      if (!other || other === selectedId || seen.has(other)) continue;
      const claim = guideClaimFor(cityData.fileConnections, paths, selectedId, other);
      const path = paths.get(other);
      if (!claim || !path) continue;
      seen.add(other);
      out.push({ id: other, path, claim });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }, [cityData, selectedId]);

  /** Of those, the ones this level draws — the ones a resident can walk to. */
  const candidates = useMemo(() => {
    if (!cityData) return joined;
    const drawn = new Set(getDirLayout(cityData, focusPath).buildings.map((b) => b.file.id));
    return joined.filter((c) => drawn.has(c.id));
  }, [joined, cityData, focusPath]);

  // A new selection is a different question: the errand ends rather than
  // following the reader to a building they never asked about. Only the reader's
  // own errand — the Security guide is driven by the tour, and the tour changes
  // the selection on every step, so cancelling on that would end the tour's own
  // guide the moment it started.
  useEffect(() => {
    if (
      lastSelection.current !== null &&
      lastSelection.current !== selectedId &&
      useStore.getState().guide?.role === "explorer"
    )
      cancelGuide();
    lastSelection.current = selectedId;
  }, [selectedId, cancelGuide]);

  // Escape means what it means everywhere else in the city.
  useEffect(() => {
    if (!guide) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      cancelGuide();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [guide, cancelGuide]);

  if (!cityData || !selectedId || joined.length === 0) return null;

  const shown = candidates.slice(0, CANDIDATES_MAX);
  // Only the reader's own errand is this panel's business; the Security guide
  // belongs to the tour and reports through the tour's own panel.
  const mine = guide?.role === "explorer" ? guide : null;
  const active = selectedId ? (mine?.targetFileId ?? null) : null;

  const send = (targetId: string, claim: GuideClaim): void => {
    if (guide?.targetFileId === targetId) {
      cancelGuide();
      return;
    }
    const hit = findFileById(cityData, targetId);
    if (!hit) return;
    const placement = getDirLayout(cityData, hit.chain).buildings.find(
      (b) => b.file.id === targetId,
    );
    if (!placement) return; // drawn on this level was decided above; re-checked, not assumed
    // Aim at the frontage, not the centre — and at the frontage the reader can
    // SEE (§07.11): the side turned towards the camera. The old fixed +z side
    // moved the point outside the footprint but not in front of the tower, and
    // a guide measured behind its own wall arrived, pointed and looked around
    // with not one pixel of it on the plate.
    const kamera = useStore.getState().cameraInfo;
    const aim = frontageTowards(placement, kamera.x, kamera.z);
    // Reduced motion is not a suggestion: a walk the reader cannot watch is a
    // walk that did not happen. The camera goes instead, through the same door
    // search and triage use, and the sentence still arrives from the edge.
    if (prefersReducedMotion()) {
      navigateToFile(targetId);
      return;
    }
    setRefused(false);
    startGuide({ role: "explorer", targetFileId: targetId, claim, ...aim });
    // The Explorer can be mid-ride or mid-rise; then it refuses the errand and
    // says so, instead of teleporting to look as if it had walked.
    if (useStore.getState().guide === null) setRefused(true);
  };

  const line = (claim: GuideClaim): string =>
    t(lang, "guide.claim", {
      importer: claim.importerPath.split("/").pop() ?? claim.importerPath,
      imported: claim.importedPath.split("/").pop() ?? claim.importedPath,
    });

  return (
    <section className="cf-guide">
      <p className="cf-guide-lead">{t(lang, "guide.lead")}</p>
      <ul className="cf-guide-list">
        {shown.map((c) => {
          const on = active === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                className="cf-guide-file"
                aria-pressed={on}
                onClick={() => send(c.id, c.claim)}
                title={c.path}
              >
                {on
                  ? t(lang, guidePhase === "arrived" ? "guide.stop" : "guide.cancel")
                  : t(lang, "guide.ask")}{" "}
                {c.path.split("/").pop()}
              </button>
            </li>
          );
        })}
      </ul>
      {candidates.length > shown.length && (
        <p className="cf-guide-more">
          {t(lang, "guide.more", { count: formatCount(lang, candidates.length - shown.length) })}
        </p>
      )}
      {candidates.length === 0 && (
        // The relation is real; only the walk is impossible. Saying which of
        // the two it is keeps a display limit from reading as a missing edge.
        <p className="cf-guide-refused">{t(lang, "guide.notDrawn")}</p>
      )}
      {refused && <p className="cf-guide-refused">{t(lang, "guide.busy")}</p>}
      {active && mine && (
        <p className="cf-guide-status" role="status" aria-live="polite">
          {guidePhase === "arrived"
            ? line(mine.claim)
            : t(lang, "guide.walking", { file: activeName(cityData, active) })}
        </p>
      )}
    </section>
  );
}

/** The name the walking notice shows — from the city, never from the caller. */
function activeName(cityData: Parameters<typeof allFiles>[0], id: string): string {
  const hit = findFileById(cityData, id);
  return hit ? hit.file.name : id;
}
