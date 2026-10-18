import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import {
  languageColor,
  REVIEWED_BEACON_COLOR,
  severityColor,
  threatColor,
  UNCHECKED_COLOR,
} from "../city/palette";
import {
  isUncheckedClean,
  missingEnginesForDistrict,
  uncheckedFileCount,
} from "../city/provenance";
import type { Severity } from "../city/types";
import { formatCount, t } from "../i18n";
import { inputIsKeyboard, resolve } from "../interaction/shortcuts";
import { getKeyboardMark } from "../interaction/keyboardMark";

const TOOLTIP_W = 230;
const OFFSET = 16;

/**
 * Where a tooltip goes when no pointer asked for it: below the mode band, the
 * building it describes is at the centre of the frame because stepping flies
 * there. The 3D view is not focusable as a tooltip host, so this is the only
 * anchor a keyboard reader and the picture can share.
 */
const KEYBOARD_TOP = 168;

export function Tooltip() {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const hoveredId = useStore((s) => s.hoveredId);
  const selectedUnit = useStore((s) => s.selectedUnit);

  /**
   * A reader working the bracket pair has no pointer sitting on the thing they
   * are reading about. When the keyboard was the last hand on the machine, the
   * selection carries the tooltip — same content, same badge, same provenance
   * check, anchored where the camera put it.
   */
  const keyboardId =
    !hoveredId && inputIsKeyboard() && selectedUnit?.kind === "file" ? selectedUnit.id : null;
  const target = hoveredId ?? keyboardId;
  /**
   * `hoveredId` is the pointer's channel, and the bracket pair borrows it to
   * show a district's numbers — so a block id that equals the keyboard's own
   * mark is keyboard-driven too, and gets the keyboard anchor and wording.
   */
  const markedBlock = target?.startsWith("block:") ? target.slice(6) : null;
  const byKeyboard =
    keyboardId !== null || (!!markedBlock && getKeyboardMark()?.path === markedBlock);

  const elRef = useRef<HTMLDivElement | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPosition = (x: number, y: number): void => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${Math.min(x + OFFSET, window.innerWidth - TOOLTIP_W - 10)}px`;
    el.style.top = `${Math.min(y + OFFSET, window.innerHeight - 120)}px`;
  };

  const applyKeyboardPosition = (): void => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${Math.max(12, (window.innerWidth - TOOLTIP_W) / 2)}px`;
    el.style.top = `${KEYBOARD_TOP}px`;
  };

  /**
   * Position via direct DOM writes on mousemove — React state here would
   * re-render the whole app ~60×/s for a purely cosmetic follow effect.
   */
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      lastMouse.current = { x: e.clientX, y: e.clientY };
      applyPosition(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  /* Position from the last known mouse spot when the tooltip (re)mounts */
  useLayoutEffect(() => {
    if (!target || !elRef.current) return;
    if (byKeyboard) applyKeyboardPosition();
    else applyPosition(lastMouse.current.x, lastMouse.current.y);
  }, [target, focusPath, byKeyboard]);

  /* Fade-in delay to avoid flicker on quick passes */
  useEffect(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (target) {
      showTimer.current = setTimeout(() => setVisible(true), 60);
    } else {
      setVisible(false);
    }
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, [target]);

  if (!cityData || !target) return null;

  const layout = getDirLayout(cityData, focusPath);
  const isBlock = target.startsWith("block:");

  let title = "";
  let subtitle = "";
  let accent = "#f2d5a0";
  let badge = "";
  let badgeColor = "";
  let hint = "";

  if (isBlock) {
    const blockPath = target.slice(6);
    const block = layout.blocks.find((b) => b.dir.path === blockPath);
    if (!block) return null;
    title = block.dir.name;
    subtitle = t(lang, "tooltip.folderSubtitle", {
      files: block.dir.fileCount,
      loc: formatCount(lang, block.dir.linesOfCode),
    });
    const counts = block.dir.findingsBySeverity;
    // The chain used to stop at P1: a district whose only findings were medium
    // fell into the else and was announced green as "keine Funde". Measured on
    // the demo city: frontend/src/stores holds 1 medium finding and was the one
    // district the badge lied about. Every severity the city carries has to
    // answer before "nothing here" is allowed to speak.
    const worst: Severity | null =
      counts.P0 > 0 ? "P0" : counts.P1 > 0 ? "P1" : counts.P2 > 0 ? "P2" : null;
    if (worst) {
      accent = severityColor(worst, colorblind);
      badgeColor = severityColor(worst, colorblind);
      const n = counts[worst];
      badge = t(
        lang,
        worst === "P0"
          ? n === 1
            ? "tooltip.badgeCriticalOne"
            : "tooltip.badgeCriticalMany"
          : worst === "P1"
            ? n === 1
              ? "tooltip.badgeHighOne"
              : "tooltip.badgeHighMany"
            : n === 1
              ? "tooltip.badgeMediumOne"
              : "tooltip.badgeMediumMany",
        { count: n },
      );
    } else {
      // Zero findings is only a result where an engine could have made one. The
      // file line has said this since `isUncheckedClean`; the district line
      // painted the same fact green — measured on demo-001: 9 of 17 districts,
      // every one of them with all its files unverified by the two switched-off
      // engines.
      const missing = missingEnginesForDistrict(block.dir, cityData.scanProvenance);
      const unchecked = uncheckedFileCount(block.dir);
      if (missing.length > 0 && unchecked > 0) {
        badge = t(
          lang,
          unchecked === 1 ? "tooltip.dirBadgeUncheckedOne" : "tooltip.dirBadgeUnchecked",
          { n: unchecked, engines: missing.join(", ") },
        );
        badgeColor = UNCHECKED_COLOR;
      } else {
        badge = t(lang, "tooltip.badgeNone");
        badgeColor = REVIEWED_BEACON_COLOR;
      }
    }
    hint =
      getKeyboardMark()?.path === blockPath
        ? resolve(lang, {
            key: "tooltip.zoomHintKeyboard",
            en: "Enter — walk in",
            de: "Enter — hineingehen",
          })
        : t(lang, "tooltip.zoomHint");
  } else {
    const b = layout.buildings.find((x) => x.file.id === target);
    if (!b) return null;
    const loc = formatCount(lang, b.file.linesOfCode);
    title = b.file.name;
    subtitle = b.file.path;
    accent = languageColor(b.file.language);
    if (b.file.findings.length > 0) {
      accent = threatColor(b.file.threatLevel, colorblind);
      badge = t(
        lang,
        b.file.findings.length === 1 ? "tooltip.fileFindingsOne" : "tooltip.fileFindingsMany",
        { loc, count: b.file.findings.length },
      );
      badgeColor = threatColor(b.file.threatLevel, colorblind);
      // Selecting happens on click (no camera move); double-click starts the
      // orbit-inspect mode — teach that gesture for EVERY building, findings
      // or not.
      hint = byKeyboard
        ? resolve(lang, {
            key: "tooltip.orbitHintKeyboard",
            en: "Enter — circle it, Esc frees the camera",
            de: "Enter — umkreisen, Esc gibt die Kamera frei",
          })
        : t(lang, "tooltip.orbitHint");
    } else {
      badge = isUncheckedClean(b.file)
        ? t(lang, "tooltip.fileBadgeUnchecked", { loc, engines: b.file.unverifiedBy!.join(", ") })
        : t(lang, "tooltip.fileBadgeNone", { loc });
      badgeColor = isUncheckedClean(b.file) ? UNCHECKED_COLOR : REVIEWED_BEACON_COLOR;
      hint = byKeyboard
        ? resolve(lang, {
            key: "tooltip.noFindingsOrbitHintKeyboard",
            en: "Enter — circle it, Esc frees the camera",
            de: "Enter — umkreisen, Esc gibt die Kamera frei",
          })
        : t(lang, "tooltip.noFindingsOrbitHint", { language: b.file.language });
    }
  }

  return (
    <div
      ref={elRef}
      className={byKeyboard ? "tooltip-keyboard" : undefined}
      role="tooltip"
      style={{
        position: "fixed",
        left: -9999,
        top: -9999,
        width: TOOLTIP_W,
        background: "rgba(18, 18, 16, 0.95)",
        border: `1px solid ${accent}55`,
        borderRadius: 4,
        padding: "0.55rem 0.7rem",
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
        color: "var(--brand-ink)",
        pointerEvents: "none",
        zIndex: 50,
        boxShadow: `0 0 18px ${accent}22, 0 4px 16px rgba(0,0,0,0.5)`,
        backdropFilter: "blur(10px)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 0.15s ease-out, transform 0.15s ease-out",
      }}
    >
      {/* Type indicator */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="font-jetbrains text-[length:var(--fs-meta)] px-1 py-px rounded-sm uppercase tracking-wide"
          style={{ color: accent, background: `${accent}18`, border: `1px solid ${accent}33` }}
        >
          {isBlock ? t(lang, "tooltip.typeDistrict") : t(lang, "tooltip.typeFile")}
        </span>
        {hint && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)]"
            style={{ color: "var(--meta-strong)" }}
          >
            {hint}
          </span>
        )}
      </div>

      <div className="font-jetbrains font-semibold truncate" style={{ color: "#e8f0ff" }}>
        {title}
      </div>
      <div
        className="font-jetbrains text-[length:var(--fs-meta)] mt-0.5 truncate"
        style={{ color: "var(--meta-strong)" }}
      >
        {subtitle}
      </div>

      {/* Badge row */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span
          className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
          style={{
            color: badgeColor,
            background: `${badgeColor}15`,
            border: `1px solid ${badgeColor}44`,
          }}
        >
          {badge}
        </span>
      </div>
    </div>
  );
}
