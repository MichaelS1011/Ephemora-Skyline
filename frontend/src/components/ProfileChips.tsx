"use client";

import { useState } from "react";
import { useStore } from "../stores/useStore";
import {
  SCAN_PROFILES,
  PROFILE_DURATION,
  loadSavedProfile,
  type ScanProfile,
} from "../config/scanProfiles";
import { FINDING_CATEGORIES } from "../config/findingCategories";
import { ProfileConfirmDialog } from "./ProfileConfirmDialog";
import "../design/profile-picker.css";
import { t } from "../i18n";

export function ProfileChips({ variant }: { variant: "landing" | "analyze-panel" }) {
  const lang = useStore((s) => s.prefs.lang);
  const scanProfile = useStore((s) => s.scanProfile);
  const setScanProfile = useStore((s) => s.setScanProfile);
  const scanCategories = useStore((s) => s.scanCategories);
  const toggleScanCategory = useStore((s) => s.toggleScanCategory);
  const [detailFor, setDetailFor] = useState<ScanProfile | null>(null);
  const active = scanProfile ?? loadSavedProfile();
  const meta = SCAN_PROFILES.find((p) => p.id === active) ?? SCAN_PROFILES[1]!;
  const onlyOneLeft = scanCategories.length === 1;
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
        {meta.summary}{" "}
        <span>{t(lang, "profile.estimated", { time: PROFILE_DURATION[active] })}</span>
      </p>
      {/* The detail card sits in the normal flow, directly under the chips it
          describe — no portal, no overlay (#50). Clicking another chip swaps
          its content, so two profiles can be read back to back. */}
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
      <p className="category-caption">{t(lang, "profile.lookFor")}</p>
      <div className="profile-options category-options" aria-label={t(lang, "profile.lookFor")}>
        {FINDING_CATEGORIES.map((category) => {
          const on = scanCategories.includes(category.id);
          return (
            <button
              key={category.id}
              onClick={() => toggleScanCategory(category.id)}
              aria-pressed={on}
              disabled={!on && onlyOneLeft}
              title={
                category.meaning +
                (on && onlyOneLeft ? " — the last kind stays on; a scan of nothing is no scan" : "")
              }
            >
              {on && <span aria-hidden="true">✓ </span>}
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
