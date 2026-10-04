import { Fragment, useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { ProfileChips } from "./ProfileChips";
import { SCAN_PROFILES } from "../config/scanProfiles";
import { t, type Lang } from "../i18n";

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
      className="flex items-center gap-1 font-jetbrains text-[11px] tracking-wider"
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
            className="rounded px-1.5 py-0.5 transition-colors hover:text-[#f2efe8] focus:outline-none focus:ring-1 focus:ring-[#e8b23c]"
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
      <svg viewBox="0 0 560 490" role="img" aria-labelledby="city-diagram-title city-diagram-desc">
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
    </figure>
  );
}

export function Landing() {
  const cityData = useStore((s) => s.cityData);
  const isLoading = useStore((s) => s.isLoading);
  const setCityData = useStore((s) => s.setCityData);
  const scanProfile = useStore((s) => s.scanProfile);
  const lang = useStore((s) => s.prefs.lang);
  const setPref = useStore((s) => s.setPref);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
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
  const {
    state,
    errorMessage,
    analysisProgress,
    analysisStage,
    collected,
    pickFolder,
    cancel,
    isAnalyzing,
  } = useLocalAnalysis();
  if (cityData || isLoading) return null;

  const loadDemo = async (): Promise<void> => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const res = await fetch("/api/cities/default");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCityData(await res.json());
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

  return (
    <main className="landing-shell">
      <header className="landing-header">
        <a href="/" className="landing-brand" aria-label={t(lang, "landing.homeAria")}>
          <BrandWordmark />
          <span>Skyline</span>
        </a>
        <div className="flex items-center gap-4">
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
        <section className="landing-intro" aria-labelledby="landing-title">
          <p className="landing-category">{t(lang, "landing.category")}</p>
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
              {isCollecting
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
          <p id="local-note" className="landing-privacy">
            {t(lang, "landing.privacy")}
          </p>
          {error && (
            <div id="landing-error" role="alert" className="landing-error">
              {error}
            </div>
          )}
          {isAnalyzing && (
            <div className="landing-progress">
              <div role="status">
                <span>
                  {isCollecting
                    ? t(lang, "landing.progressCollecting", { count: collected.files })
                    : analysisStage || t(lang, "landing.progressReady")}
                </span>
                <span>{!isCollecting && `${analysisProgress}%`}</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={t(lang, "landing.progressAria")}
                aria-valuenow={isCollecting ? undefined : analysisProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: isCollecting ? "30%" : `${analysisProgress}%` }} />
              </div>
              <button onClick={cancel} className="text-button">
                {t(lang, "landing.cancel")}
              </button>
            </div>
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
              </div>
            </details>
          )}
        </section>
        <CityIllustration lang={lang} />
      </div>
      <footer className="landing-footer">
        <span>{t(lang, "landing.footer1")}</span>
        <span>{t(lang, "landing.footer2")}</span>
      </footer>
    </main>
  );
}
