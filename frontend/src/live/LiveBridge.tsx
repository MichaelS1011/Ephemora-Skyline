import { useEffect } from "react";
import { useStore } from "../stores/useStore";
import { startLiveSession } from "./session";

/**
 * The one bridge between the Landing's scan hook and the watch loop.
 *
 * Landing unmounts when the city arrives, so the hook cannot own the timer.
 * It leaves `pendingLive` in the store; this component starts the session and
 * then stays out of the way. Starting twice for the same analysis is a no-op.
 */
export function LiveBridge() {
  const pending = useStore((s) => s.pendingLive);
  useEffect(() => {
    if (!pending) return;
    if (useStore.getState().cityData?.analysisId !== pending.analysisId) return;
    startLiveSession(pending);
  }, [pending]);
  return null;
}
