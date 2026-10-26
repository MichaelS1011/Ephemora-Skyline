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
  loadExcludesRead,
  parseExcludes,
  saveExcludes,
} from "../config/scanProfiles";
import { formatCount, t, type Lang } from "../i18n";

export function ScanExcludes({ lang }: { lang: Lang }) {
  // Read once through the honest reader: a corrupt file is NOT "no excludes"
  // (storageRead.ts; tests/storage-class-honest.test.ts). The list the field
  // shows is empty because nothing could be honoured — the line below says
  // that, and the bytes stay quarantined however this field saves next.
  const [read] = useState(() => loadExcludesRead());
  const [committed, setCommitted] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string>(() =>
    read.state === "read" ? read.value.join(", ") : "",
  );
  const saved = committed ?? (read.state === "read" ? read.value : []);

  /** Parse, store, and put the stored shape back in the field — what the user
   *  sees after a commit is what the next scan will read. A committed list is
   *  also the reader choosing to move on from an unreadable file: the note
   *  ends, the quarantine slot keeps the bytes regardless. */
  const commit = (): void => {
    const next = parseExcludes(draft);
    saveExcludes(next);
    setCommitted(next);
    setDraft(next.join(", "));
  };

  const count = (n: number): string => formatCount(lang, n);

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
        {read.state === "unreadable" && committed === null ? (
          <>⚠ {t(lang, "cap.excludeUnreadable")}</>
        ) : saved.length === 0 ? (
          t(lang, "cap.excludeNone")
        ) : (
          t(lang, saved.length === 1 ? "cap.excludeCountOne" : "cap.excludeCount", {
            n: count(saved.length),
            max: count(MAX_EXCLUDE_PATHS),
          })
        )}
      </span>
    </label>
  );
}
