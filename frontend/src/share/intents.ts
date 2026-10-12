/**
 * The four platforms, and the truth about what a browser can ask of them.
 *
 * A local file cannot be handed to any of these pages by a link: X web intents
 * carry no media, Instagram has no web draft, Reddit takes a title and then
 * wants a URL it can fetch, and LinkedIn builds its preview only from a public
 * address that has to exist first. So this module never promises a preview. It
 * builds the draft that IS possible, the app puts the full text on the
 * clipboard, and the file is already in the downloads.
 *
 * `X_TEXT_LIMIT` and `REDDIT_TITLE_LIMIT` are the platforms' own bounds, quoted
 * so a caller can see why a long caption is not silently chopped up.
 */

import { SHARE_LINK } from "./config";

export type PlatformId = "instagram" | "reddit" | "x" | "linkedin";

export const X_TEXT_LIMIT = 280;
export const REDDIT_TITLE_LIMIT = 300;

/** The order the operator asked for, and the only order this file renders in. */
export const PLATFORM_ORDER: PlatformId[] = ["instagram", "reddit", "x", "linkedin"];

export interface BuiltIntent {
  id: PlatformId;
  name: string;
  /** The compose address, or the plain site when no draft can be prefilled. */
  url: string;
  /** False only where a click would do nothing useful: LinkedIn without a link. */
  available: boolean;
  /** Whether the text actually reached the draft, or travels by clipboard only. */
  textPrefilled: boolean;
}

/** One line, cut at the platform's own length bound. Never a wrapped paragraph. */
function oneLine(text: string, limit: number): { value: string; cut: boolean } {
  const line = text.split("\n")[0]!.trim();
  return line.length > limit
    ? { value: line.slice(0, limit - 1).trimEnd() + "…", cut: true }
    : { value: line, cut: false };
}

export function buildIntent(id: PlatformId, caption: string, link: string): BuiltIntent {
  switch (id) {
    case "x": {
      // The draft carries text only when the whole caption fits. A clipped
      // caption would post a different sentence than the one the user read,
      // so the text stays on the clipboard instead.
      const fits = caption.length <= X_TEXT_LIMIT;
      const url = fits
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`
        : "https://twitter.com/compose/tweet";
      return { id, name: "X", url, available: true, textPrefilled: fits };
    }
    case "reddit": {
      const title = oneLine(caption, REDDIT_TITLE_LIMIT);
      return {
        id,
        name: "Reddit",
        url: `https://www.reddit.com/submit?title=${encodeURIComponent(title.value)}`,
        available: true,
        textPrefilled: !title.cut,
      };
    }
    case "instagram":
      // No web draft exists. Opening the site with the text in the clipboard is
      // the whole of what this row can honestly do.
      return {
        id,
        name: "Instagram",
        url: "https://www.instagram.com/",
        available: true,
        textPrefilled: false,
      };
    case "linkedin": {
      if (!link) {
        return {
          id,
          name: "LinkedIn",
          url: "https://www.linkedin.com/",
          available: false,
          textPrefilled: false,
        };
      }
      return {
        id,
        name: "LinkedIn",
        url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
        available: true,
        textPrefilled: true,
      };
    }
  }
}

/** The link the row would share, or "" while the operator has set none. */
export const platformLink = (): string => SHARE_LINK;
