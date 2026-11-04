/**
 * City Time Machine — earlier scans of the same folder, compared honestly.
 *
 * The local recent-cities index names the eras. The payload of an era is
 * fetched only when it is selected, through the same local API the city
 * arrived from. A missing answer is said out loud; nothing is interpolated.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { recentCities, recentCitiesRead, type RecentCity } from "../recentCities";
import { buildCityHistory, diffCities, signed, type CityDiff } from "../city/cityHistory";
import type { CityData } from "../city/types";
import { timeMachineText } from "./timeMachineCopy";
import type { Lang } from "../i18n";
import { OPEN_TIME_MACHINE_EVENT } from "./timeMachineBus";
import "../design/timeMachine.css";

type EraState =
  { state: "loading" } | { state: "ready"; city: CityData } | { state: "unavailable" };

function diffRows(lang: Lang, diff: CityDiff) {
  const rows: Array<{ key: "files" | "lines" | "rendered" | "p0" | "p1" | "p2"; value: number }> = [
    { key: "files", value: diff.files },
    { key: "lines", value: diff.lines },
    { key: "rendered", value: diff.renderedFiles },
    { key: "p0", value: diff.P0 },
    { key: "p1", value: diff.P1 },
    { key: "p2", value: diff.P2 },
  ];
  return rows.map((row) => ({
    label: timeMachineText(lang, { key: `metric.${row.key}` }),
    value: signed(row.value),
    raw: row.value,
  }));
}

export interface TimeMachineProps {
  currentId: string | null;
  onOpenCity: (cityId: string) => void;
}

export function TimeMachine({ currentId, onOpenCity }: TimeMachineProps) {
  const lang = useStore((s) => s.prefs.lang);
  const currentCity = useStore((s) => s.cityData);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RecentCity[]>([]);
  const [indexUnreadable, setIndexUnreadable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eras, setEras] = useState<Record<string, EraState>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const onOpen = (): void => {
      const read = recentCitiesRead();
      setIndexUnreadable(read.state === "unreadable");
      setEntries(recentCities());
      setSelectedId(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_TIME_MACHINE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TIME_MACHINE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const history = useMemo(() => buildCityHistory(entries, currentId), [entries, currentId]);
  const currentEra = history.find((era) => era.isCurrent) ?? null;
  const selectedEra = history.find((era) => era.id === selectedId) ?? null;
  const selectedState = selectedId ? eras[selectedId] : undefined;

  useEffect(() => {
    if (!open || !selectedId || selectedId === currentId || eras[selectedId]) return;
    const job = ++requestRef.current;
    const controller = new AbortController();
    setEras((prev) => ({ ...prev, [selectedId]: { state: "loading" } }));
    void (async () => {
      try {
        const response = await fetch(`/api/result/${encodeURIComponent(selectedId)}/city`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const city = (await response.json()) as CityData;
        if (job !== requestRef.current) return;
        setEras((prev) => ({ ...prev, [selectedId]: { state: "ready", city } }));
      } catch {
        if (controller.signal.aborted || job !== requestRef.current) return;
        setEras((prev) => ({ ...prev, [selectedId]: { state: "unavailable" } }));
      }
    })();
    return () => controller.abort();
  }, [open, selectedId, currentId]);

  if (!open) return null;

  const when = (ms: number): string =>
    new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));

  const close = (): void => {
    setOpen(false);
    document.getElementById("city-more-button")?.focus();
  };

  const choose = (id: string): void => {
    setOpen(false);
    onOpenCity(id);
  };

  const diff =
    selectedState?.state === "ready" && currentCity
      ? diffCities(currentCity, selectedState.city)
      : null;

  return (
    <div
      ref={panelRef}
      className="panel-time-machine"
      role="dialog"
      aria-modal="false"
      aria-labelledby="time-machine-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close();
      }}
    >
      <header className="tm-head">
        <h2 id="time-machine-title">{timeMachineText(lang, { key: "title" })}</h2>
        <button
          type="button"
          className="tm-close"
          onClick={close}
          aria-label={timeMachineText(lang, { key: "close" })}
        >
          ×
        </button>
      </header>
      <p className="tm-intro">{timeMachineText(lang, { key: "intro" })}</p>

      {indexUnreadable && (
        <p className="tm-note" role="status">
          {timeMachineText(lang, { key: "unreadableIndex" })}
        </p>
      )}

      {history.length === 0 ? (
        <p className="tm-empty">
          {timeMachineText(lang, { key: currentId ? "empty" : "noFolder" })}
        </p>
      ) : (
        <>
          <ol className="tm-eras">
            {history.map((era) => (
              <li key={era.id}>
                <button
                  type="button"
                  className={`tm-era${era.isCurrent ? " is-current" : ""}${era.id === selectedId ? " is-selected" : ""}`}
                  aria-pressed={era.id === selectedId}
                  onClick={() => {
                    if (era.isCurrent) {
                      choose(era.id);
                      return;
                    }
                    setSelectedId(era.id);
                  }}
                >
                  <span className="tm-era-when">
                    {timeMachineText(lang, {
                      key: "era",
                      vars: { when: when(era.openedAt) },
                    })}
                  </span>
                  <span className="tm-era-meta">
                    {era.files} · {era.findings}
                    {era.isCurrent && (
                      <span className="tm-current">
                        {timeMachineText(lang, { key: "current" })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {currentEra && (
            <button type="button" className="tm-return" onClick={() => choose(currentEra.id)}>
              ↩ {timeMachineText(lang, { key: "return" })}
            </button>
          )}

          {selectedEra && !selectedEra.isCurrent && selectedState?.state === "loading" && (
            <p className="tm-note" role="status">
              {timeMachineText(lang, { key: "loading" })}
            </p>
          )}

          {selectedEra && !selectedEra.isCurrent && selectedState?.state === "unavailable" && (
            <div className="tm-unavailable" role="status">
              <h3>{timeMachineText(lang, { key: "expiredTitle" })}</h3>
              <p>{timeMachineText(lang, { key: "unavailable" })}</p>
            </div>
          )}

          {diff && (
            <section className="tm-diff" aria-labelledby="tm-diff-title">
              <h3 id="tm-diff-title">{timeMachineText(lang, { key: "diffTitle" })}</h3>
              <p>{timeMachineText(lang, { key: "diffHint" })}</p>
              <dl>
                {diffRows(lang, diff).map((row) => (
                  <div
                    key={row.label}
                    className={row.raw === 0 ? "is-flat" : row.raw > 0 ? "is-up" : "is-down"}
                  >
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  );
}
