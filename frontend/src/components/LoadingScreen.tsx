import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
import { ts } from "./startCopy";
import "../design/start.css";

/** The scan id this address asks for, plus its short display form. */
function cityInAddress(): { raw: string; shown: string } | null {
  const id = new URLSearchParams(window.location.search).get("city");
  return id && id.length > 6 ? { raw: id, shown: `${id.slice(0, 8)}…${id.slice(-4)}` } : null;
}

interface LoadingScreenProps {
  isVisible: boolean;
}

/**
 * Shown while the app waits for a city the address asked for. The four boot
 * lines this screen used to type out on a timer were decoration with a
 * `>` in front of them: they advanced whether the server answered or not.
 * What is on screen now is what is actually known — a plain sentence about what
 * this city is, the scan id in the tooltip as the proof it points at, and how
 * long the asking has taken.
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
      // During the 450 ms fade the node is still mounted at inset:0/z-100
      // (start.css `.start-boot`); opacity 0 alone still hit-tests, so it must
      // stop catching the first click on the city the moment it begins to go.
      style={{
        opacity: isFadingOut && !isVisible ? 0 : 1,
        pointerEvents: isFadingOut && !isVisible ? "none" : undefined,
      }}
    >
      <p className="start-boot-line">
        <span aria-hidden="true" className="start-boot-caret">
          &gt;
        </span>{" "}
        {city ? (
          <>
            {t(lang, "load.cityExplained")}{" "}
            <code className="start-boot-id" title={`${ts(lang, "start.loadingCity")} ${city.raw}`}>
              {city.shown}
            </code>
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
