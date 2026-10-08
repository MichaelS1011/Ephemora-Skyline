import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
import { ts } from "./startCopy";
import "../design/start.css";

/** The id this address asks the local server for — the honest subject line. */
function cityInAddress(): string | null {
  const id = new URLSearchParams(window.location.search).get("city");
  return id && id.length > 6 ? `${id.slice(0, 8)}…${id.slice(-4)}` : null;
}

interface LoadingScreenProps {
  isVisible: boolean;
}

/**
 * Shown while the app waits for a city the address asked for. The four boot
 * lines this screen used to type out on a timer were decoration with a
 * `>` in front of them: they advanced whether the server answered or not.
 * What is on screen now is what is actually known — which id is being asked
 * for, and how long the asking has taken.
 */
export function LoadingScreen({ isVisible }: LoadingScreenProps) {
  const lang = useStore((s) => s.prefs.lang);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  const city = cityInAddress();

  useEffect(() => {
    if (isVisible) {
      started.current = Date.now();
      setSeconds(0);
      const id = setInterval(() => {
        setSeconds(Math.round((Date.now() - started.current) / 1000));
      }, 500);
      return () => clearInterval(id);
    }
    setIsFadingOut(true);
    const id = setTimeout(() => setIsFadingOut(false), 450);
    return () => clearTimeout(id);
  }, [isVisible]);

  if (!isVisible && !isFadingOut) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t(lang, "load.aria")}
      className={`start-boot ${seconds >= 5 ? "is-slow" : ""}`}
      style={{ opacity: isFadingOut && !isVisible ? 0 : 1 }}
    >
      <p className="start-boot-line">
        <span aria-hidden="true" className="start-boot-caret">
          &gt;
        </span>{" "}
        {city ? (
          <>
            {ts(lang, "start.loadingCity")} <code className="start-boot-id">{city}</code>
          </>
        ) : (
          t(lang, "load.line1").replace(/^>\s*/, "")
        )}
      </p>
      <p className="start-boot-meta">
        {t(lang, "scan.elapsed", { s: seconds })}
        {seconds >= 5 && <> · {ts(lang, "start.stillLoading", { s: seconds })}</>}
      </p>
    </div>
  );
}
