/**
 * How long the city behind a link is held.
 *
 * The lifetime is a fact about the running process — `ANALYSIS_MAX_ENTRIES` and
 * `ANALYSIS_TTL_MS` are read at startup (`backend/src/server/index.ts:62-63`) —
 * so the sentence about it has to ask. Until now it quoted the defaults and
 * called them the situation.
 */
import { formatCount, t, type Lang } from "./i18n";

export interface CityStoreBounds {
  maxEntries: number;
  ttlMs: number;
}

const NOUNS: Record<Lang, { day: [string, string]; hour: [string, string] }> = {
  de: { day: ["Tag", "Tage"], hour: ["Stunde", "Stunden"] },
  en: { day: ["day", "days"], hour: ["hour", "hours"] },
};

/**
 * The duration in the unit a person reads first. Days only for a whole number
 * of them — 36 h is told as "36 Stunden", because "2 Tage" would round the
 * server's own number into something it never said.
 */
export function lifetimeWords(lang: Lang, ttlMs: number): string {
  const asDays = ttlMs >= 86_400_000 && ttlMs % 86_400_000 === 0;
  const n = Math.round(ttlMs / (asDays ? 86_400_000 : 3_600_000));
  const [one, many] = NOUNS[lang][asDays ? "day" : "hour"];
  return `${formatCount(lang, n)} ${n === 1 ? one : many}`;
}

/** Ask the server; a server that does not answer is reported, not guessed at. */
export async function readCityStoreBounds(): Promise<CityStoreBounds | null> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return null;
    const body = (await res.json()) as { cityStore?: Partial<CityStoreBounds> };
    const { maxEntries, ttlMs } = body.cityStore ?? {};
    return typeof maxEntries === "number" && typeof ttlMs === "number" && ttlMs > 0
      ? { maxEntries, ttlMs }
      : null;
  } catch {
    return null;
  }
}

export async function cityLinkNotice(lang: Lang): Promise<string> {
  const bounds = await readCityStoreBounds();
  if (!bounds) return t(lang, "actions.linkCopiedUnknown");
  return t(lang, "actions.linkCopied", {
    lifetime: lifetimeWords(lang, bounds.ttlMs),
    max: formatCount(lang, bounds.maxEntries),
  });
}
