import type { Lang } from "../i18n";

/** City Time Machine strings; this lane owns them next to their rule. */
const COPY = {
  menu: { en: "City time machine", de: "Stadt-Zeitmaschine" },
  title: { en: "City Time Machine", de: "Stadt-Zeitmaschine" },
  intro: {
    en: "Earlier scans of this folder, kept on this machine. Pick an era to compare it with the city you are standing in.",
    de: "Frühere Scans dieses Ordners, auf diesem Rechner aufbewahrt. Wähle eine Epoche, um sie mit der Stadt zu vergleichen, in der du stehst.",
  },
  close: { en: "Close time machine", de: "Zeitmaschine schließen" },
  menuNoScan: {
    en: "A time machine needs a scan id; this city has none.",
    de: "Eine Zeitmaschine braucht eine Scan-ID; diese Stadt hat keine.",
  },
  empty: {
    en: "This folder has no earlier scan in the local index.",
    de: "Für diesen Ordner gibt es keinen früheren Scan im lokalen Verzeichnis.",
  },
  noFolder: {
    en: "The current scan has no recorded folder yet.",
    de: "Der aktuelle Scan hat noch keinen vermerkten Ordner.",
  },
  current: { en: "Now", de: "Jetzt" },
  era: { en: "Scan from {when}", de: "Scan vom {when}" },
  selectEra: { en: "Compare {when}", de: "{when} vergleichen" },
  loading: { en: "Reading that scan…", de: "Dieser Scan wird gelesen…" },
  unavailable: {
    en: "This era no longer answers on this machine. It was pushed out of the archive or never finished; nothing is estimated.",
    de: "Diese Epoche antwortet auf diesem Rechner nicht mehr. Sie wurde aus dem Archiv verdrängt oder nie fertig; nichts wird geschätzt.",
  },
  diffTitle: { en: "Difference to now", de: "Unterschied zu jetzt" },
  diffHint: {
    en: "Current scan minus the selected era. A plus means the current city has more.",
    de: "Aktueller Scan minus gewählte Epoche. Ein Plus bedeutet, die aktuelle Stadt hat mehr.",
  },
  "metric.files": { en: "Files", de: "Dateien" },
  "metric.lines": { en: "Lines", de: "Zeilen" },
  "metric.rendered": { en: "Drawn buildings", de: "Gezeichnete Gebäude" },
  "metric.p0": { en: "P0 findings", de: "P0-Funde" },
  "metric.p1": { en: "P1 findings", de: "P1-Funde" },
  "metric.p2": { en: "P2 findings", de: "P2-Funde" },
  return: { en: "Return to now", de: "Zurück zu jetzt" },
  expiredTitle: { en: "Era unavailable", de: "Epoche nicht verfügbar" },
  unreadableIndex: {
    en: "The local index of opened cities could not be read. Its bytes stay untouched; the history cannot be shown.",
    de: "Das lokale Verzeichnis geöffneter Städte konnte nicht gelesen werden. Seine Bytes bleiben unangetastet; die Historie kann nicht gezeigt werden.",
  },
} as const;

export type TimeMachineCopyKey = keyof typeof COPY;

export interface TimeMachineText {
  key: TimeMachineCopyKey;
  vars?: Record<string, string | number>;
}

export function timeMachineText(lang: Lang, text: TimeMachineText): string {
  const source: string = COPY[text.key][lang];
  if (!text.vars) return source;
  return Object.entries(text.vars).reduce(
    (out, [name, value]) => out.split(`{${name}}`).join(String(value)),
    source,
  );
}
