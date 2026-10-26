"use client";

/**
 * One honest sentence when the stored preferences could not be read.
 *
 * `loadPrefs` answering defaults to corrupt bytes made "your settings file is
 * broken" render identical to "you never had settings" — the reader who turned
 * on the colour-blind-safe alarms lost them without a word, and the next
 * toggle of any preference overwrote the blob. The read now says which of the
 * three states it is (see `PrefsRead` in prefs.ts), the bytes are quarantined
 * before anything can eat them, and this note is the words on the screen.
 *
 * It is NOT a new surface: it reuses the app-level alert slot the permalink
 * error already occupies (same anchor, same dismiss control, same style
 * family) and the note vocabulary of the verdicts and rule-pack rounds —
 * `.panel-note` + `role="alert"` + a leading ⚠, so the fact rides on words
 * and glyph, never on colour alone (prefs.ts:48, closed 2026-10-26).
 */
import { useState } from "react";
import { loadPrefsRead } from "../prefs";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";

export function PrefsNote() {
  const lang = useStore((s) => s.prefs.lang);
  // Read once at mount, through the product's own reader: the note answers a
  // fact about the disk, not a value kept twice in two places.
  const [unreadable] = useState(() => loadPrefsRead().state === "unreadable");
  const [dismissed, setDismissed] = useState(false);
  if (!unreadable || dismissed) return null;
  return (
    <div
      role="alert"
      data-prefs-unreadable="true"
      className="panel-note absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                 font-jetbrains text-[length:var(--fs-meta)] px-4 py-2.5 rounded"
      style={{
        background: "rgba(32, 16, 12, 0.92)",
        border: "1px solid rgba(255, 107, 107, 0.45)",
        color: "#ffb4b4",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        backdropFilter: "blur(10px)",
        maxWidth: 560,
        width: "calc(100% - 32px)",
      }}
    >
      <span>⚠ {t(lang, "app.prefsUnreadable")}</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t(lang, "app.dismissAria")}
        className="cursor-pointer shrink-0 hover:brightness-125"
        style={{ color: "#ff8f9a" }}
      >
        ✕
      </button>
    </div>
  );
}
