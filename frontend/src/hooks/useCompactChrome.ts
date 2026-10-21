import { useEffect, useState } from "react";

/**
 * The 1200 px line where the wide chrome gives way to the compact one.
 * Read through matchMedia, not a resize listener of its own, so the choice
 * follows the same query the stylesheet documents.
 */
export function useCompactChrome(): boolean {
  const query = "(max-width: 1200px)";
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = (): void => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return compact;
}
