import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { languageColor, SEVERITY_COLOR, THREAT_COLOR } from "../city/palette";
import type { ThreatLevel } from "../city/types";

const TOOLTIP_W = 230;
const OFFSET = 16;

export function Tooltip() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const hoveredId = useStore((s) => s.hoveredId);

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
    if (hoveredId && elRef.current) applyPosition(lastMouse.current.x, lastMouse.current.y);
  }, [hoveredId, focusPath]);

  /* Fade-in delay to avoid flicker on quick passes */
  useEffect(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hoveredId) {
      showTimer.current = setTimeout(() => setVisible(true), 60);
    } else {
      setVisible(false);
    }
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, [hoveredId]);

  if (!cityData || !hoveredId) return null;

  const layout = getDirLayout(cityData, focusPath);
  const isBlock = hoveredId.startsWith("block:");

  let title = "";
  let subtitle = "";
  let accent = "#f2d5a0";
  let badge = "";
  let badgeColor = "";
  let hint = "";

  if (isBlock) {
    const blockPath = hoveredId.slice(6);
    const block = layout.blocks.find((b) => b.dir.path === blockPath);
    if (!block) return null;
    title = block.dir.name;
    subtitle = `folder · ${block.dir.fileCount} files · ${block.dir.linesOfCode.toLocaleString()} LOC`;
    if (block.dir.findingsBySeverity.P0 > 0) {
      accent = SEVERITY_COLOR.P0;
      badge = `${block.dir.findingsBySeverity.P0} critical finding${
        block.dir.findingsBySeverity.P0 !== 1 ? "s" : ""
      }`;
      badgeColor = SEVERITY_COLOR.P0;
    } else if (block.dir.findingsBySeverity.P1 > 0) {
      accent = SEVERITY_COLOR.P1;
      badge = `${block.dir.findingsBySeverity.P1} high finding${
        block.dir.findingsBySeverity.P1 !== 1 ? "s" : ""
      }`;
      badgeColor = SEVERITY_COLOR.P1;
    } else {
      badge = "no findings";
      badgeColor = "#29d398";
    }
    hint = "click to zoom into this district";
  } else {
    const b = layout.buildings.find((x) => x.file.id === hoveredId);
    if (!b) return null;
    const loc = b.file.linesOfCode.toLocaleString();
    title = b.file.name;
    subtitle = b.file.path;
    accent = languageColor(b.file.language);
    if (b.file.findings.length > 0) {
      accent = THREAT_COLOR[b.file.threatLevel as ThreatLevel] ?? accent;
      badge = `${loc} LOC · ${b.file.findings.length} finding${
        b.file.findings.length !== 1 ? "s" : ""
      }`;
      badgeColor = THREAT_COLOR[b.file.threatLevel as ThreatLevel] ?? SEVERITY_COLOR.P0;
      hint = "click for details";
    } else {
      badge = `${loc} LOC · no findings`;
      badgeColor = "#29d398";
      hint = `${b.file.language} · click for details`;
    }
  }

  return (
    <div
      ref={elRef}
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
        fontSize: "0.68rem",
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
          className="font-jetbrains text-[8px] px-1 py-px rounded-sm uppercase tracking-wide"
          style={{ color: accent, background: `${accent}18`, border: `1px solid ${accent}33` }}
        >
          {isBlock ? "district" : "file"}
        </span>
        {hint && (
          <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
            {hint}
          </span>
        )}
      </div>

      <div className="font-jetbrains font-semibold truncate" style={{ color: "#e8f0ff" }}>
        {title}
      </div>
      <div
        className="font-jetbrains text-[9px] mt-0.5 truncate"
        style={{ color: "var(--meta-strong)" }}
      >
        {subtitle}
      </div>

      {/* Badge row */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span
          className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
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
