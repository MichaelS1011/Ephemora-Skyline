"use client";

import { useStore } from "../stores/useStore";
import { SCAN_PROFILES, configPayload, loadSavedProfile } from "../config/scanProfiles";

/**
 * Shared scan-profile chip row — rendered on the Landing (before the pick)
 * and inside the AnalyzePanel (for the next in-city scan). Configuration is
 * deliberately one opt-in layer below the primary action, never a gate.
 */
export function ProfileChips({ variant }: { variant: "landing" | "analyze-panel" }) {
  const scanProfile = useStore((s) => s.scanProfile);
  const setScanProfile = useStore((s) => s.setScanProfile);

  const active = scanProfile ?? loadSavedProfile();
  const meta = SCAN_PROFILES.find((p) => p.id === active) ?? SCAN_PROFILES[1]!;

  return (
    <div
      className={variant === "landing" ? "flex flex-col items-center gap-1.5 w-full mb-1" : "mb-2"}
    >
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {SCAN_PROFILES.map((p) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              onClick={() => setScanProfile(p.id)}
              aria-pressed={isActive}
              title={`${p.label}: ${p.summary}`}
              className="font-jetbrains text-[9.5px] px-2 py-1 rounded-sm cursor-pointer transition-all duration-150 hover:brightness-125"
              style={{
                border: `1px solid ${isActive ? "rgba(0,255,159,0.6)" : "rgba(90,130,200,0.25)"}`,
                color: isActive ? "#00ff9f" : "#7d95b8",
                background: isActive ? "rgba(0,255,159,0.07)" : "rgba(6,10,24,0.6)",
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
      >
        {meta.summary} · scans{" "}
        {configPayload(active).profile === "quick"
          ? "≤30s"
          : configPayload(active).profile === "deep"
            ? "1-3 min"
            : "~40s"}
      </div>
    </div>
  );
}
