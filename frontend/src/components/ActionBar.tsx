import { useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent } from "react";
import { useStore } from "../stores/useStore";
import { useTestRunner } from "../hooks/useTestRunner";
import { t } from "../i18n";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: string;
  active?: boolean;
}

function ActionButton({ label, icon, active, ...props }: ActionButtonProps) {
  return (
    <button
      {...props}
      type="button"
      className="action-button flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        color: active ? "#fff2e9" : "#dedbd3",
        background: active ? "rgba(232,80,60,0.18)" : undefined,
        border: `1px solid ${active ? "rgba(232,80,60,0.4)" : "transparent"}`,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function ActionBar() {
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const constructionDone = useStore((s) => s.constructionDone);
  const constructionTotal = useStore((s) => s.constructionTotal);
  const focusPath = useStore((s) => s.focusPath);
  const startTour = useStore((s) => s.startTour);
  const tourActive = useStore((s) => s.tourActive);
  const resetFocus = useStore((s) => s.resetFocus);
  const showFindings = useStore((s) => s.showFindings);
  const setShowFindings = useStore((s) => s.setShowFindings);
  const analysisId = useStore((s) => s.analysisId);
  const testRun = useStore((s) => s.testRun);
  const lang = useStore((s) => s.prefs.lang);
  const gfxLite = useStore((s) => s.prefs.gfxLite);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const setPref = useStore((s) => s.setPref);
  const triageActive = useStore((s) => s.triageActive);
  const triageCursor = useStore((s) => s.triageCursor);
  const triageTotal = useStore((s) => s.triageTotal);
  const startTriage = useStore((s) => s.startTriage);
  const nextTriage = useStore((s) => s.nextTriage);
  const prevTriage = useStore((s) => s.prevTriage);
  const endTriage = useStore((s) => s.endTriage);
  const { runTests } = useTestRunner();
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!moreRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (!cityData) return null;

  const findings = cityData.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;
  const constructing = buildPhase === "constructing";
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;
  const testing = testRun.status === "installing" || testRun.status === "running";

  const closeMenu = (): void => {
    setMenuOpen(false);
    moreButtonRef.current?.focus();
  };

  const handleFindings = (): void => {
    const state = useStore.getState();
    // On small screens, file details cover the list. Reopen the list even if
    // its stored state is already open beneath the selected file.
    if (window.matchMedia?.("(max-width: 760px)").matches && state.selectedUnit?.kind === "file") {
      state.setSelectedUnit(null);
      setShowFindings(true);
      return;
    }
    setShowFindings(!showFindings);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const handleShare = async (): Promise<void> => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setFeedback({ message: t(lang, "actions.linkCopied") });
    } catch {
      setFeedback({ message: t(lang, "actions.linkCopyFailed"), error: true });
    }
  };

  const handleScreenshot = (): void => {
    closeMenu();
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      setFeedback({ message: t(lang, "actions.exportNoCanvas"), error: true });
      return;
    }
    try {
      const url = canvas.toDataURL("image/png");
      if (url === "data:,") throw new Error("Empty canvas");
      const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replaceAll(":", "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `ephemora-${cityData.repo.name}-${stamp}.png`;
      a.click();
      setFeedback({ message: t(lang, "actions.exportStarted") });
    } catch {
      setFeedback({ message: t(lang, "actions.exportFailed"), error: true });
    }
  };

  const statusMessage = feedback?.message ?? (testRun.status !== "idle" ? testRun.stage : null);
  const statusError = feedback ? feedback.error === true : testRun.status === "failed";

  return (
    <div
      className="action-dock absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 pointer-events-auto"
      style={{ maxWidth: "calc(100vw - 24px)" }}
    >
      {constructing && (
        <div
          className="w-full rounded-lg px-4 py-3 text-xs"
          style={{ background: "#20201e", border: "1px solid #41413a" }}
          role="status"
        >
          <div
            className="mb-2 flex items-center justify-between gap-4"
            style={{ color: "#dedbd3" }}
          >
            <span className="min-w-0 break-all">
              {t(lang, "actions.building", {
                name:
                  focusPath.length > 0 ? `/${focusPath.join("/")}` : t(lang, "actions.yourCity"),
              })}
            </span>
            <span className="shrink-0 tabular-nums">
              {constructionDone}/{constructionTotal}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full" style={{ background: "#3c3c35" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: "#e8503c" }}
            />
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed"
          style={{
            color: statusError ? "#ffb5a9" : "#dedbd3",
            background: "#20201e",
            border: `1px solid ${statusError ? "#88483d" : "#41413a"}`,
          }}
          role={statusError ? "alert" : "status"}
        >
          <span className="flex-1">{statusMessage}</span>
          {feedback && (
            <button
              type="button"
              aria-label={t(lang, "actions.dismissAria")}
              onClick={() => setFeedback(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-white/10"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div
        className="action-dock-row flex flex-wrap items-center justify-center gap-1 rounded-xl p-1.5"
        aria-label={t(lang, "actions.cityActionsAria")}
        style={{
          background: "rgba(32,32,30,0.96)",
          border: "1px solid rgba(242,239,232,0.15)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.3)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Triage — the primary queue. While it runs the dock becomes a
            stepper: prev position next exit, one finding at a time. */}
        {triageActive ? (
          <div
            role="group"
            aria-label={`${t(lang, "actions.finding")} ${triageCursor + 1} ${t(lang, "actions.of")} ${triageTotal}`}
            className="flex min-h-10 items-center gap-0.5 rounded-lg px-1.5"
            style={{
              background: "rgba(232,80,60,0.14)",
              border: "1px solid rgba(232,80,60,0.4)",
            }}
          >
            <button
              type="button"
              onClick={prevTriage}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-white/10"
              style={{ color: "#fff2e9", whiteSpace: "nowrap" }}
            >
              <span aria-hidden="true">‹</span>
              {t(lang, "actions.prev")}
            </button>
            <span
              className="shrink-0 px-1 font-mono text-xs tabular-nums"
              style={{ color: "#dedbd3" }}
            >
              {triageCursor + 1} / {triageTotal}
            </span>
            <button
              type="button"
              onClick={nextTriage}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-white/10"
              style={{ color: "#fff2e9", whiteSpace: "nowrap" }}
            >
              {t(lang, "actions.next")}
              <span aria-hidden="true">›</span>
            </button>
            <button
              type="button"
              onClick={endTriage}
              className="flex h-8 items-center rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-white/10"
              style={{ color: "#dedbd3", whiteSpace: "nowrap" }}
            >
              {t(lang, "actions.exit")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startTriage}
            disabled={totalFindings === 0}
            title={t(lang, "actions.triageStartAria")}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              color: "#fff2e9",
              background: "rgba(232,80,60,0.14)",
              border: "1px solid rgba(232,80,60,0.4)",
              whiteSpace: "nowrap",
            }}
          >
            {t(lang, "actions.triage")}
            <span aria-hidden="true">▶</span>
          </button>
        )}

        <ActionButton
          onClick={startTour}
          disabled={tourActive || totalFindings === 0}
          label={tourActive ? t(lang, "actions.tourActive") : t(lang, "actions.tour")}
          icon="⚑"
          title={
            totalFindings === 0 ? t(lang, "actions.tourEmptyTitle") : t(lang, "actions.tourTitle")
          }
          active={tourActive}
        />
        <ActionButton
          onClick={handleFindings}
          label={t(lang, "actions.findings", { count: totalFindings })}
          icon="≡"
          title={t(lang, "actions.findingsTitle")}
          aria-pressed={showFindings}
          aria-controls="findings-panel"
          active={showFindings}
        />
        <ActionButton
          onClick={resetFocus}
          label={t(lang, "actions.overview")}
          icon="⌂"
          title={t(lang, "actions.overviewTitle")}
        />
        <div className="relative" ref={moreRef}>
          <button
            ref={moreButtonRef}
            id="city-more-button"
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? "city-more-menu" : undefined}
            onClick={() => setMenuOpen(!menuOpen)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen(true);
              }
            }}
            className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium hover:bg-white/5"
            style={{
              color: menuOpen ? "#f2efe8" : "#bebbb2",
              background: menuOpen ? "rgba(255,255,255,0.07)" : undefined,
            }}
          >
            <span aria-hidden="true">•••</span> {t(lang, "actions.more")}
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              id="city-more-menu"
              role="menu"
              aria-labelledby="city-more-button"
              onKeyDown={onMenuKeyDown}
              className="action-secondary-menu absolute bottom-full right-0 mb-3 w-64 rounded-xl p-2 text-[13px]"
              style={{
                background: "#20201e",
                border: "1px solid #44443d",
                boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
                color: "#f2efe8",
              }}
            >
              <button
                role="menuitem"
                type="button"
                disabled={testing || !analysisId}
                onClick={() => {
                  closeMenu();
                  setFeedback(null);
                  void runTests();
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5 disabled:opacity-40"
                title={
                  !analysisId
                    ? t(lang, "actions.runTestsNoScanTitle")
                    : t(lang, "actions.runTestsTitle")
                }
              >
                <span aria-hidden="true">▷</span>
                {testing ? t(lang, "actions.testsRunning") : t(lang, "actions.runTests")}
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={handleScreenshot}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
              >
                <span aria-hidden="true">↓</span>
                {t(lang, "actions.exportPng")}
              </button>
              {/* Display preference, not a scan action: it sits before the
                  final "Copy city link" item so End keeps landing on the
                  share action and the scan actions stay grouped on top. */}
              <button
                role="menuitemcheckbox"
                type="button"
                aria-checked={gfxLite}
                onClick={() => setPref("gfxLite", !gfxLite)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
              >
                <span aria-hidden="true">{gfxLite ? "◉" : "○"}</span>
                {t(lang, "actions.reduceEffects")}
              </button>
              <button
                role="menuitemcheckbox"
                type="button"
                aria-checked={colorblind}
                onClick={() => setPref("colorblind", !colorblind)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
              >
                <span aria-hidden="true">{colorblind ? "◉" : "○"}</span>
                {t(lang, "actions.colorblindPalette")}
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={async () => {
                  try {
                    const r = await fetch("/api/update/check");
                    const d = (await r.json()) as {
                      updateAvailable?: boolean;
                      latest?: string | null;
                      current?: string;
                      offline?: boolean;
                    };
                    setFeedback({
                      message: d.updateAvailable
                        ? t(lang, "update.available", { version: d.latest ?? "" })
                        : d.offline
                          ? t(lang, "update.unavailable")
                          : t(lang, "update.upToDate", { version: d.current ?? "" }),
                      error: !!d.offline,
                    });
                  } catch {
                    setFeedback({ message: t(lang, "update.unavailable"), error: true });
                  }
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
              >
                <span aria-hidden="true">↻</span>
                {t(lang, "update.check")}
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={!analysisId}
                onClick={() => void handleShare()}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                title={
                  !analysisId
                    ? t(lang, "actions.copyLinkNoScanTitle")
                    : t(lang, "actions.copyLinkTitle")
                }
              >
                <span aria-hidden="true">⎘</span>
                {t(lang, "actions.copyLink")}
              </button>
              {!analysisId && (
                <p
                  className="mx-3 mb-1 mt-2 border-t border-white/10 pt-3 text-xs leading-relaxed"
                  style={{ color: "#aaa79e" }}
                >
                  {t(lang, "actions.shareNote")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
