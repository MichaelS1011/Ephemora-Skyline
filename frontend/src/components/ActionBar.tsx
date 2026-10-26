import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  cityOnDisk,
  nextOpenTriageIndex,
  openTriageCount,
  triageList,
  useStore,
} from "../stores/useStore";
import { useOrigin } from "../stores/useOrigin";
import { useTestRunner } from "../hooks/useTestRunner";
import { t } from "../i18n";
import { cityLinkNotice } from "../cityLifetime";
import { openStudio } from "../share/studioBus";
import { tx } from "../share/fallbackCopy";
import { useCompactChrome } from "../hooks/useCompactChrome";
import { severityTotal } from "../city/facts";
import { systemAdoption } from "../prefs";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** A visible second line that says what the verb does, not what it is called. */
  hint?: string;
  icon: string;
  active?: boolean;
  /** Why the button is blocked. "Already running" is said by the label itself,
   *  so it needs no mark; "nothing to do right now" is struck through. */
  running?: boolean;
}

/** The mark a blocked control carries instead of a dimmed tone. Dimming these
 *  labels to 0,4 put them at 2,90—3,37:1 on the dock's own field, under the
 *  floor `tests/glas-chrome.test.ts` holds the fixed shell to; the strike is
 *  drawn in the label's own ink and `aria-disabled` / `disabled` still says the
 *  state to a reading system. */
const struck = (unavailable: boolean): CSSProperties | undefined =>
  unavailable ? { textDecoration: "line-through" } : undefined;

function ActionButton({
  label,
  hint,
  icon,
  active,
  running,
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      className="action-button flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-white/5 disabled:cursor-not-allowed"
      style={{
        color: active ? "#fff2e9" : "#dedbd3",
        background: active ? "rgba(232,80,60,0.18)" : undefined,
        border: `1px solid ${active ? "rgba(232,80,60,0.4)" : "transparent"}`,
        whiteSpace: "nowrap",
        ...struck(disabled === true && !running),
      }}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {icon}
      </span>
      <span className="action-copy">
        <span>{label}</span>
        {hint && (
          <span className="action-hint" aria-hidden="true">
            {hint}
          </span>
        )}
      </span>
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
  // §04.11 — restyling a resident the reader already named. The vitrine is the
  // one surface where a jacket is a figure rather than 16 pixels, and the
  // resident card must not grow a second verb to reach it, so the way in is the
  // menu that already holds everything else that is asked for by name.
  const setShowEpheVitrine = useStore((s) => s.setShowEpheVitrine);
  const showFindings = useStore((s) => s.showFindings);
  const setShowFindings = useStore((s) => s.setShowFindings);
  const analysisId = useStore((s) => s.analysisId);
  const testRun = useStore((s) => s.testRun);
  const lang = useStore((s) => s.prefs.lang);
  const compact = useCompactChrome();
  const gfxLite = useStore((s) => s.prefs.gfxLite);
  const updateCheck = useStore((s) => s.prefs.updateCheck);
  const toggleUpdateCheck = useStore((s) => s.toggleUpdateCheck);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const setPref = useStore((s) => s.setPref);
  const triageActive = useStore((s) => s.triageActive);
  const triageCursor = useStore((s) => s.triageCursor);
  const triageTotal = useStore((s) => s.triageTotal);
  const startTriage = useStore((s) => s.startTriage);
  const nextTriage = useStore((s) => s.nextTriage);
  const prevTriage = useStore((s) => s.prevTriage);
  const endTriage = useStore((s) => s.endTriage);
  const reviews = useStore((s) => s.reviews);
  const threatFilter = useStore((s) => s.threatFilter);
  const ruleFilter = useStore((s) => s.ruleFilter);
  // The arrival budget: these six surfaces no longer paint themselves when a
  // city arrives, and this menu is where each one is asked back by name.
  const showLegend = useStore((s) => s.showLegend);
  const setShowLegend = useStore((s) => s.setShowLegend);
  const showMinimap = useStore((s) => s.showMinimap);
  const setShowMinimap = useStore((s) => s.setShowMinimap);
  const showHeat = useStore((s) => s.showHeat);
  const setShowHeat = useStore((s) => s.setShowHeat);
  const showPrimer = useStore((s) => s.showPrimer);
  const setShowPrimer = useStore((s) => s.setShowPrimer);
  const showShortcuts = useStore((s) => s.showShortcuts);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);
  const cityOnly = useStore((s) => s.cityOnly);
  const setCityOnly = useStore((s) => s.setCityOnly);
  const requestResidentCall = useStore((s) => s.requestResidentCall);
  const { runTests } = useTestRunner();
  const standalone = useOrigin((s) => s.origin) === "file";
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  /** The next menu opening starts the caret inside the Access section — the
   *  Z binding asks for it, the pointer does not. A ref, not state: nothing
   *  on screen reacts to it, only where the focus lands when the menu mounts. */
  const menuSpotAccessRef = useRef(false);
  /**
   * The dock's live height, published as `--dock-h`. It wraps to a second row
   * on narrow screens, and the onboarding primer has to clear it — a fixed
   * `bottom: 90px` in CSS is how the primer ended up sitting on top of
   * Triage/Security tour/Findings/Overview at 1024×680 and swallowing their
   * clicks (measured: three centered clicks, zero reaction).
   */
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const write = (): void => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--dock-h", `${h}px`);
    };
    write();
    // Environments without the observer (the node test runner) keep the CSS
    // default for --dock-h; the measurement is a refinement, not a contract.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    // The Z binding asks for its own caret: when the menu opens because Access
    // was called, it opens on the first option of that section, not at the
    // top of an eighteen-row list. A pointer click keeps the old behaviour.
    const scope = menuSpotAccessRef.current
      ? (menuRef.current?.querySelector("#access-group") ?? menuRef.current)
      : menuRef.current;
    menuSpotAccessRef.current = false;
    scope?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!moreRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  /**
   * Z opens the Access section from anywhere in a city — the Celeste rule:
   * the help that removes shame has to be one deliberate press away, not a
   * treasure hunt through •••. The guards are App.tsx's own: no modifier is
   * held, the press does not land in a field someone is writing into, and no
   * modal or the studio holds the keyboard. While the menu is already open
   * the same press just moves the caret to the section.
   */
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z") return;
      if (!useStore.getState().cityData) return;
      const el = event.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      if (document.querySelector('[aria-modal="true"], .panel-share-studio')) return;
      event.preventDefault();
      if (menuRef.current) {
        menuRef.current
          .querySelector<HTMLButtonElement>("#access-group button:not([disabled])")
          ?.focus();
        return;
      }
      menuSpotAccessRef.current = true;
      setMenuOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * What the triage queue holds, and how much of it still needs a verdict.
   * Walked from the same list the stepper steps through, under the same
   * filters — a number the dock shows has to be a number the queue delivers.
   * Not recomputed while the city rises: the build progress is not a dep.
   */
  const queue = useMemo(() => {
    if (!cityData) return null;
    const list = triageList(cityData, threatFilter, ruleFilter);
    return {
      total: list.length,
      open: openTriageCount(list, reviews),
      ahead: nextOpenTriageIndex(list, reviews, triageCursor + 1, 1) !== -1,
      behind: nextOpenTriageIndex(list, reviews, triageCursor - 1, -1) !== -1,
    };
  }, [cityData, threatFilter, ruleFilter, reviews, triageCursor]);

  if (!cityData) return null;

  const findings = cityData.findingsBySeverity;
  const totalFindings = severityTotal(findings);
  const constructing = buildPhase === "constructing";
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;
  const testing = testRun.status === "installing" || testRun.status === "running";
  /** The two kinds of "cannot run tests now" split by what they mean: while a
   *  run is on its way the label says so in words, anything else (no scan, no
   *  folder behind the demo) is a step that leads nowhere and is struck. */
  const testsBlocked = !testing && (standalone || !analysisId || !cityOnDisk(cityData));

  /** What the system set on the genuine first run — read while the menu is
   *  open, never at arrival: this is an explanation for whoever looks at the
   *  switches, not a surface that paints itself. */
  const adoptedKeys = menuOpen ? systemAdoption() : [];
  const adoptedWords = adoptedKeys
    .map((k) => t(lang, k === "gfxLite" ? "actions.reduceEffects" : "actions.colorblindPalette"))
    .join(", ");

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
      // The lifetime is the server's, so the number is asked for, not recited.
      setFeedback({ message: await cityLinkNotice(lang) });
    } catch {
      setFeedback({ message: t(lang, "actions.linkCopyFailed"), error: true });
    }
  };

  /**
   * Pull a whole-scan report down through the browser's save dialog. The
   * endpoint reads the analysis the local backend already holds — nothing
   * leaves the machine, and the file is the same bytes `/api/result/:id`
   * answers with.
   */
  const downloadReport = (endpoint: "sarif" | "handoff", ext: "sarif" | "ndjson"): void => {
    closeMenu();
    if (!analysisId) return;
    const name = `ephemora-${analysisId}.${ext}`;
    const a = document.createElement("a");
    a.href = `/api/result/${encodeURIComponent(analysisId)}/${endpoint}`;
    a.download = name;
    a.click();
    setFeedback({ message: t(lang, "actions.exportReportStarted", { name }) });
  };

  const statusMessage = feedback?.message ?? (testRun.status !== "idle" ? testRun.stage : null);
  const statusError = feedback ? feedback.error === true : testRun.status === "failed";

  return (
    <div
      ref={dockRef}
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
              // aria-disabled, not disabled: why the step is empty is a title,
              // and a disabled button is never hovered, so it never explains.
              aria-disabled={!queue?.behind}
              title={
                queue?.behind
                  ? t(lang, "actions.triagePrevTitle")
                  : t(lang, "actions.triageNoneBehind")
              }
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-white/10"
              // The same condition that sets aria-disabled strikes the label:
              // one state, one carrier per sense, and no tone that falls under
              // the shell's contrast floor.
              style={{ color: "#fff2e9", whiteSpace: "nowrap", ...struck(!queue?.behind) }}
            >
              <span aria-hidden="true">‹</span>
              {t(lang, "actions.prev")}
            </button>
            <span
              className="shrink-0 px-1 font-mono text-xs tabular-nums"
              style={{ color: "#dedbd3" }}
              title={t(
                lang,
                (queue?.open ?? 0) === 1 ? "actions.triageOpenTitleOne" : "actions.triageOpenTitle",
                { open: queue?.open ?? 0 },
              )}
            >
              {triageCursor + 1} / {triageTotal}
              {queue && queue.total > 0 && (
                <span className="ml-1.5" style={{ color: "#dedbd3" }}>
                  · {queue.open}{" "}
                  {t(
                    lang,
                    queue.open === 1 ? "actions.triageOpenWordOne" : "actions.triageOpenWord",
                  )}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={nextTriage}
              aria-disabled={!queue?.ahead}
              title={
                queue?.ahead
                  ? t(lang, "actions.triageNextTitle")
                  : t(lang, "actions.triageNoneAhead")
              }
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors hover:bg-white/10"
              style={{ color: "#fff2e9", whiteSpace: "nowrap", ...struck(!queue?.ahead) }}
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
            title={
              queue && queue.total > 0 && queue.open === 0
                ? t(lang, "actions.triageAllJudgedTitle")
                : t(lang, "actions.triageStartAria")
            }
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-white/10 disabled:cursor-not-allowed"
            style={{
              color: "#fff2e9",
              background: "rgba(232,80,60,0.14)",
              border: "1px solid rgba(232,80,60,0.4)",
              whiteSpace: "nowrap",
              ...struck(totalFindings === 0),
            }}
          >
            <span className="action-copy">
              <span className="flex items-center gap-2">
                {t(lang, "actions.triage")}
                {/* The count that survived the last round: a re-scan of the same
                    folder starts on what is left, and this is the only place that
                    says so before the queue is opened. */}
                {queue && queue.total > 0 && (
                  <span className="font-mono text-xs tabular-nums" style={{ color: "#dedbd3" }}>
                    {compact ? (
                      queue.open
                    ) : (
                      <>
                        {queue.open}{" "}
                        {t(
                          lang,
                          queue.open === 1 ? "actions.triageOpenWordOne" : "actions.triageOpenWord",
                        )}
                      </>
                    )}
                  </span>
                )}
                <span aria-hidden="true">▶</span>
              </span>
              {!compact && (
                <span className="action-hint" aria-hidden="true">
                  {t(lang, "actions.triageHint")}
                </span>
              )}
            </span>
          </button>
        )}

        {!triageActive && (
          <>
            <ActionButton
              onClick={startTour}
              disabled={tourActive || totalFindings === 0}
              running={tourActive}
              icon="⚑"
              title={
                totalFindings === 0
                  ? t(lang, "actions.tourEmptyTitle")
                  : t(lang, "actions.tourTitle")
              }
              active={tourActive}
              label={
                compact
                  ? t(lang, "actions.tourShort")
                  : tourActive
                    ? t(lang, "actions.tourActive")
                    : t(lang, "actions.tour")
              }
              aria-label={tourActive ? t(lang, "actions.tourActive") : t(lang, "actions.tour")}
              hint={compact ? undefined : t(lang, "actions.tourHint")}
            />
            <ActionButton
              onClick={handleFindings}
              icon="≡"
              title={t(lang, "actions.findingsTitle")}
              aria-pressed={showFindings}
              aria-controls="findings-panel"
              active={showFindings}
              label={
                compact
                  ? t(lang, "actions.findingsShort", { count: totalFindings })
                  : t(lang, totalFindings === 1 ? "actions.findingsOne" : "actions.findings", {
                      count: totalFindings,
                    })
              }
              aria-label={t(
                lang,
                totalFindings === 1 ? "actions.findingsOne" : "actions.findings",
                {
                  count: totalFindings,
                },
              )}
              hint={compact ? undefined : t(lang, "actions.findingsHint")}
            />
            <ActionButton
              onClick={resetFocus}
              label={t(lang, "actions.overview")}
              icon="⌂"
              title={t(lang, "actions.overviewTitle")}
            />
          </>
        )}
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
            aria-label={t(lang, "actions.more")}
            className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium hover:bg-white/5"
            style={{
              color: menuOpen ? "#f2efe8" : "#c8c4bb",
              background: menuOpen ? "rgba(255,255,255,0.07)" : undefined,
            }}
          >
            <span aria-hidden="true">•••</span> {!compact && <span>{t(lang, "actions.more")}</span>}
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
              {triageActive && (
                <>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      closeMenu();
                      startTour();
                    }}
                    className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  >
                    <span aria-hidden="true">⚑</span>
                    {t(lang, "actions.tour")}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      closeMenu();
                      handleFindings();
                    }}
                    className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  >
                    <span aria-hidden="true">≡</span>
                    {t(lang, totalFindings === 1 ? "actions.findingsOne" : "actions.findings", {
                      count: totalFindings,
                    })}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      closeMenu();
                      resetFocus();
                    }}
                    className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  >
                    <span aria-hidden="true">⌂</span>
                    {t(lang, "actions.overview")}
                  </button>
                </>
              )}
              <button
                role="menuitem"
                type="button"
                // a carried file has no staged copy to run: the button is struck
                // with the reason, not offered and then refused
                disabled={testing || standalone || !analysisId || !cityOnDisk(cityData)}
                onClick={() => {
                  closeMenu();
                  setFeedback(null);
                  void runTests();
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                style={struck(testsBlocked)}
                title={
                  standalone
                    ? t(lang, "actions.runTestsExported")
                    : !analysisId
                      ? t(lang, "actions.runTestsNoScanTitle")
                      : !cityOnDisk(cityData)
                        ? t(lang, "actions.runTestsNoFolderTitle")
                        : t(lang, "actions.runTestsTitle")
                }
              >
                <span aria-hidden="true">▷</span>
                {testing ? t(lang, "actions.testsRunning") : t(lang, "actions.runTests")}
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeMenu();
                  openStudio();
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
              >
                <span aria-hidden="true">●</span>
                {tx(lang, "menu.item")}
              </button>
              {/* The two report exports. They live here, next to the picture,
                  because both describe the whole city — the SARIF link in the
                  file panel is easy to miss for anyone who has not opened a
                  building yet. */}
              <button
                role="menuitem"
                type="button"
                aria-disabled={!analysisId}
                title={
                  analysisId
                    ? t(lang, "actions.exportSarifTitle")
                    : t(lang, "actions.exportNoScanTitle")
                }
                onClick={() => downloadReport("sarif", "sarif")}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                style={struck(!analysisId)}
              >
                <span aria-hidden="true">↓</span>
                {t(lang, "actions.exportSarif")}
              </button>
              <button
                role="menuitem"
                type="button"
                aria-disabled={!analysisId}
                title={
                  analysisId
                    ? t(lang, "actions.exportHandoffTitle")
                    : t(lang, "actions.exportNoScanTitle")
                }
                onClick={() => downloadReport("handoff", "ndjson")}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                style={struck(!analysisId)}
              >
                <span aria-hidden="true">↓</span>
                {t(lang, "actions.exportHandoff")}
              </button>
              {/* One step further than folding a surface: every instrument
                  leaves, and the city keeps the frame. The header and this
                  dock are gone a moment later, so the exit is the small
                  Escape chip that App renders while the mode stands. */}
              <button
                role="menuitemcheckbox"
                type="button"
                aria-checked={cityOnly}
                onClick={() => {
                  setCityOnly(!cityOnly);
                  closeMenu();
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                title={t(lang, "actions.cityOnlyTitle")}
              >
                <span aria-hidden="true">{cityOnly ? "◉" : "○"}</span>
                {t(lang, "actions.cityOnly")}
              </button>
              {/* One named door to the crowd; C is the same request without
                  opening this menu. The card itself is the resident. */}
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeMenu();
                  requestResidentCall();
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                title={t(lang, "resident.callTitle")}
              >
                <span aria-hidden="true">◉</span>
                {t(lang, "resident.call")}
              </button>
              {/* §04.11 — beside the door to the crowd, the door to the figure:
                  renaming is the card's field, restyling needs the vitrine, and
                  the card keeps its one verb. */}
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  closeMenu();
                  setShowEpheVitrine(true);
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                title={t(lang, "actions.lookTitle")}
              >
                <span aria-hidden="true">◍</span>
                {t(lang, "actions.look")}
              </button>
              {/* The arrival budget. These five surfaces no longer put
                  themselves on the screen when a city arrives — each row
                  names the thing it brings back, because a glyph-only chip
                  is not something a first-time reader finds. They stay open
                  while the menu does, so two of them can be asked for in one
                  visit. */}
              <div
                role="group"
                aria-label={t(lang, "actions.onScreen")}
                className="action-view-group"
              >
                <div className="action-view-heading">{t(lang, "actions.onScreen")}</div>
                <button
                  role="menuitemcheckbox"
                  type="button"
                  aria-checked={showLegend}
                  onClick={() => setShowLegend(!showLegend)}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  title={t(lang, "actions.showLegendTitle")}
                >
                  <span aria-hidden="true">{showLegend ? "◉" : "○"}</span>
                  {t(lang, "actions.showLegend")}
                </button>
                <button
                  role="menuitemcheckbox"
                  type="button"
                  aria-checked={showMinimap}
                  onClick={() => setShowMinimap(!showMinimap)}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  title={t(lang, "actions.showMapTitle")}
                >
                  <span aria-hidden="true">{showMinimap ? "◉" : "○"}</span>
                  {t(lang, "actions.showMap")}
                </button>
                <button
                  role="menuitemcheckbox"
                  type="button"
                  aria-checked={showHeat}
                  onClick={() => setShowHeat(!showHeat)}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  title={t(lang, "actions.showHeatTitle")}
                >
                  <span aria-hidden="true">{showHeat ? "◉" : "○"}</span>
                  {t(lang, "actions.showHeat")}
                </button>
                <button
                  role="menuitemcheckbox"
                  type="button"
                  aria-checked={showPrimer}
                  onClick={() => setShowPrimer(!showPrimer)}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  title={t(lang, "actions.firstLookTitle")}
                >
                  <span aria-hidden="true">{showPrimer ? "◉" : "○"}</span>
                  {t(lang, "actions.firstLook")}
                </button>
                <button
                  role="menuitemcheckbox"
                  type="button"
                  aria-checked={showShortcuts}
                  onClick={() => {
                    setShowShortcuts(!showShortcuts);
                    closeMenu();
                  }}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                  title={t(lang, "actions.shortcutsTitle")}
                >
                  <span aria-hidden="true">{showShortcuts ? "◉" : "○"}</span>
                  {t(lang, "actions.shortcuts")}
                </button>
              </div>
              {/* One place for every way this city can be made easier to
                  take: the color-safe palette, the quieter effects and the
                  language, each switched on its own, each saying its state
                  as a word — never by colour or glyph alone. They used to
                  sit as three loose rows in an eighteen-item list, and the
                  Z key walks the caret straight in here. Display and access
                  choices, not scan actions: the section stays before the
                  final "Copy city link" item so End keeps landing on the
                  share action. */}
              <div
                role="group"
                id="access-group"
                aria-label={t(lang, "actions.access")}
                className="action-view-group"
              >
                <div className="action-view-heading">{t(lang, "actions.access")}</div>
                {adoptedKeys.length > 0 && (
                  <p className="access-system-note mx-3 mb-1 mt-2 text-xs leading-relaxed">
                    {t(lang, "access.systemNote", { what: adoptedWords })}
                  </p>
                )}
                <button
                  role="menuitemcheckbox"
                  type="button"
                  aria-checked={gfxLite}
                  onClick={() => setPref("gfxLite", !gfxLite)}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                >
                  <span aria-hidden="true">{gfxLite ? "◉" : "○"}</span>
                  {t(lang, "actions.reduceEffects")}
                  <span className="access-state-word ml-auto text-xs">
                    {t(lang, gfxLite ? "actions.stateOn" : "actions.stateOff")}
                  </span>
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
                  <span className="access-state-word ml-auto text-xs">
                    {t(lang, colorblind ? "actions.stateOn" : "actions.stateOff")}
                  </span>
                </button>
                {/* The language control used to exist only on the landing screen,
                    so anyone who had already entered a city had to leave it — via
                    the logo — to read the tool in their own language. */}
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    const next = lang === "de" ? "en" : "de";
                    setPref("lang", next);
                    setFeedback({ message: t(next, "actions.languageSwitched"), error: false });
                  }}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                >
                  <span aria-hidden="true">⇄</span>
                  {t(lang, "actions.language")}
                  <span className="access-state-word ml-auto text-xs">
                    {t(lang, lang === "de" ? "access.langGerman" : "access.langEnglish")}
                  </span>
                </button>
              </div>
              <button
                role="menuitem"
                type="button"
                onClick={async () => {
                  // A carried file has no backend and, by design, no network.
                  // Measured before this guard: the click answered "up to date ()"
                  // — the 503 from the file's own server parsed as a version
                  // check that found no newer release. Saying "no connection"
                  // is the true answer.
                  if (standalone) {
                    closeMenu();
                    setFeedback({ message: t(lang, "update.unavailable"), error: true });
                    return;
                  }
                  try {
                    const r = await fetch("/api/update/check");
                    if (!r.ok) {
                      setFeedback({ message: t(lang, "update.unavailable"), error: true });
                      return;
                    }
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
              {/* The passive note under the city is a standing request, and the
                  store has carried its switch since Lane STAAT closed the state
                  side (`toggleUpdateCheck`, read by `Landing.tsx:563`). Until
                  here the row was missing: the only way to decline it was to
                  leave the city. */}
              <button
                role="menuitemcheckbox"
                type="button"
                aria-checked={updateCheck}
                onClick={() => {
                  const next = toggleUpdateCheck();
                  setFeedback({
                    message: t(lang, next ? "actions.updateCheckOn" : "actions.updateCheckOff"),
                    error: false,
                  });
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
              >
                <span aria-hidden="true">{updateCheck ? "◉" : "○"}</span>
                {t(lang, "actions.updateCheck")}
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={!analysisId}
                onClick={() => void handleShare()}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-white/5"
                style={struck(!analysisId)}
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
