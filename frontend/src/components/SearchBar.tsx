import { useRef, useState, useEffect, useCallback, useId } from "react";
import { useStore } from "../stores/useStore";
import { searchFiles, searchFindings } from "../city/layout";
import { languageColor, severityColor, threatColor } from "../city/palette";
import type { CityFile, CityFinding, Severity } from "../city/types";
import { findingKey } from "../reviews";
import { formatCount, t, type DictKey } from "../i18n";
import { FindingGermanLine } from "./InfoPanel";

/** Severity → the word the header and the list use, so one grade reads the same everywhere. */
const SEVERITY_LABEL_KEY: Record<Severity, DictKey> = {
  P0: "hud.sevCritical",
  P1: "hud.sevHigh",
  P2: "hud.sevMedium",
};

/** One entry of the flat, keyboard-navigable option list. */
type FlatHit =
  | { kind: "file"; file: CityFile; optionId: string }
  | {
      kind: "finding";
      file: CityFile;
      finding: CityFinding;
      index: number;
      optionId: string;
    };

export function SearchBar() {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const cityData = useStore((s) => s.cityData);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const setFocusedFindingKey = useStore((s) => s.setFocusedFindingKey);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchId = useId();
  const resultsId = `${searchId}-results`;
  const statusId = `${searchId}-status`;
  const query = value.trim();
  const fileHits = cityData ? searchFiles(cityData, value, 8) : [];
  // Findings only add options once there is something to search for
  const findingHits = cityData && query ? searchFindings(cityData, query, 5) : [];
  // Flat option list: files first (unchanged indices), findings after —
  // arrows walk across both groups, activedescendant stays gapless
  const flatHits: FlatHit[] = [
    ...fileHits.map(({ file }, i): FlatHit => ({
      kind: "file",
      file,
      optionId: `${searchId}-option-${i}`,
    })),
    ...findingHits.map((hit, i): FlatHit => ({
      kind: "finding",
      file: hit.file,
      finding: hit.finding,
      index: hit.index,
      optionId: `${searchId}-finding-${i}`,
    })),
  ];
  const activeHit = open ? flatHits[activeIdx] : undefined;
  const activeOptionId = activeHit?.optionId;

  /* Close on outside click */
  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, []);

  /* Reset active index on new results */
  useEffect(() => {
    setActiveIdx(0);
  }, [value, cityData]);

  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeOptionId]);

  const closeAndReset = useCallback((): void => {
    inputRef.current?.focus();
    setOpen(false);
    setValue("");
  }, []);

  const handleSelect = useCallback(
    (fileId: string): void => {
      navigateToFile(fileId);
      closeAndReset();
    },
    [navigateToFile, closeAndReset],
  );

  // V3 contract: the key uses the index in the file's FULL findings list,
  // so the camera flight, source auto-load and pulsing voxel take over.
  const handleFindingSelect = useCallback(
    (fileId: string, index: number): void => {
      navigateToFile(fileId);
      setFocusedFindingKey(findingKey(fileId, index));
      closeAndReset();
    },
    [navigateToFile, setFocusedFindingKey, closeAndReset],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      const hit = open ? flatHits[activeIdx] : undefined;
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        if (hit.kind === "file") handleSelect(hit.file.id);
        else handleFindingSelect(hit.file.id, hit.index);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      setActiveIdx((i) => (open ? Math.min(i + 1, Math.max(0, flatHits.length - 1)) : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      setActiveIdx((i) => (open ? Math.max(i - 1, 0) : Math.max(0, flatHits.length - 1)));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  /* Highlight matching chars in a string */
  const highlight = (text: string, query: string): React.ReactNode => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: "#f2d5a0", fontWeight: 600 }}>
          {text.slice(idx, idx + query.length)}
        </span>
        {text.slice(idx + query.length)}
      </>
    );
  };

  // Byte-stable EN pluralization: "First 8" rides the {count} var of the
  // plural variant (8 results always render the plural wording).
  const totalHits = flatHits.length;
  const resultStatus = !query
    ? t(lang, "search.statusIdle")
    : totalHits === 0
      ? t(lang, "search.statusNoMatch", { query })
      : t(lang, totalHits === 1 ? "search.statusResultOne" : "search.statusResultMany", {
          count: totalHits === 8 ? "First 8" : totalHits,
        });

  const groupHeaderStyle = {
    color: "var(--meta)",
    borderBottom: "1px solid rgba(232,178,60,0.1)",
  } as const;

  return (
    <div
      ref={wrapperRef}
      className="search-control relative w-80 max-w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {/* Input */}
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--meta)", fontSize: "0.8rem" }}
          aria-hidden="true"
        >
          ⌕
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t(lang, "search.placeholder")}
          aria-label={t(lang, "search.inputAria")}
          data-search-input="true"
          title={t(lang, "search.inputTitle")}
          aria-expanded={open}
          aria-controls={open ? resultsId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-describedby={open ? statusId : undefined}
          className="w-full font-jetbrains text-xs pl-10 pr-10 py-3 rounded-lg outline-none transition-colors duration-150"
          style={{
            background: "rgba(18, 18, 16, 0.88)",
            border: `1px solid ${open ? "rgba(232,178,60,0.6)" : "rgba(150,142,128,0.3)"}`,
            color: "#e8e4da",
            backdropFilter: "blur(8px)",
            boxShadow: open ? "0 0 0 3px rgba(232,178,60,0.1)" : "none",
          }}
        />
        {value && (
          <button
            onClick={() => {
              setValue("");
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded font-jetbrains text-xs transition-colors"
            style={{ color: "var(--meta)" }}
            aria-label={t(lang, "search.clearAria")}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff6477")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--meta)")}
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-2 z-30 rounded-lg overflow-hidden animate-fade-up"
          style={{
            background: "rgba(18, 18, 16, 0.97)",
            border: "1px solid rgba(232,178,60,0.22)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            id={statusId}
            role="status"
            aria-live="polite"
            className="px-4 py-3 text-xs leading-relaxed"
            style={{
              color: "var(--meta-strong)",
              borderBottom: totalHits ? "1px solid rgba(232,178,60,0.1)" : undefined,
            }}
          >
            {resultStatus}
          </div>
          <div
            id={resultsId}
            role="listbox"
            aria-label={t(lang, "search.listboxAria")}
            className="max-h-[min(55vh,400px)] overflow-y-auto"
          >
            {/* Group: files (as before) */}
            {fileHits.length > 0 && (
              <div
                role="presentation"
                className="px-4 py-1.5 font-jetbrains text-[length:var(--fs-meta)] uppercase tracking-widest"
                style={groupHeaderStyle}
              >
                {t(lang, "search.filesGroup")}
              </div>
            )}
            {fileHits.map(({ file }, i) => {
              const isActive = activeIdx === i && activeHit?.kind === "file";
              // The same alarm colour the city and the list use, so switching
              // to the colour-blind palette does not leave the search behind.
              const threatSeverity: Severity | null =
                file.threatLevel === "critical"
                  ? "P0"
                  : file.threatLevel === "high"
                    ? "P1"
                    : file.threatLevel === "medium"
                      ? "P2"
                      : null;
              const dotColor = threatSeverity
                ? severityColor(threatSeverity, colorblind)
                : threatColor(file.threatLevel, colorblind);
              return (
                <button
                  key={file.id}
                  id={`${searchId}-option-${i}`}
                  tabIndex={-1}
                  onClick={() => handleSelect(file.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIdx(i)}
                  className="w-full text-left px-4 py-3 transition-colors duration-100 flex items-center justify-between gap-3"
                  style={{
                    background: isActive ? "rgba(232,178,60,0.1)" : "transparent",
                    borderBottom:
                      i < fileHits.length - 1 || findingHits.length > 0
                        ? "1px solid rgba(232,178,60,0.07)"
                        : "none",
                  }}
                  role="option"
                  aria-selected={isActive}
                >
                  <div className="min-w-0 flex items-start gap-2">
                    {/* Language dot */}
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                      style={{ background: languageColor(file.language) }}
                    />
                    <div className="min-w-0">
                      <span
                        className="block font-jetbrains text-xs break-all leading-relaxed"
                        style={{ color: "#e8e4da" }}
                      >
                        {highlight(file.name, query)}
                      </span>
                      <span
                        className="block font-jetbrains text-[length:var(--fs-meta)] break-all leading-relaxed mt-0.5"
                        style={{ color: "var(--meta-strong)" }}
                      >
                        {highlight(file.path, query)}
                      </span>
                      <span
                        className="block text-[length:var(--fs-meta)] mt-1"
                        style={{ color: "var(--meta)" }}
                      >
                        {file.language} · {formatCount(lang, file.linesOfCode)} LOC
                      </span>
                    </div>
                  </div>

                  {file.findings.length > 0 && (
                    <span
                      className="font-jetbrains text-[length:var(--fs-meta)] px-2 py-1 rounded shrink-0"
                      style={{
                        color: dotColor,
                        border: `1px solid ${dotColor}55`,
                        background: `${dotColor}12`,
                      }}
                    >
                      {t(
                        lang,
                        file.findings.length === 1 ? "search.issuesOne" : "search.issuesMany",
                        { count: file.findings.length },
                      )}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Group: findings (only for a non-empty query) */}
            {findingHits.length > 0 && (
              <div
                role="presentation"
                className="px-4 py-1.5 font-jetbrains text-[length:var(--fs-meta)] uppercase tracking-widest"
                style={groupHeaderStyle}
              >
                {t(lang, "search.findingsGroup")}
              </div>
            )}
            {findingHits.map((hit, i) => {
              const isActive = activeIdx === fileHits.length + i;
              const sevColor = severityColor(hit.finding.severity, colorblind);
              const label = hit.finding.ruleId ?? hit.finding.type;
              return (
                <button
                  key={`${hit.file.id}#${hit.index}`}
                  id={`${searchId}-finding-${i}`}
                  tabIndex={-1}
                  onClick={() => handleFindingSelect(hit.file.id, hit.index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIdx(fileHits.length + i)}
                  className="search-hit"
                  style={{
                    background: isActive ? "rgba(232,178,60,0.1)" : "transparent",
                  }}
                  role="option"
                  aria-selected={isActive}
                >
                  <div className="min-w-0 flex items-start gap-2">
                    {/* Severity chip */}
                    <span
                      className="severity-chip search-hit-severity font-jetbrains"
                      data-severity={hit.finding.severity}
                      style={{ color: sevColor }}
                      title={hit.finding.severity}
                    >
                      <span aria-hidden="true" className="severity-chip-shape">
                        {hit.finding.severity === "P0"
                          ? "▲"
                          : hit.finding.severity === "P1"
                            ? "◆"
                            : "●"}
                      </span>
                      {t(lang, SEVERITY_LABEL_KEY[hit.finding.severity])}
                    </span>
                    <div className="min-w-0">
                      <span
                        className="block font-jetbrains text-xs leading-relaxed truncate"
                        style={{ color: "#e8e4da" }}
                        title={`${label} :${hit.finding.line}`}
                      >
                        {highlight(label, query)}
                        <span style={{ color: "var(--meta)" }}> :{hit.finding.line}</span>
                      </span>
                      <span
                        className="block text-[length:var(--fs-meta)] leading-relaxed mt-0.5 truncate"
                        style={{ color: "var(--meta-strong)" }}
                        title={hit.finding.message}
                      >
                        {highlight(hit.finding.message, query)}
                      </span>
                      <FindingGermanLine finding={hit.finding} marked={false} />
                      <span
                        className="block font-jetbrains text-[length:var(--fs-meta)] truncate mt-0.5"
                        style={{ color: "var(--meta)" }}
                        title={hit.file.path}
                      >
                        {hit.file.path}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
