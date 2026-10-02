import { useEffect, useRef } from "react";
import { useStore } from "../stores/useStore";
import { t, type Lang } from "../i18n";

interface ShortcutEntry {
  keys: string[];
  description: string;
  category?: string;
}

/** The panel's rows, localized at render time — the key bindings stay fixed. */
function buildShortcuts(lang: Lang): ShortcutEntry[] {
  return [
    {
      keys: ["/"],
      description: t(lang, "hints.searchFocus"),
      category: t(lang, "hints.catNavigation"),
    },
    {
      keys: ["→"],
      description: t(lang, "hints.nextBuilding"),
      category: t(lang, "hints.catNavigation"),
    },
    {
      keys: ["←"],
      description: t(lang, "hints.prevBuilding"),
      category: t(lang, "hints.catNavigation"),
    },
    {
      keys: ["Esc"],
      description: t(lang, "hints.esc"),
      category: t(lang, "hints.catNavigation"),
    },
    {
      keys: ["?"],
      description: t(lang, "hints.toggle"),
      category: t(lang, "hints.catNavigation"),
    },
    {
      keys: ["Drag"],
      description: t(lang, "hints.camDrag"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["W", "A", "S", "D"],
      description: t(lang, "hints.camPan"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["Q", "E"],
      description: t(lang, "hints.camHeight"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["Wheel"],
      description: t(lang, "hints.camZoom"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["2×", "Click"],
      description: t(lang, "hints.camOrbit"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["Esc"],
      description: t(lang, "hints.camOrbitExit"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["RMB", "Drag"],
      description: t(lang, "hints.camRightPan"),
      category: t(lang, "hints.catCamera"),
    },
    {
      keys: ["←", "→"],
      description: t(lang, "hints.tourNav"),
      category: t(lang, "hints.catTour"),
    },
    {
      keys: ["Enter"],
      description: t(lang, "hints.tourEnter"),
      category: t(lang, "hints.catTour"),
    },
    {
      keys: ["Esc"],
      description: t(lang, "hints.tourEsc"),
      category: t(lang, "hints.catTour"),
    },
    {
      keys: ["N"],
      description: t(lang, "hints.triageNext"),
      category: t(lang, "hints.catTriage"),
    },
    {
      keys: ["P"],
      description: t(lang, "hints.triagePrev"),
      category: t(lang, "hints.catTriage"),
    },
  ];
}

interface KeyboardHintsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHints({ isOpen, onClose }: KeyboardHintsProps) {
  const lang = useStore((s) => s.prefs.lang);
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
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        // The close button is the dialog's only interactive control.
        e.preventDefault();
        e.stopPropagation();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  const handleBackdrop = (e: React.MouseEvent): void => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  const shortcuts = buildShortcuts(lang);
  const categories = [...new Set(shortcuts.map((s) => s.category ?? ""))];

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t(lang, "hints.aria")}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        pointerEvents: "auto",
        background: "rgba(8, 8, 7, 0.55)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        className="font-jetbrains animate-fade-up"
        style={{
          background: "rgba(18, 18, 16, 0.96)",
          border: "1px solid rgba(232,178,60,0.3)",
          borderRadius: 12,
          padding: "1.25rem",
          width: 400,
          maxWidth: "100%",
          maxHeight: "calc(100dvh - 2rem)",
          overflowY: "auto",
          boxShadow: "0 0 24px rgba(232,178,60,0.12), 0 8px 24px rgba(0,0,0,0.5)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-jetbrains text-xs tracking-widest" style={{ color: "#f2d5a0" }}>
            ⌨ {t(lang, "hints.header")}
          </span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="btn-ghost w-9 h-9 flex items-center justify-center !p-0 text-xs"
            aria-label={t(lang, "hints.closeAria")}
          >
            ✕
          </button>
        </div>

        {/* Grouped shortcuts */}
        {categories.map((cat) => (
          <div key={cat} className="mb-3 last:mb-0">
            <div
              className="font-jetbrains text-[11px] tracking-[0.2em] uppercase mb-3 pb-2"
              style={{
                color: "var(--meta-faint)",
                borderBottom: "1px solid rgba(232,178,60,0.08)",
              }}
            >
              {cat}
            </div>
            <div className="flex flex-col gap-3">
              {shortcuts
                .filter((s) => (s.category ?? "") === cat)
                .map((sh) => (
                  <div key={sh.description} className="flex items-center justify-between gap-3">
                    <span className="text-xs leading-relaxed" style={{ color: "#c1bbae" }}>
                      {sh.description}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {sh.keys.map((k) => (
                        <kbd
                          key={k}
                          className="font-jetbrains text-[11px] px-2 py-1 rounded"
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
