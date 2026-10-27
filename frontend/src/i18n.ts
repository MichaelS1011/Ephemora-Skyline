/**
 * Minimal i18n — one flat dictionary, two languages, zero dependencies.
 *
 * The dictionary data lives in ./i18n/dict.ts; this module holds the lookup
 * and formatting logic and re-exports the data (DICT, DictKey, Lang) so every
 * importer keeps its single import path unchanged.
 */
import { DICT, type DictKey, type Lang } from "./i18n/dict";

export { DICT };
export type { DictKey, Lang };

/**
 * Look up a string in the display language and substitute {name} placeholders.
 * Unknown keys return the key itself — calling code never has to guard.
 */
export function t(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  const entry = (DICT as Record<string, { en: string; de: string } | undefined>)[key];
  const text = entry ? entry[lang] : key;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    text,
  );
}

/**
 * Measured numbers are integers, so the thousands separator is the only locale
 * difference that shows up in the UI. German groups with dots ("3.300 files" →
 * "3.300 Dateien"), English with commas.
 */
export function formatCount(lang: Lang, n: number): string {
  return n.toLocaleString(lang === "de" ? "de-DE" : "en-US");
}

/**
 * The sibling door for a number with a decimal part — "15.1k" lines, a crop
 * percentage. `toFixed` always prints a period, so a German card would show
 * "15.1k" beside a "1.204" it formatted itself. Same rule as `formatCount`:
 * the UI language decides the separator, never the browser and never a fixed
 * string method.
 */
export function formatDecimal(lang: Lang, n: number, digits = 1): string {
  return n.toLocaleString(lang === "de" ? "de-DE" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * A date the payload carries (epoch-ms) in the UI language — `formatCount`'s
 * rule for calendar values: the language decides the shape ("Jan 9, 2026" /
 * "9. Jan. 2026"), never the browser. No clock: the app's dates answer "which
 * day", and churn counts whole days.
 */
export function formatDate(lang: Lang, ms: number): string {
  return new Date(ms).toLocaleDateString(lang === "de" ? "de-DE" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The count phrase for places that build text from parts instead of picking a
 * `…One`/`…Many` key: `plural("de", 1, "Fund", "Funde")` → "1 Fund". Only an
 * exact 1 takes the singular — 0 and 0.5 stay plural in both languages, so a
 * measured value can never read as a grammar bug.
 */
export function plural(lang: Lang, n: number, one: string, many: string): string {
  return `${formatCount(lang, n)} ${n === 1 ? one : many}`;
}
