/**
 * The platform row under a finished picture or video.
 *
 * One click does two things: it opens the platform's own page, and it puts the
 * measured caption on the clipboard. Nothing is posted, nothing is sent, and no
 * request leaves before the click. Each row states in its own line what the
 * platform can take from a browser and what it cannot, so the user is not
 * surprised by an empty draft.
 */

import { useState } from "react";
import { t } from "../i18n";
import type { DictKey, Lang } from "../i18n";
import { buildIntent, PLATFORM_ORDER, platformLink } from "./intents";
import type { PlatformId } from "./intents";

/** One honest line per platform, all of them in the dictionary. */
const NOTE_KEY: Record<PlatformId, DictKey> = {
  instagram: "share.platform.instagram",
  reddit: "share.platform.reddit",
  x: "share.platform.x",
  linkedin: "share.platform.linkedin",
};

interface RowState {
  id: PlatformId;
  opened: boolean;
  copied: boolean;
}

export function SharePlatforms({ lang, caption }: { lang: Lang; caption: string }) {
  const [row, setRow] = useState<RowState | null>(null);
  const link = platformLink();

  const go = (id: PlatformId): void => {
    const intent = buildIntent(id, caption, link);
    if (!intent.available) return;
    // The tab opens first: a clipboard promise ahead of it would end the user
    // gesture, and browsers then refuse the new tab as a pop-up.
    const tab = window.open(intent.url, "_blank", "noopener,noreferrer");
    navigator.clipboard.writeText(caption).then(
      () => setRow({ id, opened: tab !== null, copied: true }),
      () => setRow({ id, opened: tab !== null, copied: false }),
    );
  };

  return (
    <div className="share-platforms">
      <h4>{t(lang, "share.platforms")}</h4>
      <p className="share-subtle">{t(lang, "share.platformNote")}</p>
      <ul>
        {PLATFORM_ORDER.map((id) => {
          const intent = buildIntent(id, caption, link);
          const active = row?.id === id;
          return (
            <li key={id} className={`share-platform${intent.available ? "" : " is-off"}`}>
              <span className="share-platform-name">{intent.name}</span>
              <span className="share-platform-note">{t(lang, NOTE_KEY[id])}</span>
              {intent.available ? (
                <button type="button" className="share-copy" onClick={() => go(id)}>
                  {t(lang, "share.platform.open", { name: intent.name })}
                </button>
              ) : (
                <span className="share-platform-off">{t(lang, "share.platform.off")}</span>
              )}
              {active && (
                <span className="share-platform-result" role="status" aria-live="polite">
                  {!row.opened
                    ? t(lang, "share.platform.popupBlocked", { name: intent.name })
                    : row.copied
                      ? t(lang, "share.platform.opened", { name: intent.name })
                      : t(lang, "share.platform.copyFailed")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
