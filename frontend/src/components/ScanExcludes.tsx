/**
 * The exclude field the file-cap refusal tells the user to open.
 *
 * Everything around it already existed: the list is read by both pickers
 * (`useLocalAnalysis.ts:552`), normalised and stored by `config/scanProfiles.ts`,
 * counted per file by both scan sides and shown in the summary — and the refusal
 * on this very page said "exclude folders instead of giving up" while
 * `saveExcludes` and `parseExcludes` had zero callers. There was nowhere to do
 * the thing the program asked for.
 */
import { useState } from "react";
import {
  MAX_EXCLUDE_PATHS,
  loadExcludes,
  parseExcludes,
  saveExcludes,
} from "../config/scanProfiles";
import { t, type Lang } from "../i18n";

export function ScanExcludes({ lang }: { lang: Lang }) {
  const [draft, setDraft] = useState<string>(() => loadExcludes().join(", "));
  const [saved, setSaved] = useState<string[]>(() => loadExcludes());

  /** Parse, store, and put the stored shape back in the field — what the user
   *  sees after a commit is what the next scan will read. */
  const commit = (): void => {
    const next = parseExcludes(draft);
    saveExcludes(next);
    setSaved(next);
    setDraft(next.join(", "));
  };

  const count = (n: number): string => n.toLocaleString(lang === "de" ? "de-DE" : "en-US");

  return (
    <label className="scan-exclude">
      <span>{t(lang, "cap.excludeLabel")}</span>
      <input
        name="scanExcludes"
        value={draft}
        placeholder={t(lang, "cap.excludePlaceholder")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        aria-describedby="scan-exclude-rule"
      />
      <span id="scan-exclude-rule">{t(lang, "cap.excludeRule")}</span>
      <span role="status" aria-live="polite">
        {saved.length === 0
          ? t(lang, "cap.excludeNone")
          : t(lang, saved.length === 1 ? "cap.excludeCountOne" : "cap.excludeCount", {
              n: count(saved.length),
              max: count(MAX_EXCLUDE_PATHS),
            })}
      </span>
    </label>
  );
}
