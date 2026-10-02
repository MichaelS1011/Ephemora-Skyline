"use client";

import { useState } from "react";
import { useStore } from "../stores/useStore";
import {
  SCAN_PROFILES,
  PROFILE_DURATION,
  loadSavedProfile,
  type ScanProfile,
} from "../config/scanProfiles";
import { ProfileConfirmDialog } from "./ProfileConfirmDialog";

export function ProfileChips({ variant }: { variant: "landing" | "analyze-panel" }) {
  const scanProfile = useStore((s) => s.scanProfile);
  const setScanProfile = useStore((s) => s.setScanProfile);
  const [detailFor, setDetailFor] = useState<ScanProfile | null>(null);
  const active = scanProfile ?? loadSavedProfile();
  const meta = SCAN_PROFILES.find((p) => p.id === active) ?? SCAN_PROFILES[1]!;
  return (
    <div className={`profile-picker profile-picker-${variant}`}>
      <div className="profile-options" aria-label="Scan profile">
        {SCAN_PROFILES.map((profile) => (
          <button
            key={profile.id}
            onClick={() => setDetailFor(profile.id)}
            aria-pressed={profile.id === active}
            title={`${profile.label}: ${profile.summary}`}
          >
            {profile.id === active && <span aria-hidden="true">✓ </span>}
            {profile.label}
          </button>
        ))}
      </div>
      <p className="profile-description">
        {meta.summary} <span>Estimated time: {PROFILE_DURATION[active]}.</span>
      </p>
      {detailFor && (
        <ProfileConfirmDialog
          profile={detailFor}
          onConfirm={() => {
            setScanProfile(detailFor);
            setDetailFor(null);
          }}
          onCancel={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}
