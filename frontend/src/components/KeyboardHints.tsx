import { useEffect, useRef } from "react";

interface ShortcutEntry {
  keys: string[];
  description: string;
  category?: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  {
    keys: ["/"],
    description: "Focus the search bar (file name or language)",
    category: "Navigation",
  },
  {
    keys: ["Tab"],
    description: "Next building — when the 3D view has focus",
    category: "Navigation",
  },
  {
    keys: ["⇧", "Tab"],
    description: "Previous building — when the 3D view has focus",
    category: "Navigation",
  },
  {
    keys: ["Esc"],
    description: "Close panel → up one district → twice at the overview re-frames",
    category: "Navigation",
  },
  { keys: ["?"], description: "Show or hide this panel", category: "Navigation" },
  { keys: ["←", "→"], description: "Previous / next finding (Tour)", category: "Security Tour" },
  { keys: ["Enter"], description: "Next finding (Tour)", category: "Security Tour" },
  { keys: ["Esc"], description: "Exit the tour", category: "Security Tour" },
];

interface KeyboardHintsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHints({ isOpen, onClose }: KeyboardHintsProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // WCAG 2.4.3: remember what had focus before the dialog opened so keyboard
  // focus returns to the '?' trigger on close instead of dropping to <body>.
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      prevFocusRef.current = document.activeElement;
      closeButtonRef.current?.focus();
    } else if (prevFocusRef.current instanceof HTMLElement) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  const handleBackdrop = (e: React.MouseEvent): void => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  const categories = [...new Set(SHORTCUTS.map((s) => s.category ?? ""))];

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-end justify-start p-4"
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="font-jetbrains animate-fade-up"
        style={{
          background: "rgba(18, 18, 16, 0.96)",
          border: "1px solid rgba(232,178,60,0.3)",
          borderRadius: 5,
          padding: "0.9rem 1rem",
          width: 280,
          boxShadow: "0 0 24px rgba(232,178,60,0.12), 0 8px 24px rgba(0,0,0,0.5)",
          backdropFilter: "blur(14px)",
          marginBottom: "3.5rem",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-jetbrains text-[10px] tracking-widest" style={{ color: "#f2d5a0" }}>
            ⌨ KEYBOARD SHORTCUTS
          </span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="btn-ghost w-5 h-5 flex items-center justify-center !p-0 text-[10px]"
            aria-label="Close keyboard shortcuts"
          >
            ✕
          </button>
        </div>

        {/* Grouped shortcuts */}
        {categories.map((cat) => (
          <div key={cat} className="mb-3 last:mb-0">
            <div
              className="font-jetbrains text-[8px] tracking-[0.25em] uppercase mb-1.5 pb-1"
              style={{
                color: "var(--meta-faint)",
                borderBottom: "1px solid rgba(232,178,60,0.08)",
              }}
            >
              {cat}
            </div>
            <div className="flex flex-col gap-1">
              {SHORTCUTS.filter((s) => (s.category ?? "") === cat).map((sh) => (
                <div key={sh.description} className="flex items-center justify-between gap-3">
                  <span className="font-jetbrains text-[10px]" style={{ color: "#98948a" }}>
                    {sh.description}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {sh.keys.map((k) => (
                      <kbd
                        key={k}
                        className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
                        style={{
                          background: "rgba(232,178,60,0.08)",
                          border: "1px solid rgba(232,178,60,0.22)",
                          color: "#f2d5a0",
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
