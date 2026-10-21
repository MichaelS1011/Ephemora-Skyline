import { useMemo } from "react";
import { t } from "../i18n";
import { triageList, useStore } from "../stores/useStore";
import { SEVERITY_WORD } from "./FindingCard";

/**
 * The triage queue's voice. It stays mounted for the whole visit, so every
 * step is a text change inside one live region — the camera flying to another
 * building must not be the only sign that the queue moved.
 */
export function TriageAnnouncer() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const triageActive = useStore((s) => s.triageActive);
  const triageCursor = useStore((s) => s.triageCursor);
  const triageTotal = useStore((s) => s.triageTotal);
  const threatFilter = useStore((s) => s.threatFilter);
  const ruleFilter = useStore((s) => s.ruleFilter);
  const list = useMemo(
    () => (cityData ? triageList(cityData, threatFilter, ruleFilter) : []),
    [cityData, threatFilter, ruleFilter],
  );
  const entry = triageActive ? list[triageCursor] : undefined;
  const finding = entry?.file.findings[entry.index];
  const text =
    entry && finding
      ? t(lang, "panel.triageAnnounce", {
          index: triageCursor + 1,
          total: triageTotal || list.length,
          name: entry.file.name,
          line: finding.line,
          severity: t(lang, SEVERITY_WORD[finding.severity]),
          label: (lang === "de" ? finding.labelDe : finding.label) ?? finding.label ?? finding.type,
        })
      : "";
  return (
    <span className="sr-only" role="status" aria-live="polite" data-triage-announcer>
      {text}
    </span>
  );
}
