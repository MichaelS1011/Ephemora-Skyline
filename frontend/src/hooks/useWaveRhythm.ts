import { useEffect } from "react";

/**
 * The rhythm of the crowd's wave: ask once a second, wave when the answer says
 * so. Kept apart from the picker on purpose — the picker needs a camera, a
 * scene and a crowd, and a test that rebuilt those would measure the test
 * rather than the product. `ask` decides; this only keeps the beat and stops
 * with the component that asked for it.
 */
export function useWaveRhythm(ask: () => boolean, wave: () => void, tickMs = 1000): void {
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (ask()) wave();
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [ask, wave, tickMs]);
}
