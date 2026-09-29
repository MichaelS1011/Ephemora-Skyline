"use client";

import { useState } from "react";
import { useStore } from "../stores/useStore";
import {
  SCAN_PROFILES,
  configPayload,
  loadSavedProfile,
  type ScanProfile,
} from "../config/scanProfiles";
import { ProfileConfirmDialog } from "./ProfileConfirmDialog";

/**
 * Shared scan-profile chip row — rendered on the Landing (before the pick)
 * and inside the AnalyzePanel (for the next in-city scan). Clicking a chip
 * does NOT silently switch: it opens a "what exactly will be scanned?"
 * dialog and the user confirms yes/no. Configuration is deliberately one
 * opt-in layer below the primary action, never a gate.
 */
export function ProfileChips({ variant }: { variant: "landing" | "analyze-panel" }) {
  const scanProfile = useStore((s) => s.scanProfile);
  const setScanProfile = useStore((s) => s.setScanProfile);
  // Which profile's details are open (null = closed)
  const [detailFor, setDetailFor] = useState<ScanProfile | null>(null);
  // Set on pointerdown so the chip reacts before the dialog even mounts —
  // the click never looks like it did nothing.
  const [pending, setPending] = useState<ScanProfile | null>(null);

  const active = scanProfile ?? loadSavedProfile();
  const meta = SCAN_PROFILES.find((p) => p.id === active) ?? SCAN_PROFILES[1]!;

  return (
    <div
      className={variant === "landing" ? "flex flex-col items-center gap-1.5 w-full mb-1" : "mb-2"}
    >
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {SCAN_PROFILES.map((p) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              onPointerDown={() => setPending(p.id)}
              onClick={() => setDetailFor(p.id)}
              aria-pressed={isActive}
              title={`${p.label}: ${p.summary} — click to see exactly what gets scanned`}
              className="font-jetbrains text-[10.5px] px-2.5 py-1.5 rounded-full cursor-pointer transition-all duration-150 hover:brightness-135 active:scale-[0.96] active:brightness-160"
              style={{
                border: `1px solid ${isActive ? "rgba(255,98,66,0.9)" : "rgba(150,142,128,0.38)"}`,
                color: isActive ? "#ff8f76" : "#d2cec4",
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
                background: isActive
                  ? "linear-gradient(180deg, rgba(232,84,60,0.32), rgba(232,84,60,0.15))"
                  : "linear-gradient(180deg, rgba(58,60,64,0.92), rgba(32,33,36,0.94))",
                boxShadow: isActive
                  ? "0 2px 16px rgba(232,84,60,0.42), inset 0 1px 0 rgba(255,255,255,0.12)"
                  : pending === p.id
                    ? "inset 0 0 0 1px rgba(232,84,60,0.5)"
                    : "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {p.icon} {p.label}
            </button>
          );
        })}
      </div>
      <div
        className="font-jetbrains text-[9px] text-center"
        style={{ color: "var(--meta, #8296b5)" }}
        title="What gets analyzed and how long it takes — click any profile chip for the exact list of checks before choosing it"
      >
        {meta.summary} · takes{" "}
        {configPayload(active).profile === "quick"
          ? "under 30s"
          : configPayload(active).profile === "deep"
            ? "1-3 min"
            : "~40s"}{" "}
        ·{" "}
        <span style={{ color: "var(--meta-strong)" }}>
          click a profile to see exactly what it scans
        </span>
      </div>

      {detailFor && (
        <ProfileConfirmDialog
          profile={detailFor}
          onConfirm={() => {
            setScanProfile(detailFor);
            setDetailFor(null);
            setPending(null);
          }}
          onCancel={() => {
            setDetailFor(null);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
