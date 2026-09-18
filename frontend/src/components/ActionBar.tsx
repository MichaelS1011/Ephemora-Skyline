'use client';

import { useState } from 'react';
import { useStore } from '../stores/useStore';
import { SEVERITY_COLOR } from '../city/palette';

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  title: string;
  icon: string;
  active?: boolean;
  accentColor?: string;
  danger?: boolean;
}

function ActionButton({ onClick, disabled, label, title, icon, active, accentColor = 'rgba(120,160,220,0.55)', danger }: ActionButtonProps) {
  const [hov, setHov] = useState(false);

  const borderColor = danger
    ? 'rgba(255,46,77,0.5)'
    : active
      ? accentColor
      : hov
        ? 'rgba(77,227,255,0.5)'
        : 'rgba(90,120,170,0.35)';

  const color = danger
    ? hov ? '#ff6477' : '#ff4d5e'
    : active
      ? accentColor
      : hov
        ? '#4de3ff'
        : '#8fa3c4';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="font-jetbrains text-[10px] tracking-[0.12em] px-3 py-1.5 rounded-sm transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed flex items-center gap-1.5"
      style={{
        border: `1px solid ${borderColor}`,
        color,
        background: hov && !disabled
          ? danger ? 'rgba(255,46,77,0.08)' : 'rgba(77,227,255,0.06)'
          : active ? `${accentColor}14` : 'rgba(5,8,20,0.75)',
        backdropFilter: 'blur(6px)',
        boxShadow: hov && !disabled ? `0 0 12px ${color}22` : 'none',
      }}
    >
      <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>{icon}</span>
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
  const [copied, setCopied] = useState(false);

  if (!cityData) return null;

  const findings = cityData.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;
  const constructing = buildPhase === 'constructing';
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;

  const handleShare = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  const handleScreenshot = (): void => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `codecity-${cityData.repo.name}.png`;
      a.click();
    } catch { /* canvas export blocked */ }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col items-center gap-2">
      {/* Build progress */}
      {constructing && (
        <div
          className="px-4 py-1.5 rounded-sm font-jetbrains animate-fade-up"
          style={{
            background: 'rgba(6, 9, 20, 0.88)',
            border: '1px solid rgba(0,255,159,0.3)',
            backdropFilter: 'blur(8px)',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-4 mb-1">
            <span className="text-[10px] tracking-widest" style={{ color: '#00ff9f' }}>
              ⚒ RAISING {focusPath.length > 0 ? `/${focusPath.join('/')}` : 'CITY'}
            </span>
            <span className="text-[10px]" style={{ color: '#4de3ff' }}>
              {constructionDone}/{constructionTotal}
            </span>
          </div>
          <div className="w-48 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(20,36,64,0.9)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #00d4ff, #00ff9f)',
                boxShadow: '0 0 6px rgba(0,255,159,0.5)',
              }}
            />
          </div>
        </div>
      )}

      {/* Button row */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm"
        style={{
          background: 'rgba(6, 9, 20, 0.82)',
          border: '1px solid rgba(90,120,170,0.22)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <ActionButton
          onClick={startTour}
          disabled={tourActive || totalFindings === 0}
          label="SECURITY TOUR"
          icon="⚑"
          title={totalFindings === 0 ? 'No findings to tour' : 'Fly through every security finding, most risky first (←→)'}
          active={!tourActive && totalFindings > 0}
          accentColor={SEVERITY_COLOR.P0}
        />

        {/* Divider */}
        <span style={{ width: 1, height: 18, background: 'rgba(90,120,170,0.25)', display: 'inline-block' }} />

        <ActionButton
          onClick={resetFocus}
          label="OVERVIEW"
          icon="⌂"
          title="Back to the city overview (double-Esc)"
        />
        <ActionButton
          onClick={handleScreenshot}
          label="PNG"
          icon="⎙"
          title="Export the current view as a PNG image"
        />
        <ActionButton
          onClick={handleShare}
          label={copied ? 'COPIED!' : 'SHARE'}
          icon={copied ? '✓' : '⎘'}
          title="Copy a permalink to this city"
          active={copied}
          accentColor="#29d398"
        />
      </div>
    </div>
  );
}
