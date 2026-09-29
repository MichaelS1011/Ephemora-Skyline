import { useRef, useState, useEffect, useCallback } from "react";
import { useStore } from "../stores/useStore";
import { searchFiles } from "../city/layout";
import { languageColor, THREAT_COLOR } from "../city/palette";
import type { ThreatLevel } from "../city/types";

export function SearchBar() {
  const cityData = useStore((s) => s.cityData);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const results = cityData ? searchFiles(cityData, value, 8) : [];

  /* Close on outside click */
  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /* Reset active index on new results */
  useEffect(() => {
    setActiveIdx(0);
  }, [value]);

  const handleSelect = useCallback(
    (fileId: string): void => {
      navigateToFile(fileId);
      setOpen(false);
      setValue("");
      inputRef.current?.blur();
    },
    [navigateToFile],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      if (results[activeIdx]) handleSelect(results[activeIdx]!.file.id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  /* Highlight matching chars in a string */
  const highlight = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
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

  const showResults = open && value.trim().length > 0;

  return (
    <div ref={wrapperRef} className="relative w-80">
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
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search files, paths, languages…"
          aria-label="Search buildings"
          title="Search files by name, path or language — picking a result flies the camera to its building"
          aria-expanded={showResults}
          aria-controls="search-results"
          aria-autocomplete="list"
          className="w-full font-jetbrains text-xs pl-8 pr-8 py-1.5 rounded-sm outline-none transition-all duration-150"
          style={{
            background: "rgba(18, 18, 16, 0.88)",
            border: `1px solid ${open && value ? "rgba(232,178,60,0.45)" : "rgba(150,142,128,0.3)"}`,
            color: "#e8e4da",
            backdropFilter: "blur(8px)",
            boxShadow: open && value ? "0 0 0 2px rgba(232,178,60,0.08)" : "none",
          }}
        />
        {value && (
          <button
            onClick={() => {
              setValue("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 font-jetbrains text-[10px] transition-colors"
            style={{ color: "var(--meta)" }}
            aria-label="Clear search"
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff6477")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--meta)")}
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showResults && (
        <div
          id="search-results"
          className="absolute top-full left-0 right-0 mt-1 z-30 rounded-sm overflow-hidden animate-fade-up"
          style={{
            background: "rgba(18, 18, 16, 0.97)",
            border: "1px solid rgba(232,178,60,0.22)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
          }}
          role="listbox"
          aria-label="Search results"
        >
          {results.length === 0 ? (
            <div className="px-4 py-3 font-jetbrains text-[10px]" style={{ color: "var(--meta)" }}>
              No matching files in this city
            </div>
          ) : (
            <>
              {results.map(({ file, chain }, i) => {
                const isActive = i === activeIdx;
                const threatColor = THREAT_COLOR[file.threatLevel as ThreatLevel];
                return (
                  <button
                    key={file.id}
                    onClick={() => handleSelect(file.id)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className="w-full text-left px-3 py-2 transition-colors duration-100 flex items-center justify-between gap-2"
                    style={{
                      background: isActive ? "rgba(232,178,60,0.07)" : "transparent",
                      borderBottom:
                        i < results.length - 1 ? "1px solid rgba(232,178,60,0.07)" : "none",
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
                          className="block font-jetbrains text-[11px] truncate"
                          style={{ color: "#e8e4da" }}
                        >
                          {highlight(file.name, value)}
                        </span>
                        <span
                          className="block font-jetbrains text-[9px] truncate mt-0.5"
                          style={{ color: "var(--meta-strong)" }}
                        >
                          {chain.length > 0 ? `${chain.join("/")} · ` : ""}
                          {file.language} · {file.linesOfCode.toLocaleString()} LOC
                        </span>
                      </div>
                    </div>

                    {file.findings.length > 0 && (
                      <span
                        className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm shrink-0"
                        style={{
                          color: threatColor,
                          border: `1px solid ${threatColor}55`,
                          background: `${threatColor}12`,
                        }}
                      >
                        {file.findings.length} {file.findings[0]!.severity}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Footer hint */}
              <div
                className="px-3 py-1.5 font-jetbrains text-[9px] flex items-center gap-2"
                style={{
                  color: "var(--meta-faint)",
                  borderTop: "1px solid rgba(232,178,60,0.08)",
                  background: "rgba(18,18,16,0.6)",
                }}
              >
                <kbd
                  style={{
                    border: "1px solid rgba(232,178,60,0.2)",
                    color: "var(--meta)",
                    padding: "0 3px",
                    borderRadius: 2,
                  }}
                >
                  ↑↓
                </kbd>
                navigate
                <kbd
                  style={{
                    border: "1px solid rgba(232,178,60,0.2)",
                    color: "var(--meta)",
                    padding: "0 3px",
                    borderRadius: 2,
                  }}
                >
                  ↵
                </kbd>
                fly to
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
