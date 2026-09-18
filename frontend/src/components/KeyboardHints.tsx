'use client';

import { useEffect, useRef } from 'react';

interface ShortcutEntry {
  keys: string[];
  description: string;
  category?: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: ['/'],           description: 'Focus search',       category: 'Navigation' },
  { keys: ['Tab'],         description: 'Next building',      category: 'Navigation' },
  { keys: ['⇧', 'Tab'],   description: 'Previous building',  category: 'Navigation' },
  { keys: ['Esc'],         description: 'Deselect / go back', category: 'Navigation' },
  { keys: ['?'],           description: 'Toggle this panel',  category: 'Navigation' },
  { keys: ['←', '→'],     description: 'Prev / next finding (Tour)', category: 'Security Tour' },
  { keys: ['Enter'],       description: 'Next finding (Tour)',category: 'Security Tour' },
  { keys: ['Esc'],         description: 'Exit tour',          category: 'Security Tour' },
];

interface KeyboardHintsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHints({ isOpen, onClose }: KeyboardHintsProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  const handleBackdrop = (e: React.MouseEvent): void => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  const categories = [...new Set(SHORTCUTS.map((s) => s.category ?? ''))];

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-end justify-start p-4"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="font-jetbrains animate-fade-up"
        style={{
          background: 'rgba(6, 9, 20, 0.96)',
          border: '1px solid rgba(77,227,255,0.3)',
          borderRadius: 5,
          padding: '0.9rem 1rem',
          width: 280,
          boxShadow: '0 0 24px rgba(77,227,255,0.12), 0 8px 24px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(14px)',
          marginBottom: '3.5rem',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-jetbrains text-[10px] tracking-widest" style={{ color: '#4de3ff' }}>
            ⌨ KEYBOARD SHORTCUTS
          </span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="btn-ghost w-5 h-5 flex items-center justify-center !p-0 text-[10px]"
            aria-label="Close keyboard shortcuts"
          >✕</button>
        </div>

        {/* Grouped shortcuts */}
        {categories.map((cat) => (
          <div key={cat} className="mb-3 last:mb-0">
            <div
              className="font-jetbrains text-[8px] tracking-[0.25em] uppercase mb-1.5 pb-1"
              style={{ color: '#3d5070', borderBottom: '1px solid rgba(77,227,255,0.08)' }}
            >
              {cat}
            </div>
            <div className="flex flex-col gap-1">
              {SHORTCUTS.filter((s) => (s.category ?? '') === cat).map((sh) => (
                <div key={sh.description} className="flex items-center justify-between gap-3">
                  <span className="font-jetbrains text-[10px]" style={{ color: '#7f9bbf' }}>
                    {sh.description}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {sh.keys.map((k) => (
                      <kbd
                        key={k}
                        className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
                        style={{
                          background: 'rgba(77,227,255,0.08)',
                          border: '1px solid rgba(77,227,255,0.22)',
                          color: '#4de3ff',
                          lineHeight: 1.4,
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
