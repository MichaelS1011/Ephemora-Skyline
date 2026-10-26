import {
  EPHE_MARKS,
  EPHE_VARIANTS,
  epheOutfit,
  type EpheMark,
  type EpheOutfit,
} from "./city/palette";

/**
 * MASTER-2027 §04.09 — the resident's look, kept on this machine.
 *
 * One key, one small object: which jacket column the reader picked and which
 * mark they gave it. The name is NOT here — a name belongs to an address and
 * lives in the per-project bucket of `epheNames.ts`, where a `street:` seat is
 * deliberately not durable. The look is different in kind: it is what the reader
 * wants the *next* resident to look like, so it rides on the browser, not on the
 * project.
 *
 * Two rules from the modules this one copies (`firstArrival.ts`, `pendingRun.ts`,
 * `epheNames.ts`):
 *
 * - **A value the writer would not write is not read back.** The jacket has to be
 *   one of `EPHE_VARIANTS` and the mark one of `EPHE_MARKS`. Anything else — an
 *   older build's index, a hand-edited key, a column that §04.06 rejected as a
 *   band foot — falls back to the shipped look rather than dressing the figure
 *   in something the vitrine cannot offer.
 * - **A write that did not land says so.** `saveEpheLook` returns whether
 *   storage took it, because a card that promises "kept on this machine" after a
 *   quota error is the defect the verdict store already had to fix.
 */

const KEY = "codecity-ephe-look:v1";

export interface EpheLook {
  jacket: number;
  mark: EpheMark;
}

/** What a fresh browser wears: the crowd's first family, and no mark. */
export const EPHE_DEFAULT_LOOK: EpheLook = { jacket: EPHE_VARIANTS[0], mark: "none" };

export function readEpheLook(): EpheLook {
  if (typeof window === "undefined") return { ...EPHE_DEFAULT_LOOK };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return { ...EPHE_DEFAULT_LOOK };
  }
  if (!raw) return { ...EPHE_DEFAULT_LOOK };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...EPHE_DEFAULT_LOOK };
    const { jacket, mark } = parsed as { jacket?: unknown; mark?: unknown };
    // Re-offered, not merely compared: a stored value that is not on the list
    // would otherwise put a chip on the panel that no chip is.
    if (typeof jacket !== "number" || !EPHE_VARIANTS.some((v) => v === jacket))
      return { ...EPHE_DEFAULT_LOOK, mark: isMark(mark) ? mark : "none" };
    return { jacket, mark: isMark(mark) ? mark : "none" };
  } catch {
    return { ...EPHE_DEFAULT_LOOK };
  }
}

/** Did the reader ever choose? The footprint card asks, to say it honestly. */
export function hasStoredLook(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Write the choice. `false` means it lives in this session only. */
export function saveEpheLook(look: EpheLook): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(look));
    return true;
  } catch {
    return false;
  }
}

export function clearEpheLook(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // A key that cannot be removed is reported by `hasStoredLook` staying true.
  }
}

function isMark(value: unknown): value is EpheMark {
  return typeof value === "string" && EPHE_MARKS.some((m) => m === value);
}

/**
 * MASTER-2027 §04.10 — which outfit a figure in the crowd wears.
 *
 * A resident the reader named wears the look the reader chose; every other
 * figure keeps the crowd's own index column. That is the whole rule, and it is
 * the visible answer to "persönliche Beziehung": your resident stands out from
 * the crowd because it is dressed the way you dressed it, not because it is
 * drawn by a second renderer.
 *
 * The stored jacket is one of `EPHE_VARIANTS` — `readEpheLook` guarantees that —
 * so the pair it brings is index-aligned by construction and the arm's edge
 * cannot fall below the band §04.06 pins.
 *
 * Every named resident in a project wears the same look, because the look is one
 * browser-wide choice (§04.09). Per-address looks would need the name store's
 * bucket; that is a decision for §04.11, not a silent widening of this one.
 */
export function lookFor(look: EpheLook, named: boolean, index: number): EpheOutfit {
  return named ? epheOutfit(look.jacket) : epheOutfit(index);
}
