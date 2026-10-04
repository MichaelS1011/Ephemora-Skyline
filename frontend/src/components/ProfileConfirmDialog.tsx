"use client";

import { useEffect, useRef } from "react";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
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
 * "What exactly will be scanned?" — opens inline under the profile chips when
 * a chip is clicked. Deliberately NOT a modal anymore (#50): the old portalled
 * overlay blocked reading a second profile and floated over other surfaces.
 * Clicking another chip re-renders this card in place, so Standard and Deep
 * can be compared one after the other without losing the first one's context;
 * nothing activates until "Use this profile". Esc or ✕ closes it.
 * The duration line reads PROFILE_DURATION — the single measured source
 * (see scanProfiles.ts); there is no second number anywhere.
 */
export function ProfileConfirmDialog({ profile, onConfirm, onCancel }: ProfileConfirmDialogProps) {
  const lang = useStore((s) => s.prefs.lang);
  const cardRef = useRef<HTMLElement>(null);
  const meta = SCAN_PROFILES.find((p) => p.id === profile) ?? SCAN_PROFILES[1]!;
  const activeEngines = new Set(PROFILE_ENGINES[profile]);
  const custom = profile === "custom";

  useEffect(() => {
    // Move focus to the card when it opens or switches profile, so Esc works
    // without a focus trap and screen readers announce the new content.
    cardRef.current?.focus();
  }, [profile]);

  return (
    <aside
      ref={cardRef}
      className="profile-detail"
      role="region"
      tabIndex={-1}
      aria-label={t(lang, "detail.aria", { label: t(lang, meta.label) })}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="profile-detail-head">
        <h3>{t(lang, "detail.title", { icon: meta.icon, label: t(lang, meta.label) })}</h3>
        <button
          onClick={onCancel}
          aria-label={t(lang, "profile.closeAria")}
          className="btn-danger w-6 h-6 flex items-center justify-center !p-0 shrink-0"
        >
          ✕
        </button>
      </div>
      <p className="profile-detail-lede">{t(lang, "detail.lede")}</p>

      <div className="profile-detail-engines">
        {ENGINES.map((engine) => {
          const on = activeEngines.has(engine.id);
          return (
            <div key={engine.id} className={`profile-engine-row${on ? " on" : ""}`}>
              <span className="profile-engine-mark" aria-hidden="true">
                {on ? "✓" : "—"}
              </span>
              <div className="min-w-0">
                <div className="profile-engine-name">
                  <span aria-hidden="true" className="mr-1">
                    {engine.icon}
                  </span>
                  {t(lang, engine.name)}
                  <span className="profile-engine-state">
                    {t(lang, on ? "engine.included" : "engine.skipped")}
                  </span>
                </div>
                <div className="profile-engine-what">{t(lang, engine.what)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="profile-detail-meta">
        <div>
          <b>{t(lang, "detail.report")}</b> <span>{t(lang, PROFILE_SCOPE[profile])}</span>
        </div>
        <div>
          <b>{t(lang, "detail.time")}</b> <span>{PROFILE_DURATION[profile]}</span>
        </div>
      </div>

      {custom && (
        <p className="profile-detail-note" role="note">
          {t(lang, "detail.customNote")}
        </p>
      )}

      <div className="profile-detail-actions">
        <button onClick={onConfirm} className="profile-detail-use">
          {t(lang, "detail.use")}
        </button>
        <button onClick={onCancel} className="profile-detail-close">
          {t(lang, "detail.keep")}
        </button>
      </div>
    </aside>
  );
}
