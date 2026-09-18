'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../stores/useStore';

const COACH_KEY = 'codecity-coach-v2';

const HINTS = [
  { icon: '⊕', text: 'Drag to orbit · Scroll to zoom' },
  { icon: '⊞', text: 'Click a district to explore its files' },
  { icon: '⚑', text: 'Security Tour flies to every finding' },
  { icon: '/', text: 'Press / to search by file name or language' },
];

export function CoachMarks() {
  const focusPath = useStore((s) => s.focusPath);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(COACH_KEY) === '1'; } catch { /* */ }
    if (!seen) setVisible(true);
  }, []);

  const dismiss = (): void => {
    setVisible(false);
    try { localStorage.setItem(COACH_KEY, '1'); } catch { /* */ }
  };

  useEffect(() => {
    if (focusPath.length > 0) dismiss();
  }, [focusPath.length]);

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 pointer-events-auto animate-fade-up"
      style={{
        background: 'rgba(6, 9, 20, 0.92)',
        border: '1px solid rgba(77,227,255,0.28)',
        borderRadius: 5,
        padding: '0.65rem 0.9rem',
        boxShadow: '0 0 24px rgba(77,227,255,0.1), 0 8px 24px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        maxWidth: '90vw',
      }}
      role="status"
    >
      <div className="flex items-start gap-4">
        {/* Hints grid */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
          {HINTS.map((h) => (
            <div key={h.icon} className="flex items-center gap-2">
              <span
                className="w-5 h-5 flex items-center justify-center shrink-0 font-jetbrains text-[11px]"
                style={{
                  color: '#4de3ff',
                  background: 'rgba(77,227,255,0.1)',
                  border: '1px solid rgba(77,227,255,0.25)',
                  borderRadius: 3,
                }}
              >
                {h.icon}
              </span>
              <span className="font-jetbrains text-[10px]" style={{ color: '#8fa3c4' }}>{h.text}</span>
            </div>
          ))}
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="btn-ghost shrink-0 w-6 h-6 flex items-center justify-center !p-0"
          aria-label="Dismiss hints"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
