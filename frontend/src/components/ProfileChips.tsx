"use client";

import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import {
  SCAN_PROFILES,
  loadSavedProfile,
  categoriesForProfile,
  type ScanProfile,
} from "../config/scanProfiles";
import { FINDING_CATEGORIES, categoryMeta } from "../config/findingCategories";
import { fetchRulePacks, loadSavedPacksRead } from "../config/rulePacks";
import { ProfileConfirmDialog } from "./ProfileConfirmDialog";
import "../design/profile-picker.css";
import { t } from "../i18n";

export function ProfileChips({ variant }: { variant: "landing" | "analyze-panel" }) {
  const lang = useStore((s) => s.prefs.lang);
  const scanProfile = useStore((s) => s.scanProfile);
  const setScanProfile = useStore((s) => s.setScanProfile);
  const scanCategories = useStore((s) => s.scanCategories);
  const toggleScanCategory = useStore((s) => s.toggleScanCategory);
  const scanPacks = useStore((s) => s.scanPacks);
  const toggleScanPack = useStore((s) => s.toggleScanPack);
  const availablePacks = useStore((s) => s.availablePacks);
  const setAvailablePacks = useStore((s) => s.setAvailablePacks);
  const [detailFor, setDetailFor] = useState<ScanProfile | null>(null);
  const [packsUnreadable, setPacksUnreadable] = useState(false);
  // The other door of the same class: not the disk question to the backend,
  // but the SAVED SELECTION on this browser. Corrupt bytes used to load as
  // "no packs chosen" and the store's prune-on-set turned that into a fresh
  // save over the file. The bytes now stay quarantined (rulePacks.ts); this
  // is the word, in the note family the row already uses.
  const [packsStorageUnreadable] = useState(() => loadSavedPacksRead().state === "unreadable");
  const active = scanProfile ?? loadSavedProfile();
  const meta = SCAN_PROFILES.find((p) => p.id === active) ?? SCAN_PROFILES[1]!;
  const effectiveCategories = categoriesForProfile(active, scanCategories);
  const onlyOneLeft = effectiveCategories.length === 1;
  // The entry screen asks one question — which profile. Narrowing it by category
  // or rule pack is a second decision, and the operator took it off the first
  // screen on 2026-10-11; the city, where the reader already has context, keeps it.
  const showsScope = variant === "analyze-panel";

  // Which packs exist is a question about the disk, so it is asked of the
  // backend once per mount — and only where the answer is on screen. Asking
  // anyway would leave a network call for decoration nobody can see.
  // An empty answer shows no chips: an empty choice is honest, a fake one is
  // not. A read that failed is not an empty answer: it says so in words, and
  // it must not reach setAvailablePacks — pruning saved ids against bytes
  // nobody read would rewrite the selection from a failure.
  useEffect(() => {
    if (!showsScope) return;
    let cancelled = false;
    void fetchRulePacks().then((result) => {
      if (cancelled) return;
      if (result.state === "read") {
        setPacksUnreadable(false);
        setAvailablePacks(result.packs);
      } else {
        setPacksUnreadable(result.state === "unreadable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showsScope, setAvailablePacks]);
  return (
    <div className={`profile-picker profile-picker-${variant}`}>
      <div className="profile-options" aria-label={t(lang, "profile.chipsAria")}>
        {SCAN_PROFILES.map((profile) => (
          <button
            key={profile.id}
            onClick={() => setDetailFor(profile.id)}
            aria-pressed={profile.id === active}
            title={`${t(lang, profile.label)}: ${t(lang, profile.summary)}`}
          >
            {profile.id === active && <span aria-hidden="true">✓ </span>}
            {t(lang, profile.label)}
          </button>
        ))}
      </div>
      <p className="profile-description">
        {t(lang, meta.summary)} <span>{t(lang, "profile.durationNote")}</span>
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
      {showsScope && (
        <>
          <p className="category-caption">{t(lang, "profile.lookFor")}</p>
          <div className="profile-options category-options" aria-label={t(lang, "profile.lookFor")}>
            {FINDING_CATEGORIES.map((category) => {
              const on = effectiveCategories.includes(category.id);
              return (
                <button
                  key={category.id}
                  onClick={() => toggleScanCategory(category.id)}
                  aria-pressed={on}
                  disabled={on && onlyOneLeft}
                  title={
                    t(lang, category.meaning) +
                    (on && onlyOneLeft ? t(lang, "profile.lastKindSuffix") : "")
                  }
                >
                  {on && <span aria-hidden="true">✓ </span>}
                  {t(lang, category.label)}
                </button>
              );
            })}
          </div>
        </>
      )}
      {showsScope && packsUnreadable && (
        <p className="profile-description pack-note" role="alert" data-packs-unreadable="true">
          ⚠ {t(lang, "profile.packsUnreadable")}
        </p>
      )}
      {showsScope && packsStorageUnreadable && (
        <p
          className="profile-description pack-note"
          role="alert"
          data-packs-storage-unreadable="true"
        >
          ⚠ {t(lang, "profile.packsStorageUnreadable")}
        </p>
      )}
      {showsScope && availablePacks.length > 0 && (
        <>
          <p className="category-caption">{t(lang, "profile.packsCaption")}</p>
          <div className="profile-options pack-options" aria-label={t(lang, "profile.packsAria")}>
            <button
              onClick={() => scanPacks.forEach((id) => toggleScanPack(id))}
              aria-pressed={scanPacks.length === 0}
              title={t(lang, "profile.packNoneTip")}
            >
              {scanPacks.length === 0 && <span aria-hidden="true">✓ </span>}
              {t(lang, "profile.packNone")}
            </button>
            {availablePacks.map((pack) => {
              const on = scanPacks.includes(pack.id);
              return (
                <button
                  key={pack.id}
                  onClick={() => toggleScanPack(pack.id)}
                  aria-pressed={on}
                  title={
                    t(lang, pack.ruleCount === 1 ? "profile.packTipOne" : "profile.packTip", {
                      count: pack.ruleCount,
                      source: pack.source,
                      license: pack.license,
                      version: pack.version,
                    }) +
                    ` · ${t(lang, pack.origin === "shipped" ? "profile.packShipped" : "profile.packFetched")} · ${pack.categories
                      .map((c) => t(lang, categoryMeta(c).label))
                      .join(", ")}`
                  }
                >
                  {on && <span aria-hidden="true">✓ </span>}
                  {pack.name} · {pack.ruleCount}
                </button>
              );
            })}
          </div>
          {scanPacks.length > 0 && (
            <p className="profile-description pack-note">{t(lang, "profile.packOffline")}</p>
          )}
        </>
      )}
    </div>
  );
}
