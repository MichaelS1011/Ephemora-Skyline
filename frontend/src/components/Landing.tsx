import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useStore } from "../stores/useStore";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { ProfileChips } from "./ProfileChips";
import { SCAN_PROFILES } from "../config/scanProfiles";
import { OUTBOUND_CALLS } from "../config/networkSurface";
import { formatCount, formatDecimal, t, type Lang } from "../i18n";
import { ts, tsCount } from "./startCopy";
import type { CityData } from "../city/types";
import { recentCities, recentCitiesRead, cityGoneForSure, type RecentCity } from "../recentCities";
import {
  arrivalBeat,
  readArrivalStageRead,
  rememberArrivalStage,
  type ArrivalStage,
} from "../firstArrival";
import { clearPendingRun, readPendingRun } from "../pendingRun";
import { clearEpheLook, hasStoredLook, readEpheLookRead } from "../epheLook";
import { honouredNames } from "../epheNames";
import { readStoredJson } from "../storageRead";
import { resetBackendVerdicts } from "../reviews";
import { ScanExcludes } from "./ScanExcludes";
import { EphePortrait } from "./EphePortrait";
import { EphePreview } from "./EphePreview";
import { ArrivalProgress } from "./ArrivalProgress";
import "../design/start.css";

export const BRAND = { ink: "#F2EFE8", red: "#E8503C", bg: "#161614", panel: "#1C1C1A" };

export function BrandWordmark({ scale = 1 }: { scale?: number }) {
  return (
    <span
      className="font-jetbrains font-bold inline-flex items-baseline"
      style={{ fontSize: scale * 15, letterSpacing: "0.04em", color: BRAND.ink }}
    >
      EPHEMORA
      <span aria-hidden="true" style={{ color: BRAND.red }}>
        .
      </span>
    </span>
  );
}

/** Two-letter language switcher — deliberately quiet, next to the local badge. */
function LangSwitch({ lang, onPick }: { lang: Lang; onPick: (lang: Lang) => void }) {
  return (
    <div
      role="group"
      aria-label={t(lang, "landing.langAria")}
      className="start-lang flex items-center gap-1 font-jetbrains text-[length:var(--fs-meta)] tracking-wider"
    >
      {(["en", "de"] as const).map((code, index) => (
        <Fragment key={code}>
          {index > 0 && (
            <span aria-hidden="true" style={{ color: "var(--meta-faint)" }}>
              |
            </span>
          )}
          <button
            type="button"
            onClick={() => onPick(code)}
            aria-pressed={lang === code}
            className="rounded px-1.5 py-0.5 transition-colors hover:text-[#f2efe8] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)]"
            style={{ color: lang === code ? BRAND.ink : "var(--meta-strong)" }}
          >
            {code.toUpperCase()}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** A schematic, not scan data: explains the visual language before the first scan. */
function CityIllustration({ lang }: { lang: Lang }) {
  const buildings = [
    { x: 242, y: 302, h: 78, w: 40, color: "#7e99af" },
    { x: 303, y: 332, h: 120, w: 42, color: "#b3a589" },
    { x: 363, y: 362, h: 178, w: 46, color: "#dc7660" },
    { x: 179, y: 334, h: 48, w: 38, color: "#718b9b" },
    { x: 240, y: 365, h: 90, w: 40, color: "#9c9f98" },
    { x: 301, y: 396, h: 58, w: 40, color: "#879bab" },
  ];
  return (
    <figure className="city-illustration">
      <div className="start-plate">
        <span className="start-plate-axis" aria-hidden="true" />
        <svg
          viewBox="0 0 560 490"
          role="img"
          aria-labelledby="city-diagram-title city-diagram-desc"
        >
          <title id="city-diagram-title">{t(lang, "landing.illuTitle")}</title>
          <desc id="city-diagram-desc">{t(lang, "landing.illuDesc")}</desc>
          <defs>
            <pattern
              id="diagram-grid"
              width="48"
              height="24"
              patternUnits="userSpaceOnUse"
              patternTransform="matrix(1 .5 -1 .5 280 60)"
            >
              <path d="M 48 0 L 0 0 0 24" fill="none" stroke="#b4afa2" strokeOpacity=".12" />
            </pattern>
            <linearGradient id="beacon-beam" x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#e8503c" stopOpacity="0" />
              <stop offset="1" stopColor="#e8503c" stopOpacity=".3" />
            </linearGradient>
          </defs>
          <path d="M24 298 280 170 536 298 280 426Z" fill="url(#diagram-grid)" />
          <path d="m105 310 176-89 199 99v18l-176 89-199-99Z" fill="#292b29" stroke="#494b44" />
          <path d="m105 310 176-89 199 99-176 89Z" fill="#242624" stroke="#6c6a5d" />
          <path
            d="m78 339 221 111 207-104M132 277l148-74 231 116"
            fill="none"
            stroke="#a99771"
            strokeDasharray="5 7"
            strokeOpacity=".48"
          />
          {buildings.map(({ x, y, h, w, color }) => (
            <g key={`${x}-${y}`}>
              <path
                d={`M${x} ${y}v-${h}l${w} 20v${h}Z`}
                fill={color}
                fillOpacity=".36"
                stroke={color}
                strokeOpacity=".65"
              />
              <path
                d={`M${x + w} ${y + 20}v-${h}l${w} -20v${h}Z`}
                fill={color}
                fillOpacity=".16"
                stroke={color}
                strokeOpacity=".4"
              />
              <path
                d={`M${x} ${y - h}l${w} -20 ${w} 20-${w} 20Z`}
                fill={color}
                fillOpacity=".65"
                stroke={color}
              />
              {Array.from({ length: Math.floor(h / 20) }, (_, i) => (
                <path
                  key={i}
                  d={`M${x + 9} ${y - h + 19 + i * 18}l${w - 18} 11m19 0 22-11`}
                  stroke={color}
                  strokeOpacity=".55"
                  strokeWidth="3"
                />
              ))}
            </g>
          ))}
          <path d="M386 72h45l-5 115h-35Z" fill="url(#beacon-beam)" />
          <circle cx="409" cy="173" r="5" fill="#ff8770" />
          <circle cx="409" cy="173" r="13" stroke="#e8503c" fill="none" strokeOpacity=".4" />
          <path d="M409 154v-53h-73" className="diagram-line" />
          <text x="334" y="96" textAnchor="end" className="diagram-label">
            {t(lang, "landing.illuRisk")}
          </text>
          <text x="334" y="115" textAnchor="end" className="diagram-caption">
            {t(lang, "landing.illuRiskCaption")}
          </text>
          <path d="M242 224h-97v-44" className="diagram-line" />
          <text x="70" y="151" className="diagram-label">
            {t(lang, "landing.illuComplexity")}
          </text>
          <text x="70" y="170" className="diagram-caption">
            {t(lang, "landing.illuComplexityCaption")}
          </text>
          <path d="M181 355h-56v65" className="diagram-line" />
          <text x="72" y="444" className="diagram-label">
            {t(lang, "landing.illuDistrict")}
          </text>
          <text x="72" y="463" className="diagram-caption">
            {t(lang, "landing.illuDistrictCaption")}
          </text>
        </svg>
        <figcaption>
          {t(lang, "landing.illuFigcaption")} <span>{t(lang, "landing.illuFigcaptionNote")}</span>
        </figcaption>
      </div>
      <p className="start-street-note">{ts(lang, "landing.streetNote")}</p>
    </figure>
  );
}

/* ── The waiting room ───────────────────────────────────────────────────────
 * Lane LOKAL owns what the run knows: `stages` (the checklist with its
 * checkmarks), `elapsedSec` (the clock), `analysisStage` (the composed line
 * "stage · 34 s · waiting for the read budget"), `collected`/`foundFiles`
 * (the counting). START owns how it reads: which of those numbers sit where,
 * and the one thing the hook cannot know — how long the *current* stage has
 * been the current one, which is what makes a standing bar say "still alive". */
interface ProgressProps {
  lang: Lang;
  collecting: boolean;
  stageLine: string;
  progress: number;
  collected: { files: number; bytes: number; total: number };
  elapsedSec: number;
  budgetWaitSec: number;
  stages: { key: string; label: string; state: "todo" | "active" | "done" }[];
  onCancel: () => void;
}

export function ScanProgress({
  lang,
  collecting,
  stageLine,
  progress,
  collected,
  elapsedSec,
  budgetWaitSec,
  stages,
  onCancel,
}: ProgressProps) {
  const [stageSeenAt, setStageSeenAt] = useState(0);
  const activeIndex = stages.findIndex((s) => s.state === "active");
  const activeKey = activeIndex >= 0 ? stages[activeIndex]!.key : null;
  const [lastKey, setLastKey] = useState<string | null>(activeKey);
  if (lastKey !== activeKey) {
    setLastKey(activeKey);
    setStageSeenAt(elapsedSec);
  }
  const onStage = Math.max(0, elapsedSec - stageSeenAt);
  const stalled = onStage >= 6;
  // The head of the composed line is the stage; the rest is the clock and the
  // budget, which this block shows in their own places.
  const head = stageLine.split(" · ")[0]?.trim() ?? "";
  const nf = (n: number) => formatCount(lang, n);
  const bytes = collected.bytes;
  const size =
    bytes >= 1024 * 1024
      ? `${formatDecimal(lang, bytes / (1024 * 1024))} MB`
      : `${Math.round(bytes / 1024)} KB`;

  return (
    <section
      className={`start-progress ${stalled ? "is-stalled" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t(lang, "landing.progressAria")}
    >
      <header className="start-progress-head">
        <span className="start-kicker">{t(lang, "landing.progressAria")}</span>
        <span className="start-elapsed">{t(lang, "scan.elapsed", { s: elapsedSec })}</span>
      </header>

      <p className="start-progress-current">
        <span className="start-progress-stage">{head || t(lang, "landing.progressReady")}</span>
        {!collecting && <span className="start-progress-pct">{progress}%</span>}
      </p>

      <div
        className={`progress-track ${stalled ? "is-indeterminate" : ""}`}
        role="progressbar"
        aria-valuenow={collecting ? undefined : progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: collecting ? "8%" : `${Math.max(progress, 4)}%` }} />
      </div>

      {/* Quantities only — the stage sentence above already says what is
          happening, and it names the reading counter itself while reading. */}
      <p className="start-progress-count">
        {collected.total > 0
          ? t(lang, "scan.readingOf", {
              n: nf(collected.files),
              total: nf(collected.total),
            })
          : tsCount(lang, "scan.reading", "scan.readingOne", collected.files, {
              n: nf(collected.files),
            })}
        {bytes > 0 && (
          <span className="start-progress-bytes">
            {" · "}
            {size}
          </span>
        )}
        {budgetWaitSec > 0 && (
          <span className="start-budget-wait">
            {" · "}
            {t(lang, "limit.waiting")} · {budgetWaitSec} s
          </span>
        )}
      </p>

      <ol className="start-stages" aria-label={ts(lang, "scan.stages")}>
        {stages.map((s, i) => (
          <li key={s.key} className={`is-${s.state}`}>
            <span aria-hidden="true" className="start-stage-mark">
              {s.state === "done" ? "✓" : s.state === "active" ? "▸" : "·"}
            </span>
            <span className="start-stage-name">{s.label}</span>
            {i === activeIndex && stalled && (
              <span className="start-stage-hold">
                {ts(lang, "scan.stillRunning", { s: onStage })}
              </span>
            )}
          </li>
        ))}
      </ol>
      {stages.length > 0 && (
        <p className="start-progress-meta">
          {activeIndex >= 0
            ? ts(lang, "scan.stageOf", { i: activeIndex + 1, n: stages.length })
            : ts(lang, "scan.stageNone")}
        </p>
      )}

      <button type="button" className="start-cancel" onClick={onCancel}>
        {t(lang, "landing.cancel")}
      </button>
    </section>
  );
}

/* ── Boundary states ────────────────────────────────────────────────────────
 * The local analysis hook hands the UI two strings: `errorMessage`, built from
 * the dictionary in the display language, and `errorDetail`, the server's own
 * words. The kind is read from the detail (machine-written, one language) and
 * from `foundFiles`; the headline is never re-invented here. */
export type StartErrorKind =
  | "cap"
  | "no-source"
  | "rate-limit"
  | "server-down"
  | "timeout"
  | "job-gone"
  | "upload-too-large"
  | "demo"
  | "deadlink"
  | "failed";

export function classifyStartError(
  detail: string,
  message: string,
  foundFiles: number,
): StartErrorKind {
  const d = detail.toLowerCase();
  if (/not found \(404\)|job not found/.test(d)) return "job-gone";
  if (/no answer within/.test(d)) return "timeout";
  if (/failed to fetch|econnrefused|networkerror|fetch failed/.test(d)) return "server-down";
  if (/429|too many/.test(d) || says(message, "limit.hit")) return "rate-limit";
  if (/413|too large for one upload/.test(d)) return "upload-too-large";
  if (
    says(message, "scan.noSource") ||
    says(message, "scan.noSourceTooLarge") ||
    says(message, "scan.noSourceTooLargeOne")
  )
    return "no-source";
  if (says(message, "cap.filesFound") || says(message, "cap.hint"))
    return foundFiles === 0 ? "no-source" : "cap";
  return "failed";
}

/**
 * Lane LOKAL builds its sentences from dictionary templates, so a message is
 * recognised by the template's own wording rather than by a hard-coded phrase:
 * whatever the sentence says around the numbers, in either language, matches.
 */
function says(message: string, key: string): boolean {
  if (!message) return false;
  const probe = ts("en", key)
    .replace(/\{[^}]*\}/g, "")
    .trim()
    .slice(0, 14)
    .toLowerCase();
  const de = ts("de", key)
    .replace(/\{[^}]*\}/g, "")
    .trim()
    .slice(0, 14)
    .toLowerCase();
  const m = message.toLowerCase();
  return (probe.length > 3 && m.includes(probe)) || (de.length > 3 && m.includes(de));
}

export function StartNotice({
  lang,
  kind,
  measured,
  next,
  raw,
  number,
  action,
}: {
  lang: Lang;
  kind: StartErrorKind;
  measured: string;
  next: string;
  raw?: string;
  number?: number;
  action?: ReactNode;
}) {
  const glyph =
    kind === "cap" || kind === "upload-too-large" || kind === "no-source"
      ? "⛒"
      : kind === "rate-limit"
        ? "◔"
        : kind === "server-down" || kind === "job-gone" || kind === "deadlink"
          ? "⊘"
          : "⚠";
  return (
    <div className={`start-state start-state--${kind}`} role="alert">
      <span className="start-state-glyph" aria-hidden="true">
        {glyph}
      </span>
      <div className="start-state-body">
        <p className="start-state-row">
          <span className="start-kicker">{ts(lang, "start.measured")}</span>
          {number !== undefined && (
            <span className="start-state-figure">{formatCount(lang, number)}</span>
          )}
          <span className="start-state-text">{measured}</span>
        </p>
        <p className="start-state-row">
          <span className="start-kicker">{ts(lang, "start.nextStep")}</span>
          <span className="start-state-next">{next}</span>
        </p>
        {action && <div className="start-state-actions">{action}</div>}
        {raw && raw.trim() !== "" && raw !== measured && (
          <details className="start-state-raw">
            <summary>{ts(lang, "start.serverWords")}</summary>
            <code className="font-jetbrains">{raw}</code>
          </details>
        )}
      </div>
    </div>
  );
}

const nfLang = (lang: Lang, n: number): string => formatCount(lang, n);

/** The card for a scan that stopped: one shape for every wall, both languages. */
function ScanErrorCard({
  lang,
  message,
  detail,
  foundFiles,
  onRetry,
}: {
  lang: Lang;
  message: string;
  detail: string;
  foundFiles: number;
  onRetry: () => void;
}) {
  const kind = classifyStartError(detail, message, foundFiles);
  const copy: Record<StartErrorKind, { measured: string; next: string; retry: string }> = {
    cap: {
      measured: message,
      next: `${t(lang, "cap.hint")} · ${ts(lang, "start.settingsNext")}`,
      retry: "start.retry",
    },
    "no-source": {
      // the sentence names the extensions it tried; the next line says what to
      // look for instead of repeating the button's own label
      measured: message || ts(lang, "err.noSource"),
      next: ts(lang, "start.pickSourceFolder"),
      retry: "start.pickAnother",
    },
    "upload-too-large": {
      measured: message || ts(lang, "err.uploadTooLarge"),
      next: t(lang, "cap.hint"),
      retry: "start.retry",
    },
    "rate-limit": {
      measured: message,
      next: t(lang, "limit.waiting"),
      retry: "start.retry",
    },
    "server-down": {
      measured: message || ts(lang, "err.serverDown"),
      next: ts(lang, "err.serverDownHint"),
      retry: "start.retry",
    },
    timeout: {
      measured: message || ts(lang, "err.failed"),
      next: ts(lang, "start.pickAnother"),
      retry: "start.retry",
    },
    "job-gone": {
      measured: message,
      next: ts(lang, "err.jobGone"),
      retry: "start.retry",
    },
    demo: { measured: message, next: ts(lang, "err.serverDownHint"), retry: "start.retry" },
    deadlink: { measured: message, next: ts(lang, "start.pickAnother"), retry: "start.retry" },
    failed: {
      measured: message || ts(lang, "err.failed"),
      next: ts(lang, "start.pickAnother"),
      retry: "start.retry",
    },
  };
  const c = copy[kind];
  return (
    <StartNotice
      lang={lang}
      kind={kind}
      measured={c.measured}
      next={c.next}
      // "Show the server's words" must not open on the reader's own drop
      // tally: a no-source answer has no server sentence behind it.
      raw={kind === "no-source" ? undefined : detail}
      number={
        kind === "cap" && !message.includes(nfLang(lang, foundFiles)) ? foundFiles : undefined
      }
      action={
        <button type="button" className="start-state-action" onClick={onRetry}>
          {ts(lang, c.retry)}
        </button>
      }
    />
  );
}

/* ── Second entry: the cities this machine still knows ─────────────────────
 * `recentCities` owns the list and its key; this is its reader. It used to
 * parse a second key of its own, with a `name` field nothing ever wrote, under
 * a comment that called the section waiting — the writer side had meanwhile
 * landed under the index's own key with `folder`, so the row stayed empty while
 * the index underneath it filled up. */
function RecentCities({ lang }: { lang: Lang }) {
  const [cities] = useState<RecentCity[]>(() => recentCities().slice(0, 6));
  // "I cannot read your history" must not render as "you have no history",
  // and the index used to answer a corrupt file with exactly that silence
  // while the next opened city overwrote it (recentCities.ts:26 — the bytes
  // now stay quarantined under codecity-recent:v1:unreadable). The word goes
  // on this block's own kicker line; an honest empty list stays wordless.
  const [unreadable] = useState(() => recentCitiesRead().state === "unreadable");
  if (cities.length === 0 && !unreadable) return null;
  const now = Date.now();
  const nf = (n: number) => formatCount(lang, n);
  return (
    <nav className="start-recent" aria-label={ts(lang, "landing.recentAria")}>
      <p className="start-kicker">{ts(lang, "landing.recentTitle")}</p>
      {unreadable && (
        <p className="start-kicker" role="alert" data-recent-unreadable="true">
          ⚠ {ts(lang, "landing.recentUnreadable")}
        </p>
      )}
      <ul>
        {cities.map((c) => {
          const mins = Math.max(0, Math.round((now - c.openedAt) / 60000));
          const ago =
            mins < 60
              ? ts(lang, "landing.recentMin", { n: mins })
              : mins < 1440
                ? ts(lang, "landing.recentHour", { n: Math.round(mins / 60) })
                : ts(lang, "landing.recentDay", { n: Math.round(mins / 1440) });
          return (
            <li key={c.id}>
              <a href={`?city=${encodeURIComponent(c.id)}`}>
                <span className="start-recent-name">{c.folder}</span>
                <span className="start-recent-meta">
                  {tsCount(lang, "landing.recentFiles", "landing.recentFilesOne", c.files, {
                    n: nf(c.files),
                  })}
                  {" · "}
                  {ts(lang, "landing.recentAgo", { t: ago })}
                </span>
                <span className="start-recent-open">{ts(lang, "landing.recentOpen")} →</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Landing() {
  const cityData = useStore((s) => s.cityData);
  const isLoading = useStore((s) => s.isLoading);
  const setCityData = useStore((s) => s.setCityData);
  const setAnalysisId = useStore((s) => s.setAnalysisId);
  const scanProfile = useStore((s) => s.scanProfile);
  const lang = useStore((s) => s.prefs.lang);
  const setPref = useStore((s) => s.setPref);
  const firstRun = useStore((s) => s.firstRun);
  // §03.03 + §03.05 — the first-arrival sequence, the reader of `firstRun`
  // (§03.02). A machine that has never shown a city gets two calm beats: a
  // greeting, then a short "how it works". Each beat is one decision and waits
  // for the reader — nothing advances on its own — and neither is a gate: the
  // folder and demo actions below stay reachable, so an experienced reader skips
  // straight past (§03). The durable stamp is written the moment a city arrives,
  // so the sequence never returns once someone has been through the door.
  //
  // §03.08 — the beat itself is remembered, so the sequence is not restarted by a
  // reload: the reader who pressed "Let's start" and lost the tab lands back on
  // the introduction, and the one who skipped is not greeted again. `firstRun`
  // still outranks the record — a machine that has shown a city has finished the
  // introduction whatever the storage says about it.
  // §19.05: the decision itself is `arrivalBeat` — the same function the
  // headless case set drives, so this line cannot drift from its tests.
  const [arrival, setArrival] = useState<ArrivalStage>(() =>
    arrivalBeat({ firstRun, stage: readArrivalStageRead() }),
  );
  const goTo = (stage: ArrivalStage): void => {
    rememberArrivalStage(stage);
    setArrival(stage);
  };
  // §04.02 — the 3D preview is mounted only while it is open, so the start
  // screen keeps its one WebGL context until someone asks to see the figure.
  // §04.11 — the flag lives in the store, because the city opens the same panel
  // from its own menu; two local copies would be two answers to one question.
  const previewOpen = useStore((s) => s.showEpheVitrine);
  const setPreviewOpen = useStore((s) => s.setShowEpheVitrine);
  // §03.07 — Escape ends the introduction from any beat: the keyboard path to
  // the same "Skip" the header button offers, so the guided sequence can be
  // stopped without the mouse (§16.01). Guarded so it never fires while a field
  // has focus, and only while the sequence is actually on screen.
  useEffect(() => {
    if (arrival === "done") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // While the 3D preview is open, Escape belongs to it — one key, one
      // surface closing.
      if (previewOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      goTo("done");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrival, previewOpen]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  // §03.09 — a read this browser left running. Measured (`unterbrechung-messung.json`):
  // the server finishes it — `complete` 4,8 s after a reload — and the city is
  // then one address away, while the returning reader had nothing but the empty
  // start screen. So the record is asked about ONCE, here, and only a city that
  // is really finished is offered. A run still going keeps its record for the
  // next visit rather than being announced as a result it does not have yet; a
  // job the server no longer knows is forgotten. Nothing is polled, and a dead
  // server is not read as a finished run.
  const [resumeId, setResumeId] = useState<string | null>(null);
  useEffect(() => {
    const id = readPendingRun();
    if (!id) return;
    let abandoned = false;
    fetch(`/api/status/${encodeURIComponent(id)}`)
      .then((r) => (r.status === 404 ? "gone" : r.ok ? r.json() : "unknown"))
      .then((d) => {
        if (abandoned) return;
        if (d === "gone") clearPendingRun(id);
        else if (d && typeof d === "object" && (d as { status?: unknown }).status === "complete")
          setResumeId(id);
      })
      .catch(() => {
        // no answer, no claim: the record stays for the next visit
      });
    return () => {
      abandoned = true;
    };
  }, []);
  // §03.10 — the city this machine had open last, measured as the gap: at
  // 1280×800 the "recently opened" row sits 814 px down, below the fold
  // (`zuletzt-messung.json`), so a returning reader reached the generic landing
  // first and their own project only by scrolling. This brings the newest one up
  // to the actions — and only while the server can still be holding it: past its
  // keep time the offer would be a link to a dead link notice, so it stays in
  // the list below, where it reads as history rather than as a way back in.
  const [lastCity] = useState<RecentCity | null>(() => {
    const newest = recentCities()[0];
    return newest && !cityGoneForSure(newest) ? newest : null;
  });
  const prefs = useStore((s) => s.prefs);
  // Passive update note: the BACKEND queries public GitHub releases (cached,
  // anonymous) — the client sends nothing about itself. Dismissal is per
  // version, so the next release notes come through again.
  const [update, setUpdate] = useState<{ latest: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!prefs.updateCheck) return;
    fetch("/api/update/check")
      .then((r) => r.json())
      .then((d: { updateAvailable?: boolean; latest?: string; releaseUrl?: string | null }) => {
        if (
          d.updateAvailable &&
          d.latest &&
          d.latest !== localStorage.getItem("codecity-update-dismissed")
        ) {
          setUpdate({ latest: d.latest, url: d.releaseUrl ?? null });
        }
      })
      .catch(() => {}); // offline: no note, no noise
  }, [prefs.updateCheck]);
  interface Footprint {
    root: string;
    copies: number;
    bytes: number;
    stale: number;
    ttlHours: number;
    offline: boolean;
    approx: boolean;
  }
  const [foot, setFoot] = useState<Footprint | null>(null);
  const [footError, setFootError] = useState(false);
  const [footNote, setFootNote] = useState("");
  const [nameCount, setNameCount] = useState(0);
  /** ...and whether at least one names bucket refused to read (`storageRead.ts` states). */
  const [namesUnreadable, setNamesUnreadable] = useState(false);
  /**
   * How many resident names this browser holds (EPHE-AI EA-03), and whether
   * one of them could not be read. They are the second exception to "nothing
   * is written" — the first is the verdicts — so the disclosure has to count
   * them and a button has to be able to take them back. Read from the buckets
   * themselves through the class reader, not from a counter that could
   * disagree with what is on disk — and not through a `catch` that answered
   * unreadable bytes with "never named": the resident card speaks
   * `resident.namesUnreadable` over the same bucket, and one bucket is not
   * allowed to say two contradictory sentences.
   */
  const countStoredNames = (): { names: number; unreadable: boolean } => {
    let names = 0;
    let unreadable = false;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("codecity-ephe-names:")) continue;
      // The quarantine slot is not a bucket: its bytes are one corrupt
      // bucket's verbatim copy, and counting them again would double what
      // the live key beside it already answered `unreadable` for.
      if (k.endsWith(":unreadable")) continue;
      const read = readStoredJson<Record<string, string>>(k, honouredNames);
      if (read.state === "read") names += Object.keys(read.value).length;
      else if (read.state === "unreadable") unreadable = true;
    }
    return { names, unreadable };
  };
  /** §04.09 — the third bucket the browser holds: one resident's look. */
  const [lookSaved, setLookSaved] = useState(false);
  /** ...and whether that look could be read (`storageRead.ts` states). */
  const [lookUnreadable, setLookUnreadable] = useState(false);
  const readFootprint = async (): Promise<void> => {
    try {
      const res = await fetch("/api/footprint");
      if (!res.ok) throw new Error(String(res.status));
      setFoot((await res.json()) as Footprint);
      const names = countStoredNames();
      setNameCount(names.names);
      setNamesUnreadable(names.unreadable);
      setLookSaved(hasStoredLook());
      // "a key exists" and "the look can be read" are different questions;
      // the reset door needs the first, the reader deserves the second.
      setLookUnreadable(readEpheLookRead().state === "unreadable");
      setFootError(false);
    } catch {
      setFootError(true);
    }
  };
  useEffect(() => {
    void readFootprint();
  }, []);
  const bytesOf = (n: number): string =>
    n >= 1024 * 1024
      ? `${formatDecimal(lang, n / (1024 * 1024))} MB`
      : `${formatCount(lang, Math.round(n / 1024))} KB`;
  const purgeFootprint = async (): Promise<void> => {
    setFootNote("");
    try {
      const res = await fetch("/api/footprint/purge", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { removed: number; bytesFreed: number };
      setFootNote(
        tsCount(lang, "landing.footprintPurged", "landing.footprintPurgedOne", d.removed, {
          n: d.removed,
          bytes: bytesOf(d.bytesFreed),
        }),
      );
      await readFootprint();
    } catch {
      setFootError(true);
    }
  };
  const resetVerdicts = async (): Promise<void> => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("codecity-reviews:"));
    for (const k of keys) localStorage.removeItem(k);
    // The machine copy is the second home of the same verdicts: deleting only
    // the browser buckets would let the next scan resurrect what the person
    // just deleted. The button's label names the browser buckets it removed —
    // it does more than it says, never less.
    // The more can refuse twice: the session knows the copy reads unreadable
    // (no POST is asked), or the store itself says so over bytes it cannot
    // list (503) — a fresh page that never read anything is not wiser than a
    // seasoned one. Either way the sentence follows the answer, because
    // "removed" alone would report a deletion the machine copy never got.
    const machineDoorUsed = await resetBackendVerdicts();
    const oneBucket = keys.length === 1;
    setFootNote(
      ts(
        lang,
        machineDoorUsed
          ? oneBucket
            ? "landing.footprintResetDoneOne"
            : "landing.footprintResetDone"
          : oneBucket
            ? "landing.footprintResetRefusedOne"
            : "landing.footprintResetRefused",
        { n: keys.length },
      ),
    );
  };

  const resetNames = (): void => {
    // Auftrag #22, decided: the sweep takes the unreadable bucket with it —
    // the loop below deletes every key of the prefix, the quarantine slot
    // included. The reader asked for what this browser saves of this class,
    // and corrupt names bytes ARE that; leaving them behind would let the
    // door undo half its own label and strand the warn line over bytes no
    // other surface can clear. The honest half of the deal is the done line:
    // it counts what a count can reach — the readable names as a number, the
    // unreadable rest as a word, never an invented sum (storageRead.ts class
    // law: unreadable is not the same as empty, and not the same as either).
    const names = countStoredNames();
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("codecity-ephe-names:")) localStorage.removeItem(k);
    }
    // The screen's copy goes too, so the number on the line and the map the
    // card reads agree the moment the button was pressed.
    useStore.setState({ residentNames: {}, residentNamesBlocked: false });
    setNameCount(0);
    setNamesUnreadable(false);
    setFootNote(
      names.unreadable
        ? ts(lang, "landing.footprintNamesDoneUnreadable", { n: names.names })
        : ts(
            lang,
            names.names === 1 ? "landing.footprintNamesDoneOne" : "landing.footprintNamesDone",
            { n: names.names },
          ),
    );
  };

  /** §04.09 — the look goes back to the shipped figure, jacket and mark alike. */
  const resetLook = (): void => {
    clearEpheLook();
    setLookSaved(false);
    // The live key is gone; what remains is only the quarantined copy of
    // bytes that once refused to read — the line above says "none" again.
    setLookUnreadable(false);
    setFootNote(ts(lang, "landing.footprintLookDone"));
  };

  const {
    state,
    errorMessage,
    errorDetail,
    notice,
    analysisProgress,
    analysisStage,
    collected,
    foundFiles,
    elapsedSec,
    budgetWaitSec,
    stages,
    pickFolder,
    openAlternativePicker,
    canUseAlternativePicker,
    cancel,
    isPicking,
    isAnalyzing,
  } = useLocalAnalysis();
  const [cancelledAt, setCancelledAt] = useState(0);
  const [noticeSeen, setNoticeSeen] = useState(false);
  useEffect(() => {
    if (notice) setNoticeSeen(true);
  }, [notice]);
  // The "cancelled — nothing continues" note has no server behind it: it is
  // shown for a beat, then the landing is simply the landing again.
  useEffect(() => {
    if (cancelledAt === 0) return;
    const id = setTimeout(() => setCancelledAt(0), 8000);
    return () => clearTimeout(id);
  }, [cancelledAt]);
  if (cityData || isLoading) return null;

  const loadDemo = async (): Promise<void> => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const res = await fetch("/api/cities/default");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CityData;
      setCityData(data);
      // The demo is a scan the local backend holds like any other: without its
      // id the report exports and the city link stayed greyed out here, while
      // reloading the same ?city=demo-001 address gave them. Provenance only —
      // verdicts are keyed by project, not by this id.
      setAnalysisId(data.analysisId ?? null);
    } catch {
      setDemoError(t(lang, "landing.demoError"));
    } finally {
      setDemoLoading(false);
    }
  };
  const isCollecting = state === "collecting";
  const profileName = t(
    lang,
    SCAN_PROFILES.find((profile) => profile.id === scanProfile)?.label ?? "profile.standard",
  );
  const error = demoError || (state === "error" ? errorMessage : "");
  const demoFailed = demoError !== "";

  return (
    <main className="landing-shell start-v2">
      <header className="landing-header">
        <a href="/" className="landing-brand" aria-label={t(lang, "landing.homeAria")}>
          <BrandWordmark />
          <span>Skyline</span>
        </a>
        <div className="flex items-center gap-4">
          {/* §03.11 — the introduction can be asked for again. Nothing else in
              the app offers it: `firstRun` decides the sequence silently, and the
              dock's "First look" switches the in-city coach marks, not this.
              Shown only while the sequence is off screen, so there is never a
              second way into a guide that is already being shown, and pressing
              it is the only thing that opens it. */}
          {arrival === "done" && (
            <button type="button" className="start-replay" onClick={() => goTo("welcome")}>
              {t(lang, "landing.replayIntro")}
            </button>
          )}
          <span className="local-badge" title={t(lang, "landing.localBadgeNote")}>
            <span aria-hidden="true" />
            {t(lang, "landing.localBadge")}
          </span>
          <LangSwitch lang={lang} onPick={(next) => setPref("lang", next)} />
        </div>
      </header>
      {update && (
        <div role="status" className="landing-update-banner">
          <span>{t(lang, "update.available", { version: update.latest })}</span>
          {update.url && (
            <a href={update.url} target="_blank" rel="noreferrer">
              {t(lang, "update.whatsNew")} ↗
            </a>
          )}
          <button
            onClick={() => {
              localStorage.setItem("codecity-update-dismissed", update.latest);
              setUpdate(null);
            }}
            aria-label={t(lang, "landing.dismissNoteAria")}
          >
            ✕
          </button>
        </div>
      )}
      <div className="landing-main">
        {arrival !== "done" && (
          <ArrivalProgress lang={lang} stage={arrival} onSkip={() => goTo("done")} />
        )}
        {arrival === "welcome" && (
          <section
            className="landing-welcome"
            role="region"
            aria-label={t(lang, "landing.welcomeAria")}
          >
            <h2 className="landing-welcome-title">{t(lang, "landing.welcomeTitle")}</h2>
            <p className="landing-welcome-body">{t(lang, "landing.welcomeBody")}</p>
            <button type="button" className="landing-welcome-begin" onClick={() => goTo("intro")}>
              {t(lang, "landing.welcomeBegin")}
            </button>
          </section>
        )}
        {arrival === "intro" && (
          <section
            className="landing-guide"
            role="region"
            aria-label={t(lang, "landing.guideAria")}
          >
            <h2 className="landing-guide-title">{t(lang, "landing.guideTitle")}</h2>
            <ol className="landing-guide-steps">
              <li>{t(lang, "landing.guideStep1")}</li>
              <li>{t(lang, "landing.guideStep2")}</li>
              <li>{t(lang, "landing.guideStep3")}</li>
            </ol>
            <div className="landing-guide-actions">
              <button type="button" className="landing-guide-back" onClick={() => goTo("welcome")}>
                ← {t(lang, "landing.guideBack")}
              </button>
              <button type="button" className="landing-welcome-begin" onClick={() => goTo("done")}>
                {t(lang, "landing.guideContinue")}
              </button>
            </div>
          </section>
        )}
        <section className="landing-intro" aria-labelledby="landing-title">
          <p className="landing-category">
            <span aria-hidden="true" className="landing-category-tick" />
            {t(lang, "landing.category")}
          </p>
          <h1 id="landing-title">
            {t(lang, "landing.h1a")}
            <br />
            {t(lang, "landing.h1b")}
          </h1>
          <p className="landing-description">{t(lang, "landing.description")}</p>
          <div className="landing-actions">
            <button
              onClick={pickFolder}
              disabled={isAnalyzing || demoLoading}
              aria-busy={isAnalyzing}
              aria-describedby={error ? "landing-error" : "local-note"}
              className="primary-button"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3Z" />
                <path d="M3 10h18" />
              </svg>
              {isPicking
                ? t(lang, "picker.waiting")
                : isCollecting
                  ? t(lang, "landing.primaryCollecting")
                  : isAnalyzing
                    ? t(lang, "landing.primaryAnalyzing")
                    : t(lang, "landing.primary")}
            </button>
            <button
              onClick={loadDemo}
              disabled={demoLoading || isAnalyzing}
              aria-busy={demoLoading}
              className="secondary-button"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m7 4 9 6-9 6Z" />
              </svg>
              {demoLoading ? t(lang, "landing.secondaryLoading") : t(lang, "landing.secondary")}
            </button>
          </div>
          {/* One offer line, one way back into a city: what finished in the
              reader's absence comes first (§03.09), the last opened city second
              (§03.10). Both are the same shape on purpose — see `.landing-resume`
              in start.css. */}
          {(resumeId || lastCity) && (
            <div className="landing-resume">
              {resumeId ? (
                <>
                  <span className="landing-resume-body">{t(lang, "landing.resumeBody")}</span>
                  <a
                    className="landing-resume-open"
                    href={`?city=${encodeURIComponent(resumeId)}`}
                    onClick={() => clearPendingRun(resumeId)}
                  >
                    {t(lang, "landing.resumeOpen")} →
                  </a>
                </>
              ) : (
                <>
                  <span className="landing-resume-body">
                    {t(lang, "landing.lastBody", { folder: lastCity!.folder })}
                  </span>
                  <a
                    className="landing-resume-open"
                    href={`?city=${encodeURIComponent(lastCity!.id)}`}
                  >
                    {t(lang, "landing.lastOpen")} →
                  </a>
                </>
              )}
            </div>
          )}
          {isPicking && (
            <div className="mt-3">
              <p id="picker-status" role="status" className="start-state-next">
                {notice || t(lang, "picker.waiting")}
              </p>
              <div className="start-state-actions">
                {canUseAlternativePicker && (
                  <button
                    type="button"
                    className="start-state-action"
                    aria-describedby="picker-status"
                    onClick={openAlternativePicker}
                  >
                    {t(lang, "picker.alternative")}
                  </button>
                )}
                <button type="button" className="start-cancel" onClick={cancel}>
                  {t(lang, "landing.cancel")}
                </button>
              </div>
            </div>
          )}
          <div className="landing-assure">
            <p id="local-note" className="landing-privacy">
              {t(lang, "landing.privacy")}
            </p>
            <details className="landing-network">
              <summary>{t(lang, "landing.networkToggle")}</summary>
              <p className="landing-network-lead">{t(lang, "landing.networkLead")}</p>
              <ul className="landing-network-list">
                {OUTBOUND_CALLS.map((call) => {
                  const copy = lang === "de" ? call.de : call;
                  return (
                    <li key={`${call.host}|${call.by}`}>
                      <code className="font-jetbrains">{call.host}</code> — {copy.what}
                      <span className="landing-network-meta">
                        {t(lang, "landing.networkMadeBy")}: {copy.by} ·{" "}
                        {t(lang, "landing.networkWhen")}: {copy.when}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="landing-network-lead">
                <code className="font-jetbrains">SKYLINE_OFFLINE=1</code>{" "}
                {t(lang, "landing.networkOfflineSuffix")}
              </p>
              <div className="landing-footprint">
                <p className="landing-network-lead">{t(lang, "landing.footprintLead")}</p>
                {footError && (
                  <p className="landing-network-meta" role="status">
                    {t(lang, "landing.footprintError")}
                  </p>
                )}
                {foot && (
                  <>
                    <p className="landing-network-meta">
                      {t(lang, "landing.footprintPath")}{" "}
                      <code className="font-jetbrains">{foot.root}</code>
                    </p>
                    <p role="status" className="landing-footprint-count">
                      {foot.copies === 0
                        ? t(lang, "landing.footprintNone")
                        : tsCount(
                            lang,
                            "landing.footprintCopies",
                            "landing.footprintCopiesOne",
                            foot.copies,
                            {
                              n: foot.copies,
                              bytes:
                                bytesOf(foot.bytes) +
                                (foot.approx ? " " + t(lang, "landing.footprintApprox") : ""),
                              h: foot.ttlHours,
                            },
                          )}
                      {foot.stale > 0 && (
                        <span className="landing-footprint-stale">
                          {" · "}
                          {t(lang, "landing.footprintStale", { n: foot.stale })}
                        </span>
                      )}
                    </p>
                  </>
                )}
                {(nameCount > 0 || !namesUnreadable) && (
                  <p role="status" className="landing-footprint-count">
                    {nameCount === 0
                      ? t(lang, "landing.footprintNamesNone")
                      : t(
                          lang,
                          nameCount === 1 ? "landing.footprintNamesOne" : "landing.footprintNames",
                          { n: formatCount(lang, nameCount) },
                        )}
                  </p>
                )}
                {/* The third state of the line above, drawn as the look line's
                    sibling below draws its own: a bucket that refuses to
                    parse is NOT "no resident names saved yet" — the resident
                    card already speaks over these bytes, and one bucket must
                    not say two contradictory sentences. The number counts
                    only the readable part; the word names the rest. Words
                    and glyph, never colour alone. */}
                {namesUnreadable && (
                  <p className="landing-network-meta" role="alert" data-names-unreadable="true">
                    ⚠ {t(lang, "landing.footprintNamesUnreadable")}
                  </p>
                )}
                {/* §04.09 — the third thing this browser keeps. One small object,
                    but a disclosure that lists two of three is a promise with a
                    hole in it, which is the reason this line exists. */}
                <p role="status" className="landing-footprint-count">
                  {t(lang, lookSaved ? "landing.footprintLook" : "landing.footprintLookNone")}
                </p>
                {/* A key that exists and cannot be read is the one state the
                    line above cannot tell apart — the figure wears the
                    shipped look, which is NOT the same as never having
                    chosen. Words and glyph, never colour alone. */}
                {lookUnreadable && (
                  <p className="landing-network-meta" role="alert" data-look-unreadable="true">
                    ⚠ {t(lang, "landing.lookUnreadable")}
                  </p>
                )}
                <div className="landing-footprint-actions">
                  <button type="button" className="btn-ghost" onClick={() => void readFootprint()}>
                    {t(lang, "landing.footprintRefresh")}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void purgeFootprint()}
                    disabled={!foot || foot.stale === 0}
                  >
                    {t(lang, "landing.footprintPurge")}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void resetVerdicts()}>
                    {t(lang, "landing.footprintReset")}
                  </button>
                  {/* Auftrag #22: the door opens whenever ANYTHING of this
                      class is there — readable names, or bytes that refuse to
                      read. A corrupt bucket counted zero and kept the one
                      button that could clear it shut, over exactly the bytes
                      an owner most needs to sweep. */}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={resetNames}
                    disabled={nameCount === 0 && !namesUnreadable}
                  >
                    {t(lang, "landing.footprintResetNames")}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={resetLook}
                    disabled={!lookSaved}
                  >
                    {t(lang, "landing.footprintResetLook")}
                  </button>
                </div>
                {footNote && (
                  <p className="landing-network-meta" role="status">
                    {footNote}
                  </p>
                )}
              </div>
            </details>
          </div>
          {!error && footError && (
            // R1-15: with the backend dead this page stayed fully optimistic —
            // even "RECENTLY OPENED … Open again →" — and the only trace was
            // two console 502s, although the footprint read above already
            // calls the server within a second. The failure is now named here,
            // in the existing server-down copy, with the command that fixes it.
            <div id="landing-server-down" role="status">
              <StartNotice
                lang={lang}
                kind="server-down"
                measured={ts(lang, "err.serverDown")}
                next={ts(lang, "err.serverDownHint")}
              />
            </div>
          )}
          {error && (
            <div id="landing-error">
              {demoFailed ? (
                <StartNotice
                  lang={lang}
                  kind="demo"
                  measured={error}
                  next={ts(lang, "err.serverDownHint")}
                />
              ) : (
                <ScanErrorCard
                  lang={lang}
                  message={error}
                  detail={errorDetail}
                  foundFiles={foundFiles}
                  onRetry={pickFolder}
                />
              )}
            </div>
          )}
          {isAnalyzing && !isPicking && (
            <ScanProgress
              lang={lang}
              collecting={isCollecting}
              stageLine={analysisStage}
              progress={analysisProgress}
              collected={collected}
              elapsedSec={elapsedSec}
              budgetWaitSec={budgetWaitSec}
              stages={stages}
              onCancel={() => {
                setCancelledAt(Date.now());
                cancel();
              }}
            />
          )}
          {/* One line for one fact: the hook's own notice wins, and the local
              note only covers the beat before it arrives. */}
          {!isAnalyzing && (notice || (cancelledAt > 0 && !noticeSeen)) && (
            <p className="start-cancelled" role="status">
              {notice || t(lang, "scan.cancelled")}
            </p>
          )}
          {!isAnalyzing && (
            <details className="scan-settings">
              <summary>
                <span>
                  {t(lang, "landing.scanSettings")} <strong>{profileName}</strong>
                  <span className="sr-only"> {t(lang, "landing.scanSettingsHint")}</span>
                </span>
                <span className="settings-chevron" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <div className="scan-settings-content">
                <p>{t(lang, "landing.scanDepth")}</p>
                <ProfileChips variant="landing" />
                <ScanExcludes lang={lang} />
              </div>
            </details>
          )}
        </section>
        <div className="landing-visual">
          <EphePortrait lang={lang} />
          {/* §04.02 — the portrait is a drawing of the figure; this opens the
              figure itself, in the city's own light, for as long as it is open. */}
          <button type="button" className="start-ephe-open" onClick={() => setPreviewOpen(true)}>
            {t(lang, "landing.previewOpen")}
          </button>
          <CityIllustration lang={lang} />
        </div>
      </div>
      {previewOpen && <EphePreview lang={lang} onClose={() => setPreviewOpen(false)} />}
      <RecentCities lang={lang} />
      <footer className="landing-footer">
        <span>{t(lang, "landing.footer1")}</span>
        <span>{t(lang, "landing.footer2")}</span>
      </footer>
    </main>
  );
}
