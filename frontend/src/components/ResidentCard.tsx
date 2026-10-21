import { useEffect, useMemo, useRef } from "react";
import { useStore, triageList, nextOpenTriageIndex } from "../stores/useStore";
import { findFileById, getDirLayout } from "../city/layout";
import { t } from "../i18n";
import "../design/stadt-ui.css";

/**
 * The one thing the reader can ask a resident: show me the highest open risk.
 *
 * The card is deliberately not a chat. It knows the current city's triage
 * order, points the resident at that building, then lets the existing camera
 * flight open the file. The resident never invents a finding, never writes a
 * verdict, and the card disappears the moment the city is left.
 */
export function ResidentCard() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const reviews = useStore((s) => s.reviews);
  const selected = useStore((s) => s.selectedResident);
  const selectResident = useStore((s) => s.selectResident);
  const pointResidentAt = useStore((s) => s.pointResidentAt);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);

  const list = useMemo(() => (cityData ? triageList(cityData, "all", null) : []), [cityData]);
  const openIndex = cityData ? nextOpenTriageIndex(list, reviews, 0, 1) : -1;
  const target = openIndex >= 0 ? list[openIndex] : undefined;
  const finding = target?.file.findings[target.index];

  const building = useMemo(() => {
    if (!cityData || !target) return null;
    const hit = findFileById(cityData, target.file.id);
    if (!hit) return null;
    return (
      getDirLayout(cityData, hit.chain).buildings.find((b) => b.file.id === target.file.id) ?? null
    );
  }, [cityData, target]);

  useEffect(() => {
    (target ? primaryRef.current : closeRef.current)?.focus();
  }, [selected, target]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (selected === null) return null;

  const close = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    selectResident(null);
    document.querySelector<HTMLElement>(".city-canvas")?.focus();
  };

  const guide = (): void => {
    if (!target || !finding || timerRef.current !== null) return;
    // The resident turns first; the camera leaves after a short beat so the
    // reader sees who pointed the way.
    if (building) pointResidentAt(building.x, building.z, Date.now() + 1400);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      navigateToFile(target.file.id);
      selectResident(null);
      document.querySelector<HTMLElement>(".city-canvas")?.focus();
    }, 1400);
  };

  return (
    <div className="resident-card" role="region" aria-label={t(lang, "resident.region")}>
      <div className="resident-card-head">
        <span className="resident-kicker">{t(lang, "resident.kicker")}</span>
        <button
          ref={closeRef}
          type="button"
          className="resident-close"
          onClick={close}
          aria-label={t(lang, "resident.close")}
          title={t(lang, "resident.close")}
        >
          ✕
        </button>
      </div>
      <p className="resident-title">{t(lang, "resident.title")}</p>
      {target && finding ? (
        <p className="resident-target" title={`${target.file.path}:${finding.line}`}>
          {t(lang, "resident.highest")} · {target.file.path}:{finding.line}
        </p>
      ) : (
        <p className="resident-target">{t(lang, "resident.allReviewed")}</p>
      )}
      <button
        ref={primaryRef}
        type="button"
        className="resident-action"
        onClick={guide}
        disabled={!target || !finding}
      >
        {t(lang, "resident.risk")}
      </button>
    </div>
  );
}
