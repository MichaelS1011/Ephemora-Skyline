/**
 * The open/close seam between the "••• More" menu and the studio.
 *
 * The "••• More" menu and the studio's own store are maintained independently,
 * so this seam carries its own signal instead of adding a field to either. The
 * event name is the whole contract: dispatching it opens the studio, and the
 * studio owns its own open state from there.
 */

export const OPEN_STUDIO_EVENT = "ephemora:open-share-studio";

export function openStudio(): void {
  window.dispatchEvent(new Event(OPEN_STUDIO_EVENT));
}
