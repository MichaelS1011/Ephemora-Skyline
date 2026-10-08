import { useEffect, useRef } from "react";
import { useStore } from "../stores/useStore";
import { t, type Lang } from "../i18n";
import {
  GROUP_LABELS,
  ROWS,
  groupOrder,
  resolve,
  rowsByRank,
  type Row,
  type Text,
} from "../interaction/shortcuts";
import { KeyEcho } from "../interaction/KeyEcho";
import "../design/griff.css";

/**
 * The shortcut list — built from `interaction/shortcuts.ts`, the registry that
 * names the file handling each key, so the list and the handlers cannot drift
 * apart unnoticed (`tests/keyboardRegistry.test.ts` fails the build if they do).
 *
 * Measured before: 20 rows, while 6 real bindings lived in components the list
 * never mentioned — the minimap's Enter, the search arrows, the "•••" menu
 * arrows, Escape as build skip, Escape as primer dismissal, and the skip
 * button's own key.
 */

function Keycap({ label }: { label: string }): React.ReactElement {
  return (
    <kbd
      className="font-jetbrains text-[11px] px-2 py-1 rounded"
      style={{
        background: "rgba(232,178,60,0.08)",
        border: "1px solid rgba(232,178,60,0.22)",
        color: "#f2d5a0",
        lineHeight: 1.4,
      }}
    >
      {label}
    </kbd>
  );
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

  const rows = rowsByRank(ROWS);
  const groups = groupOrder(ROWS);
  const note: Text = {
    key: "hints.echoNote",
    en: "A key this view cannot use says so above the dock — that line is the answer, not an error.",
    de: "Eine Taste, die diese Ansicht nicht kann, antwortet einen Satz über der Dockleiste — das ist die Antwort, kein Fehler.",
  };

  return (
    <>
      {/* The announcer lives here because App renders this component whether the
          list is open or not — and the keyboard needs an answer either way. */}
      <KeyEcho />
      {isOpen && (
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
              width: 440,
              maxWidth: "100%",
              maxHeight: "calc(100dvh - 2rem)",
              overflowY: "auto",
              boxShadow: "0 0 24px rgba(232,178,60,0.12), 0 8px 24px rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
            }}
          >
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

            {groups.map((group) => (
              <div key={group} className="mb-3 last:mb-0">
                <div
                  className="font-jetbrains text-[11px] tracking-[0.2em] uppercase mb-3 pb-2"
                  style={{
                    color: "var(--meta-faint)",
                    borderBottom: "1px solid rgba(232,178,60,0.08)",
                  }}
                >
                  {resolve(lang, GROUP_LABELS[group])}
                </div>
                <div className="flex flex-col gap-3">
                  {rows
                    .filter((r) => r.group === group)
                    .map((r) => (
                      <RowEntry key={r.id} row={r} lang={lang} />
                    ))}
                </div>
              </div>
            ))}

            <p
              className="font-jetbrains text-[11px] mt-4 pt-3"
              style={{
                color: "var(--meta-strong)",
                borderTop: "1px solid rgba(232,178,60,0.12)",
                lineHeight: 1.5,
              }}
            >
              {resolve(lang, note)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function RowEntry({ row, lang }: { row: Row; lang: Lang }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs leading-relaxed" style={{ color: "#c1bbae" }}>
        {resolve(lang, row.text)}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {row.keys.map((k) => (
          <Keycap key={`${row.id}-${k}`} label={k} />
        ))}
      </div>
    </div>
  );
}
