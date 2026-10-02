"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ENGINES,
  PROFILE_DURATION,
  PROFILE_ENGINES,
  PROFILE_SCOPE,
  SCAN_PROFILES,
  type ScanProfile,
} from "../config/scanProfiles";

interface ProfileConfirmDialogProps {
  profile: ScanProfile;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "What exactly will be scanned?" — opens when a profile chip is clicked.
 * Shows every engine that will (not) run in plain language, the scope of
 * the report and the expected duration, then asks for a yes/no. Esc or
 * backdrop click = no.
 */
export function ProfileConfirmDialog({ profile, onConfirm, onCancel }: ProfileConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const meta = SCAN_PROFILES.find((p) => p.id === profile) ?? SCAN_PROFILES[1]!;
  const activeEngines = new Set(PROFILE_ENGINES[profile]);
  const custom = profile === "custom";

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      // WCAG 2.1.2: this is aria-modal, so keyboard focus must not escape
      // into the page behind the dialog — wrap Tab/Shift-Tab inside it.
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(10, 10, 9, 0.7)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`What the ${meta.label} scan checks`}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up w-full max-w-md max-h-[88vh] overflow-y-auto panel-scroll"
        style={{
          background: "rgba(18, 18, 16, 0.97)",
          border: "1px solid rgba(232,80,60,0.35)",
          borderRadius: 6,
          padding: "1rem 1.25rem",
          boxShadow: "0 0 32px rgba(232,80,60,0.12), 0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <h2
            className="font-jetbrains text-sm font-bold tracking-wide"
            style={{ color: "#f2efe8" }}
          >
            {meta.icon} {meta.label} scan
          </h2>
          <button
            onClick={onCancel}
            aria-label="Close without changing the profile"
            className="btn-danger w-6 h-6 flex items-center justify-center !p-0 shrink-0"
          >
            ✕
          </button>
        </div>
        <p
          className="font-jetbrains text-[11px] leading-relaxed mb-3"
          style={{ color: "var(--meta-strong)" }}
        >
          Here is exactly what will be checked. Nothing is uploaded anywhere else — files stay on
          your machine.
        </p>

        {/* Engine checklist */}
        <div className="flex flex-col gap-1.5 mb-3">
          {ENGINES.map((engine) => {
            const on = activeEngines.has(engine.id);
            return (
              <div
                key={engine.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded"
                style={{
                  background: on ? "rgba(41,211,152,0.05)" : "rgba(150,142,128,0.05)",
                  border: `1px solid ${on ? "rgba(41,211,152,0.22)" : "rgba(150,142,128,0.14)"}`,
                  opacity: on ? 1 : 0.62,
                }}
              >
                <span
                  className="font-jetbrains text-[11px] shrink-0 w-4 text-center"
                  style={{ color: on ? "#29d398" : "var(--meta-faint)" }}
                  aria-hidden="true"
                >
                  {on ? "✓" : "—"}
                </span>
                <div className="min-w-0">
                  <div
                    className="font-jetbrains text-[11px] font-semibold"
                    style={{ color: on ? "#e8e4da" : "var(--meta)" }}
                  >
                    <span aria-hidden="true" className="mr-1">
                      {engine.icon}
                    </span>
                    {engine.name}
                    <span
                      className="ml-1.5 font-normal"
                      style={{ color: on ? "#29d398" : "var(--meta-faint)" }}
                    >
                      {on ? "included" : "skipped"}
                    </span>
                  </div>
                  <div
                    className="font-jetbrains text-[11px] leading-snug"
                    style={{ color: "var(--meta)" }}
                  >
                    {engine.what}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scope + duration */}
        <div
          className="px-2.5 py-2 rounded mb-3 font-jetbrains text-[11px] leading-relaxed"
          style={{
            background: "rgba(242,239,232,0.04)",
            border: "1px solid rgba(242,239,232,0.12)",
          }}
        >
          <div style={{ color: "var(--meta-strong)" }}>
            <span className="tracking-widest">REPORT:</span>{" "}
            <span style={{ color: "#cfcabe" }}>{PROFILE_SCOPE[profile]}</span>
          </div>
          <div style={{ color: "var(--meta-strong)" }}>
            <span className="tracking-widest">DURATION:</span>{" "}
            <span style={{ color: "#cfcabe" }}>about {PROFILE_DURATION[profile]}</span>
          </div>
        </div>

        {custom && (
          <p className="font-jetbrains text-[11px] mb-3" style={{ color: "#ffd23f" }} role="note">
            ⚠ The custom pattern editor is coming soon — choosing it for now runs the standard
            profile.
          </p>
        )}

        {/* Yes / No — the confirm button is the dialog's primary and is
            focused on open, so Enter commits without a Tab hunt */}
        <div className="flex items-center gap-2">
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="flex-1 py-2 font-jetbrains text-[11px] tracking-widest font-semibold rounded
                       transition-all duration-150 hover:brightness-110
                       focus:outline-none focus:ring-2 focus:ring-[#e8503c]"
            style={{
              background: "#e8503c",
              border: "1px solid #e8503c",
              color: "#161614",
            }}
          >
            ✓ YES — USE THIS PROFILE
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 font-jetbrains text-[11px] tracking-widest rounded
                       transition-all duration-150 hover:brightness-125
                       focus:outline-none focus:ring-1 focus:ring-[#e8503c]"
            style={{
              background: "rgba(22,22,20,0.7)",
              border: "1px solid rgba(165,158,144,0.35)",
              color: "#cfcabe",
            }}
          >
            ← NO, KEEP CURRENT
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
