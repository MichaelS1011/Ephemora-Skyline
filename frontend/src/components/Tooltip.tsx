'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../stores/useStore';
import { getDirLayout } from '../city/layout';
import { languageColor, SEVERITY_COLOR, THREAT_COLOR } from '../city/palette';
import type { ThreatLevel } from '../city/types';

const TOOLTIP_W = 230;
const OFFSET = 16;

export function Tooltip({ mousePosition }: { mousePosition: { x: number; y: number } }) {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const hoveredId = useStore((s) => s.hoveredId);

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef(0);

  /* Smooth position tracking via rAF */
  useEffect(() => {
    frameRef.current = requestAnimationFrame(() => {
      const x = Math.min(mousePosition.x + OFFSET, window.innerWidth - TOOLTIP_W - 10);
      const y = Math.min(mousePosition.y + OFFSET, window.innerHeight - 120);
      setPos({ x, y });
    });
    return () => cancelAnimationFrame(frameRef.current);
  }, [mousePosition]);

  /* Fade-in delay to avoid flicker on quick passes */
  useEffect(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hoveredId) {
      showTimer.current = setTimeout(() => setVisible(true), 60);
    } else {
      setVisible(false);
    }
    return () => { if (showTimer.current) clearTimeout(showTimer.current); };
  }, [hoveredId]);

  if (!cityData || !hoveredId) return null;

  const layout = getDirLayout(cityData, focusPath);
  const isBlock = hoveredId.startsWith('block:');

  let title = '';
  let subtitle = '';
  let accent = '#4de3ff';
  let badge = '';
  let badgeColor = '';
  let hint = '';

  if (isBlock) {
    const blockPath = hoveredId.slice(6);
    const block = layout.blocks.find((b) => b.dir.path === blockPath);
    if (!block) return null;
    title = block.dir.name;
    subtitle = `${block.dir.fileCount} files · ${block.dir.linesOfCode.toLocaleString()} LOC`;
    if (block.dir.findingsBySeverity.P0 > 0) {
      accent = SEVERITY_COLOR.P0;
      badge = `${block.dir.findingsBySeverity.P0} critical`;
      badgeColor = SEVERITY_COLOR.P0;
    } else if (block.dir.findingsBySeverity.P1 > 0) {
      accent = SEVERITY_COLOR.P1;
      badge = `${block.dir.findingsBySeverity.P1} high`;
      badgeColor = SEVERITY_COLOR.P1;
    } else {
      badge = 'no findings';
      badgeColor = '#29d398';
    }
    hint = 'click to enter district';
  } else {
    const b = layout.buildings.find((x) => x.file.id === hoveredId);
    if (!b) return null;
    title = b.file.name;
    subtitle = b.file.path;
    accent = languageColor(b.file.language);
    if (b.file.findings.length > 0) {
      accent = THREAT_COLOR[b.file.threatLevel as ThreatLevel] ?? accent;
      badge = `${b.file.findings.length} finding${b.file.findings.length !== 1 ? 's' : ''}`;
      badgeColor = THREAT_COLOR[b.file.threatLevel as ThreatLevel] ?? SEVERITY_COLOR.P0;
      hint = b.file.findings[0]?.type ?? '';
    } else {
      badge = `${b.file.linesOfCode.toLocaleString()} LOC`;
      badgeColor = '#29d398';
      hint = b.file.language;
    }
  }

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: TOOLTIP_W,
        background: 'rgba(6, 9, 20, 0.95)',
        border: `1px solid ${accent}55`,
        borderRadius: 4,
        padding: '0.55rem 0.7rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.68rem',
        color: '#c8d8f0',
        pointerEvents: 'none',
        zIndex: 50,
        boxShadow: `0 0 18px ${accent}22, 0 4px 16px rgba(0,0,0,0.5)`,
        backdropFilter: 'blur(10px)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
      }}
    >
      {/* Type indicator */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="font-jetbrains text-[8px] px-1 py-px rounded-sm uppercase tracking-wide"
          style={{ color: accent, background: `${accent}18`, border: `1px solid ${accent}33` }}
        >
          {isBlock ? 'district' : 'file'}
        </span>
        {hint && (
          <span className="font-jetbrains text-[9px]" style={{ color: '#4d6488' }}>
            {hint}
          </span>
        )}
      </div>

      <div className="font-jetbrains font-semibold truncate" style={{ color: '#e8f0ff' }}>{title}</div>
      <div className="font-jetbrains text-[9px] mt-0.5 truncate" style={{ color: '#4d6488' }}>{subtitle}</div>

      {/* Badge row */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span
          className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
          style={{ color: badgeColor, background: `${badgeColor}15`, border: `1px solid ${badgeColor}44` }}
        >
          {badge}
        </span>
        {isBlock && (
          <span className="font-jetbrains text-[9px]" style={{ color: '#3d5070' }}>click to enter</span>
        )}
      </div>
    </div>
  );
}
