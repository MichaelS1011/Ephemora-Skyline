import { useLayoutEffect, useRef } from "react";
import { formatCount, t, type Lang } from "../i18n";
import type { LiveState } from "../live/types";
import { fullRescanLive, pauseLiveSession, resumeLiveSession } from "../live/session";

/**
 * The permanent half of the live promise.
 *
 * It hangs under the header and stays there while the watch runs. Pausing keeps
 * the band and the snapshot; the measured height is published as
 * `--live-band-h` so the breadcrumb trail can step below it instead of
 * disappearing behind it.
 */
export function LiveBand({ live, lang }: { live: LiveState; lang: Lang }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (): void => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty("--live-band-h", `${height}px`);
      }
    };
    write();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(write) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty("--live-band-h");
    };
  }, []);

  const text =
    live.status === "rescanning"
      ? t(lang, "live.rescanning", { progress: live.progress })
      : live.status === "paused"
        ? t(lang, "live.paused")
        : live.status === "error"
          ? live.errorCode === "ended"
            ? t(lang, "live.ended")
            : t(lang, "live.failed", { error: live.error || "—" })
          : live.lastSyncAt
            ? t(lang, "live.stale")
            : t(lang, "live.watching");

  const canPause =
    live.status === "watching" ||
    live.status === "updating" ||
    live.status === "paused" ||
    (live.status === "error" && live.errorCode === "failed");
  const resuming = live.status === "paused" || live.status === "error";

  return (
    <div
      ref={ref}
      className={`live-band is-${live.status}`}
      role="status"
      aria-live="polite"
      data-testid="live-band"
    >
      <span className="live-dot" aria-hidden="true" />
      <span className="live-text">{text}</span>
      {live.lastSyncAt !== null && live.status !== "rescanning" && (
        <span className="live-counts">
          {t(lang, "live.lastDelta", {
            changed: formatCount(lang, live.changed),
            added: formatCount(lang, live.added),
            removed: formatCount(lang, live.removed),
          })}
        </span>
      )}
      {live.status !== "rescanning" && canPause && (
        <button
          type="button"
          className="live-scan"
          onClick={() => (resuming ? resumeLiveSession() : pauseLiveSession())}
          title={resuming ? t(lang, "live.resumeTitle") : t(lang, "live.pauseTitle")}
        >
          {resuming ? t(lang, "live.resume") : t(lang, "live.pause")}
        </button>
      )}
      {live.status !== "rescanning" && (
        <button
          type="button"
          className="live-scan"
          onClick={() => void fullRescanLive()}
          title={t(lang, "live.fullScanTitle")}
        >
          {t(lang, "live.fullScan")}
        </button>
      )}
    </div>
  );
}
