import { DICT, t, type DictKey, type Lang } from "../i18n";

/**
 * START-COPY-BRUECKE — the strings the start path needs that `DICT` does not
 * own yet. Every row is mirrored in a local hand-off list that is not shipped
 * with the program; when the text lane takes a key, the
 * dictionary wins on the next render and the row here can be deleted. Nothing
 * in this file invents a key that already exists.
 */
const BRIDGE: Record<string, { en: string; de: string }> = {
  "start.measured": { en: "What was measured", de: "Was gemessen wurde" },
  "start.nextStep": { en: "What happens next", de: "Wie es weitergeht" },
  "start.retry": { en: "Try again", de: "Erneut versuchen" },
  "start.pickAnother": { en: "Choose another folder", de: "Anderen Ordner wählen" },
  "start.pickSourceFolder": {
    en: "Pick a folder that holds source code.",
    de: "Wähle einen Ordner, der Quellcode enthält.",
  },
  "start.serverWords": { en: "Show the server's words", de: "Wortlaut des Servers zeigen" },
  "start.settingsNext": {
    en: "Open the scan settings and exclude folders",
    de: "Scan-Einstellungen öffnen und Ordner ausschließen",
  },
  "err.noSource": {
    en: "This folder holds no source code the scanners can read.",
    de: "Dieser Ordner enthält keinen Quellcode, den die Scanner lesen können.",
  },
  "err.noSourceFormats": { en: "Supported languages:", de: "Unterstützte Sprachen:" },
  "err.serverDown": {
    en: "The local server did not answer on port 4000.",
    de: "Der lokale Server antwortet nicht auf Port 4000.",
  },
  "err.serverDownHint": {
    en: "Start it again (npm run dev in backend/), then try again.",
    de: "Starte ihn erneut (npm run dev in backend/) und versuche es dann wieder.",
  },
  "err.jobGone": {
    en: "The local server no longer knows this analysis — it was restarted.",
    de: "Der lokale Server kennt diese Analyse nicht mehr — er wurde neu gestartet.",
  },
  "err.uploadTooLarge": {
    en: "The folder is too large for one upload.",
    de: "Der Ordner ist zu groß für einen Upload.",
  },
  "err.failed": { en: "The scan stopped.", de: "Der Scan ist gestoppt." },
  "scan.stages": { en: "Stages", de: "Stufen" },
  "scan.stageOf": { en: "stage {i} of {n}", de: "Stufe {i} von {n}" },
  // Until the server names a stage, none is running — and the folder is being
  // read, which is the truth the line above already counts.
  "scan.stageNone": {
    en: "no scan stage has begun yet",
    de: "noch keine Scan-Stufe gelaufen",
  },
  "scan.stillRunning": {
    en: "still working — {s} s on this stage",
    de: "läuft noch — {s} s auf dieser Stufe",
  },
  "summary.pin": { en: "Keep this open", de: "Diese Zeile behalten" },
  "summary.pinAria": {
    en: "Keep the scan summary on screen",
    de: "Scan-Zusammenfassung im Bild behalten",
  },
  "summary.unpin": { en: "Let it close", de: "Sie schließen lassen" },
  "summary.show": { en: "Show again", de: "Nochmal zeigen" },
  "summary.unread": {
    en: "{n} files were not read",
    de: "{n} Dateien wurden nicht gelesen",
  },
  // R1-23 / R2-13 / R3-10: the strip carried `1 files were not read`. The
  // singular branch is the same shape the drop rows already use.
  "summary.unreadOne": {
    en: "{n} file was not read",
    de: "{n} Datei wurde nicht gelesen",
  },
  "summary.dwell": {
    en: "{s} s",
    de: "{s} s",
  },
  "summary.noScanner": {
    en: "No scanner ran — nothing here was checked.",
    de: "Kein Scanner lief — hier wurde nichts geprüft.",
  },
  "summary.noneFound": {
    en: "The scanners ran and found nothing.",
    de: "Die Scanner liefen und fanden nichts.",
  },
  "drop.rejectedNoMax": {
    en: "{n} files were longer than the path limit and were not read",
    de: "{n} Dateien lagen über der Pfadgrenze und wurden nicht gelesen",
  },
  "drop.rejectedNoMaxOne": {
    en: "{n} file was longer than the path limit and was not read",
    de: "{n} Datei lag über der Pfadgrenze und wurde nicht gelesen",
  },
  "drop.unsafe": {
    en: "{n} paths were refused as unsafe",
    de: "{n} Pfade wurden als unsicher abgelehnt",
  },
  "drop.unsafeOne": {
    en: "{n} path was refused as unsafe",
    de: "{n} Pfad wurde als unsicher abgelehnt",
  },
  "drop.excluded": { en: "{n} files you excluded", de: "{n} von dir ausgeschlossene Dateien" },
  "drop.excludedOne": { en: "{n} file you excluded", de: "{n} von dir ausgeschlossene Datei" },
  "drop.gitIgnored": {
    en: "{n} paths your own .gitignore sets aside",
    de: "{n} Pfade, die deine eigene .gitignore ausnimmt",
  },
  "drop.gitIgnoredOne": {
    en: "{n} path your own .gitignore sets aside",
    de: "{n} Pfad, den deine eigene .gitignore ausnimmt",
  },
  /**
   * Named apart from "too large": these files are ordinary loose git objects,
   * and what stopped them is the tool's own 15 MB history budget — measured on
   * this repository, 1,470 of its 3,266 .git files. The churn tail is only added
   * when churn actually ran: on that same scan `scanProvenance.churn` was false,
   * so the plain row was the whole truth and a clause about churn would have
   * described a score nobody computed.
   */
  "drop.gitBudget": {
    en: "{n} .git files went past the {mb} MB history budget",
    de: "{n} .git-Dateien passten nicht in das Geschichte-Budget von {mb} MB",
  },
  "drop.gitBudgetOne": {
    en: "{n} .git file went past the {mb} MB history budget",
    de: "{n} .git-Datei passte nicht in das Geschichte-Budget von {mb} MB",
  },
  "drop.gitBudgetChurn": {
    en: " — churn rests on the history that arrived",
    de: " — Churn beruht auf dem Teil der Geschichte, der angekommen ist",
  },
  /**
   * The Git-Mauer state (Auftrag #25): `.git` arrived, but a pack over the
   * upload's 8 MB per-file wall left the object store split — the measured
   * `git log --numstat` on this repository's own staged copy dies after 2 of
   * 254 commits with `unable to read tree 4e0dde60`. The drop list must say
   * THAT, not "no .git folder": the folder's history exists, the upload cut
   * it off. Hand-off row for the text lane — dict.ts is claimed elsewhere
   * today, so the sentence rides the bridge until `drop.*` moves with the
   * gitBudget keys.
   */
  "drop.churnInterrupted": {
    en: "the git history arrived cut off — reading it stopped on missing objects, so this city carries no dates although the folder has history",
    de: "die Git-Geschichte kam abgeschnitten an — ihr Lesen brach an fehlenden Objekten ab, diese Stadt trägt keine Daten, obwohl der Ordner Geschichte hat",
  },
  "heat.churnInterruptedTip": {
    en: ".git arrived, but cut off mid-history — the log stopped on missing objects. CHURN needs the whole history",
    de: ".git ist angekommen, aber mitten in der Geschichte abgeschnitten — das Log brach an fehlenden Objekten ab. CHURN braucht die vollständige Geschichte",
  },
  "heat.timeInterruptedTip": {
    en: "The git history was cut off in transit — files the broken log never reached cannot be asked when they stood",
    de: "Die Git-Geschichte wurde unterwegs abgeschnitten — Dateien, die das abgebrochene Log nie erreichte, lassen sich nicht nach ihrem Steh-Datum fragen",
  },
  "drop.unsupported": {
    en: "{n} files in a format the scanners do not read",
    de: "{n} Dateien in einem Format, das die Scanner nicht lesen",
  },
  "drop.unsupportedOne": {
    en: "{n} file in a format the scanners do not read",
    de: "{n} Datei in einem Format, das die Scanner nicht lesen",
  },
  "landing.recentTitle": { en: "Recently opened", de: "Zuletzt geöffnet" },
  "landing.recentAria": { en: "Recently opened cities", de: "Zuletzt geöffnete Städte" },
  "landing.recentOpen": { en: "Open again", de: "Erneut öffnen" },
  "landing.recentAgo": { en: "{t} ago", de: "vor {t}" },
  "landing.recentMin": { en: "{n} min", de: "{n} Min" },
  "landing.recentHour": { en: "{n} h", de: "{n} Std" },
  "landing.recentDay": { en: "{n} d", de: "{n} T" },
  "landing.recentFiles": { en: "{n} files", de: "{n} Dateien" },
  "landing.recentFilesOne": { en: "{n} file", de: "{n} Datei" },
  "landing.streetNote": {
    en: "The ground behind this page is your project before the scan: plots and streets, no buildings yet.",
    de: "Der Grund hinter dieser Seite ist dein Projekt vor dem Scan: Grundstücke und Straßen, noch ohne Gebäude.",
  },
  "start.loadingCity": {
    en: "Loading the city this address asks for:",
    de: "Die Stadt unter diesem Link wird geladen:",
  },
  "start.stillLoading": {
    en: "still waiting",
    de: "wartet noch",
  },
  "coach.expand": { en: "First look at the city", de: "Erster Blick auf die Stadt" },
};

export function ts(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  if (key in DICT) return t(lang, key as DictKey, vars);
  const entry = BRIDGE[key];
  const text = entry ? entry[lang] : key;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    text,
  );
}

/** Singular/plural branch for a measured count — the dictionary carries both. */
export function tsCount(
  lang: Lang,
  key: string,
  keyOne: string,
  n: number,
  vars?: Record<string, string | number>,
): string {
  return ts(lang, n === 1 ? keyOne : key, vars);
}
