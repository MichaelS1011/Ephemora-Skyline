/**
 * The file's own panels: the honest-building structure block, the real source
 * view with its flagged lines, and the button that runs the file's test suite.
 *
 * Split out of `InfoPanel.tsx` (2026-10-18) with no behaviour change — same
 * lazy fetch, same windowing of huge files, same scroll-to-line for the triage
 * focus, same one fetch per file keyed by `file.id`. `InfoPanel` composes these;
 * the pure helpers stay in `findings/panelLogic.ts`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { SEVERITY_CVD_COLOR, severityColor } from "../city/palette";
import type { VoxelSectionSpec } from "../city/voxels";
import type { CityFile, CityFinding } from "../city/types";
import { formatCount, t } from "../i18n";
import { findingKey } from "../reviews";
import { useTestRunner } from "../hooks/useTestRunner";
import {
  findingContextRanges,
  findingsBySection,
  highlightSourceLines,
  shouldAutoLoad,
  type SourceLineView,
  type SourceStatus,
} from "../findings/panelLogic";
import { SevChip } from "./FindingCard";

/* ── Honest-building structure — sections + voxel legend ──────────────────
 * The sections ride on the file payload (VoxelSectionSpec, city/voxels.ts);
 * old payloads don't carry them and the block stays hidden. Mirrors what the
 * selected building materializes as: one voxel per code line, sections as
 * strata, nesting depth as terraces. Each section row expands to the
 * findings inside its line range; jumping to one reuses the triage focus
 * (pulse + scroll) on the matching row in the findings list below. */
export function VoxelStructureBlock({ file }: { file: CityFile }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const setFocusedFindingKey = useStore((s) => s.setFocusedFindingKey);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const payload = file as CityFile & {
    sections?: VoxelSectionSpec[];
    totalVoxels?: number;
  };
  const sections = payload.sections;
  if (!sections || sections.length === 0) return null;
  const mapping = findingsBySection(sections, file.findings);
  const shown = mapping.slice(0, 24);
  const maxDepth = sections.reduce((m, s) => Math.max(m, s.depth), 0);
  const total = payload.totalVoxels ?? sections.reduce((sum, s) => sum + s.codeLines, 0);
  const detailsId = (i: number) => `section-details-${file.id.replace(/[^a-z0-9]/gi, "-")}-${i}`;

  const toggle = (i: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Reuses the triage focus: the findings list below highlights and scrolls
  // to the row (FindingRow reacts to focusedFindingKey).
  const jumpToFinding = (finding: CityFinding): void => {
    const index = file.findings.indexOf(finding);
    if (index >= 0) setFocusedFindingKey(findingKey(file.id, index));
  };

  return (
    <div className="mb-3" aria-label={t(lang, "panel.structureAria")}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span
          className="font-jetbrains text-[length:var(--fs-meta)] tracking-[0.2em] uppercase"
          style={{ color: "#e1ded4" }}
        >
          {t(lang, "panel.structureHeader")}
        </span>
        <span
          className="font-jetbrains text-[length:var(--fs-meta)]"
          style={{ color: "var(--meta-strong)" }}
          title={t(lang, "panel.voxelLegendTitle")}
        >
          {t(lang, "panel.voxelLegend", { count: formatCount(lang, total) })}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {shown.map(({ section: s, findings: sectionFindings }, i) => {
          const pct = maxDepth > 0 ? (s.depth / maxDepth) * 100 : 0;
          const isOpen = expanded.has(i);
          return (
            <div key={i}>
              <div className="flex items-center gap-2 font-jetbrains text-[length:var(--fs-meta)] min-w-0">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? detailsId(i) : undefined}
                  aria-label={t(lang, "panel.sectionToggleAria", { name: s.name })}
                  title={t(lang, "panel.sectionMeta", {
                    kind: s.kind,
                    start: s.start,
                    end: s.end,
                    depth: s.depth,
                  })}
                  className="flex items-center gap-1 min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
                  style={{ color: "#e1ded4" }}
                >
                  <span
                    className="shrink-0"
                    style={{ color: "var(--meta-strong)" }}
                    aria-hidden="true"
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="truncate min-w-0 flex-1">{s.name}</span>
                  {sectionFindings.length > 0 && (
                    <span
                      className="shrink-0 font-jetbrains text-[length:var(--fs-meta)] px-1 rounded-sm severity-count"
                      data-severity={sectionFindings[0]!.severity}
                      style={{
                        color: severityColor(sectionFindings[0]!.severity, colorblind),
                        borderColor: `${severityColor(sectionFindings[0]!.severity, colorblind)}55`,
                      }}
                      title={t(lang, "panel.sectionFindingsTitle")}
                    >
                      {sectionFindings.length}
                    </span>
                  )}
                </button>
                <span className="shrink-0" style={{ color: "var(--meta-strong)" }}>
                  {s.codeLines} LOC
                </span>
                <span
                  className="shrink-0 inline-block rounded-sm"
                  style={{
                    width: 34,
                    height: 4,
                    background: "rgba(150,142,128,0.16)",
                    overflow: "hidden",
                  }}
                  aria-hidden="true"
                >
                  <span
                    className="block h-full"
                    style={{
                      width: `${pct > 0 ? Math.max(10, pct) : 0}%`,
                      background: "#e1ded4",
                      opacity: 0.75,
                    }}
                  />
                </span>
              </div>
              {isOpen && (
                <div
                  id={detailsId(i)}
                  role="region"
                  aria-label={t(lang, "panel.sectionFindings")}
                  className="mt-1 mb-1 ml-3 flex flex-col gap-0.5 animate-fade-up"
                  style={{ borderLeft: "1px solid rgba(150,142,128,0.25)", paddingLeft: 8 }}
                >
                  <span
                    className="font-jetbrains text-[length:var(--fs-meta)] uppercase tracking-wide"
                    style={{ color: "var(--meta-strong)" }}
                  >
                    {t(lang, "panel.sectionFindings")}
                  </span>
                  {sectionFindings.length === 0 ? (
                    <span
                      className="font-jetbrains text-[length:var(--fs-meta)]"
                      style={{ color: "#8f8b82" }}
                    >
                      {t(lang, "panel.sectionNoFindings")}
                    </span>
                  ) : (
                    sectionFindings.map((f, j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => jumpToFinding(f)}
                        aria-label={t(lang, "panel.findingJumpAria", { line: f.line })}
                        title={t(lang, "panel.findingJumpAria", { line: f.line })}
                        className="flex items-center gap-1.5 text-left font-jetbrains text-[length:var(--fs-meta)] transition-opacity hover:opacity-80"
                      >
                        <SevChip severity={f.severity} />
                        <span className="truncate min-w-0 flex-1" style={{ color: "#cfcabe" }}>
                          {f.type}
                        </span>
                        <span className="shrink-0" style={{ color: "var(--meta-strong)" }}>
                          :{f.line}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sections.length > 24 && (
          <div
            className="font-jetbrains text-[length:var(--fs-meta)]"
            style={{ color: "var(--meta-strong)" }}
          >
            {t(lang, "panel.moreSections", { count: sections.length - 24 })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Source view — the file's real code with flagged finding lines ────────
 * Lazy by default: nothing loads until the user asks. When the triage queue
 * targets a finding of this file (autoLoad), the fetch starts on its own,
 * the block opens itself, and the focused line is scrolled into view inside
 * the source container. One fetch per file (the panel keys this block by
 * file.id, so selecting another building resets the cache). Huge files
 * render only the finding environment (±40 lines per finding) behind a
 * "show full file" toggle to keep the DOM bounded. */
const SOURCE_WINDOW_LIMIT = 2000; // lines — above this, window to findings
const SOURCE_CONTEXT = 40; // lines of context around each finding

interface SourcePayload {
  path: string;
  language?: string;
  lines: string[];
}

export function SourceBlock({
  file,
  analysisId,
  autoLoad = false,
  scrollToLine = null,
}: {
  file: CityFile;
  analysisId: string | null;
  /** Start the fetch automatically (triage focus) instead of waiting for a click. */
  autoLoad?: boolean;
  /** 1-based line to scroll into view once the source is ready. */
  scrollToLine?: number | null;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SourceStatus>("idle");
  const [lines, setLines] = useState<string[] | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const sourceId = `source-view-${file.id.replace(/[^a-z0-9]/gi, "-")}`;

  const load = useCallback(async (): Promise<void> => {
    // One fetch per file — the component is keyed by file.id, so `lines`
    // being non-null means this file's source is already here.
    if (!analysisId || status === "loading" || lines) return;
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/result/${encodeURIComponent(analysisId)}/source/${encodeURIComponent(file.id)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as Partial<SourcePayload>;
      setLines(Array.isArray(payload.lines) ? payload.lines.map(String) : []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [analysisId, status, lines, file.id]);

  // Auto-load exactly once per file while idle — shouldAutoLoad keeps
  // loading/error/ready from re-fetching (no fetch loop; a failed auto-load
  // keeps the manual "Load source" button for an honest retry).
  useEffect(() => {
    if (!shouldAutoLoad(status, analysisId, autoLoad)) return;
    setAutoLoaded(true);
    setOpen(true); // auto-loaded source must be visible, not hidden behind the toggle
    void load();
  }, [autoLoad, analysisId, status, load]);

  // Scroll the focused finding's line to the center of the source container —
  // runs once per scrollToLine change (dep), never on plain re-renders.
  // Scrolls the container itself (scrollTop math), not the whole window.
  useEffect(() => {
    if (status !== "ready" || scrollToLine == null) return;
    const block = blockRef.current;
    const container = block?.querySelector<HTMLElement>("[data-source-scroll]");
    const row = block?.querySelector<HTMLElement>(`[data-line="${scrollToLine}"]`);
    if (!container || !row) return; // windowed view without the line — nothing to scroll to
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const delta = rowRect.top - containerRect.top - containerRect.height / 2 + rowRect.height / 2;
    container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
  }, [scrollToLine, status]);

  const unavailable = (
    <div
      className="font-jetbrains text-[length:var(--fs-meta)] px-2 py-1.5 rounded-sm"
      style={{
        color: "#8f8b82",
        background: "rgba(150,142,128,0.08)",
        border: "1px solid rgba(150,142,128,0.22)",
      }}
    >
      {t(lang, "panel.sourceUnavailable")}
    </div>
  );

  return (
    <div ref={blockRef} className="mb-3" aria-label={t(lang, "panel.sourceHeader")}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={open ? sourceId : undefined}
          aria-label={t(lang, "panel.sourceToggleAria")}
          className="flex items-center gap-1 font-jetbrains text-[length:var(--fs-meta)] tracking-[0.2em] uppercase transition-opacity hover:opacity-80"
          style={{ color: "#e1ded4" }}
        >
          <span aria-hidden="true" style={{ color: "var(--meta-strong)" }}>
            {open ? "▾" : "▸"}
          </span>
          {t(lang, "panel.sourceHeader")}
        </button>
        {status === "ready" && scrollToLine != null && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm shrink-0"
            style={{ color: "var(--accent-gold)", border: "1px solid rgba(232,178,60,0.4)" }}
            title={t(lang, "panel.sourceLine", { line: scrollToLine })}
          >
            {t(lang, "panel.sourceLine", { line: scrollToLine })}
          </span>
        )}
      </div>
      {open && (
        <div id={sourceId} className="animate-fade-up">
          {autoLoaded && status === "ready" && (
            <div
              className="font-jetbrains text-[length:var(--fs-meta)] mb-1"
              style={{ color: "var(--meta-strong)" }}
            >
              {t(lang, "panel.sourceAutoLoaded")}
            </div>
          )}
          {(status === "idle" || status === "error") && analysisId && (
            <button
              type="button"
              onClick={() => void load()}
              className="w-full py-1.5 font-jetbrains text-[length:var(--fs-meta)] tracking-widest rounded-sm transition-all duration-150 hover:opacity-90"
              style={{
                border: "1px solid rgba(232,178,60,0.4)",
                color: "#f2d5a0",
                background: "rgba(232,178,60,0.07)",
              }}
            >
              {t(lang, "panel.loadSource")}
            </button>
          )}
          {status === "idle" && !analysisId && unavailable}
          {status === "loading" && (
            <div
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "var(--meta-strong)" }}
            >
              ⟳ {t(lang, "panel.sourceLoading")}
            </div>
          )}
          {/* one note per state — `error` used to print it twice, once for the
              failed fetch and once for the empty line list */}
          {(status === "error" || (status === "ready" && lines !== null && lines.length === 0)) &&
            unavailable}
          {status === "ready" && lines !== null && lines.length > 0 && (
            <SourceView file={file} lines={lines} showFull={showFull} onToggleFull={setShowFull} />
          )}
        </div>
      )}
    </div>
  );
}

/** The monospace line list — shared by the windowed and full renderings. */
function SourceView({
  file,
  lines,
  showFull,
  onToggleFull,
}: {
  file: CityFile;
  lines: string[];
  showFull: boolean;
  onToggleFull: (v: boolean) => void;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const view = highlightSourceLines(lines, file.findings);
  const lineNoWidth = String(lines.length).length;

  // DOM cap: window to the finding environment unless the user opts out
  const windowed = lines.length > SOURCE_WINDOW_LIMIT && !showFull;
  let ranges: Array<[number, number]>;
  if (windowed) {
    ranges = findingContextRanges(file.findings, lines.length, SOURCE_CONTEXT);
    if (ranges.length === 0) ranges = [[1, Math.min(120, lines.length)]]; // no findings: show the head
  } else {
    ranges = [[1, lines.length]];
  }

  const row = (lineNo: number, line: SourceLineView) => (
    <div
      key={lineNo}
      data-line={lineNo}
      className="flex whitespace-pre"
      style={
        line.kind === "finding"
          ? {
              background: colorblind ? `${SEVERITY_CVD_COLOR.P0}1f` : "rgba(255,46,77,0.12)",
              borderLeft: `2px solid ${severityColor("P0", colorblind)}`,
              paddingLeft: 2,
            }
          : { borderLeft: "2px solid transparent", paddingLeft: 2 }
      }
    >
      <span
        style={{
          color: line.kind === "finding" ? "#ff6b7a" : "var(--meta-faint)",
          userSelect: "none",
          padding: "0 6px",
          minWidth: lineNoWidth * 7,
          textAlign: "right",
        }}
      >
        {lineNo}
      </span>
      <span style={{ color: line.kind === "finding" ? "#ffd0d5" : "#5d7494" }}>
        {line.text || " "}
      </span>
    </div>
  );

  return (
    <div>
      <div
        role="region"
        aria-label={t(lang, "panel.sourceAria")}
        data-source-scroll=""
        className="overflow-y-auto overflow-x-auto rounded-sm"
        style={{
          maxHeight: 260,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(150,142,128,0.18)",
        }}
      >
        {ranges.map(([start, end], i) => (
          <div key={start}>
            {i > 0 && (
              <div
                className="font-jetbrains text-[length:var(--fs-meta)]"
                style={{ color: "var(--meta-faint)", padding: "0 6px" }}
                aria-hidden="true"
              >
                ⋯
              </div>
            )}
            {view.slice(start - 1, end).map((line, j) => row(start + j, line))}
          </div>
        ))}
      </div>
      {lines.length > SOURCE_WINDOW_LIMIT && (
        <button
          type="button"
          onClick={() => onToggleFull(!showFull)}
          className="mt-1 font-jetbrains text-[length:var(--fs-meta)] transition-opacity hover:opacity-80"
          style={{ color: "#d8c9a3" }}
        >
          {showFull ? t(lang, "panel.showFindingContext") : t(lang, "panel.showFullFile")}
        </button>
      )}
    </div>
  );
}

/* ── Run tests — for the file's own test suite ─────────────────────────── */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__)\//i;

export function RunTestsButton({
  filePath,
  analysisOnDisk,
}: {
  filePath: string;
  analysisOnDisk: boolean;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const testRun = useStore((s) => s.testRun);
  const analysisId = useStore((s) => s.analysisId);
  const { runTests } = useTestRunner();

  const isTestFile = /\.[cm]?[jt]sx?$/i.test(filePath) && TEST_FILE.test(filePath);
  const busy = testRun.status === "installing" || testRun.status === "running";
  if (!isTestFile) return null;

  return (
    <>
      <button
        onClick={() => void runTests([filePath])}
        disabled={busy || !analysisId || !analysisOnDisk}
        className="w-full mb-3 py-1.5 font-jetbrains text-[length:var(--fs-meta)] tracking-widest rounded-sm
                 transition-all duration-150 hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-[#29d398]
                 disabled:opacity-40 cursor-pointer"
        style={{
          border: "1px solid rgba(41,211,152,0.45)",
          color: "#29d398",
          background: "rgba(41,211,152,0.07)",
        }}
        title={t(lang, "test.snapshot")}
      >
        {busy ? `⟳ ${testRun.stage || t(lang, "panel.running")}` : t(lang, "panel.runTestFile")}
      </button>
      <p
        className="mb-3 text-[length:var(--fs-meta)] leading-relaxed"
        style={{ color: "var(--meta)" }}
      >
        {t(lang, "test.snapshot")}
      </p>
      {testRun.status === "failed" && (
        <p role="alert" className="mb-3 text-[length:var(--fs-meta)]" style={{ color: "#ff6b7a" }}>
          {testRun.stage}
        </p>
      )}
    </>
  );
}
