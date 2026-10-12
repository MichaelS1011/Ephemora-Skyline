import type { Lang } from "../i18n";

const COPY = {
  title: { en: "Learn to read this city", de: "Diese Stadt lesen lernen" },
  structure: { en: "Structure", de: "Struktur" },
  shape: { en: "Shape", de: "Form" },
  evidence: { en: "Evidence", de: "Beleg" },
  steps: { en: "Choose a learning step", de: "Lernschritt wählen" },
  structureText: {
    en: "Folders are districts. Files are buildings. Open a district to see its own files and subfolders. Large overviews group files; the measured file count stays visible here.",
    de: "Ordner sind Bezirke. Dateien sind Gebäude. Öffne einen Bezirk für seine Dateien und Unterordner. Große Übersichten bündeln Dateien; die gemessene Dateianzahl bleibt hier sichtbar.",
  },
  largest: { en: "Largest subfolder here", de: "Größter Unterordner hier" },
  file: { en: "file", de: "Datei" },
  files: { en: "files", de: "Dateien" },
  enter: { en: "Explore this district", de: "Diesen Bezirk erkunden" },
  leaf: {
    en: "There are no subfolders at this level. Choose a building in the city or use search to open a file.",
    de: "Auf dieser Ebene gibt es keine Unterordner. Wähle ein Gebäude in der Stadt oder öffne eine Datei über die Suche.",
  },
  empty: {
    en: "No files were mapped at this level. Check the scan exclusions or return to the project overview.",
    de: "Auf dieser Ebene wurden keine Dateien abgebildet. Prüfe die Scan-Ausschlüsse oder gehe zur Projektübersicht zurück.",
  },
  shapeText: {
    en: "Height combines branching, imports and code size. A tall building is a place to investigate, not proof of a bug. Footprints and layers represent the public interface and code volume; their shape is a summary, not an exact source-code scale.",
    de: "Die Höhe bündelt Verzweigungen, Imports und Codeumfang. Ein hohes Gebäude ist ein Ort zum Nachsehen, kein Fehlerbeweis. Grundfläche und Schichten bilden Schnittstelle und Codevolumen ab; ihre Form ist eine Zusammenfassung, kein exakter Code-Maßstab.",
  },
  colorText: {
    en: "Facade color identifies the language. Finding markers show scanner results. Grey unchecked areas mean a relevant check did not run. Ephe’s provide scale and city life, not a code-quality score.",
    de: "Die Fassadenfarbe zeigt die Sprache. Fundmarker zeigen Scanner-Ergebnisse. Graue ungeprüfte Bereiche bedeuten, dass eine relevante Prüfung fehlte. Ephe’s geben Maßstab und Stadtleben, keinen Qualitätswert.",
  },
  example: {
    en: "A file to compare with its shape",
    de: "Eine Datei zum Vergleich mit ihrer Form",
  },
  openFile: { en: "Inspect this building", de: "Dieses Gebäude ansehen" },
  evidenceText: {
    en: "A scanner finding is a hypothesis. Check its path, line, rule and source context, then decide whether to fix it or mark a false positive. After a change, scan again to check the result.",
    de: "Ein Scanner-Fund ist eine Hypothese. Prüfe Pfad, Zeile, Regel und Codekontext. Entscheide dann, ob du ihn behebst oder als Fehlalarm markierst. Scanne nach einer Änderung erneut, um das Ergebnis zu prüfen.",
  },
  review: { en: "Open a finding and its evidence", de: "Fund und Beleg öffnen" },
  noEvidence: {
    en: "There is no scanner finding to inspect here. That does not prove the code is error-free; check the scan coverage in this overview.",
    de: "Hier gibt es keinen Scanner-Fund zum Prüfen. Das beweist keine Fehlerfreiheit; beachte die Scan-Abdeckung in dieser Übersicht.",
  },
  test: {
    en: "This example is in test code. Intentional fixtures and real credentials can both occur in tests; inspect the evidence.",
    de: "Dieses Beispiel liegt in Testcode. Tests können absichtliche Beispieldaten und echte Zugangsdaten enthalten; prüfe den Beleg.",
  },
  demo: {
    en: "This city uses sample findings. No real scan ran; practice reading the sample evidence.",
    de: "Diese Stadt verwendet Beispielfunde. Es lief kein echter Scan; übe hier das Lesen der Beispielbelege.",
  },
  next: { en: "Next step", de: "Nächster Schritt" },
  previous: { en: "Previous step", de: "Vorheriger Schritt" },
  overview: { en: "Project overview", de: "Projektübersicht" },
  district: { en: "Back to district view", de: "Zur Bezirksansicht" },
  checked: { en: "No scanner findings here", de: "Hier keine Scanner-Funde" },
  unchecked: {
    en: "No findings here · scan coverage is incomplete or unknown",
    de: "Hier keine Funde · Scan-Abdeckung unvollständig oder unbekannt",
  },
  noScan: { en: "Sample city · no real scan", de: "Beispielstadt · kein echter Scan" },
} as const;

export function learningCopy(lang: Lang, key: keyof typeof COPY): string {
  return COPY[key][lang];
}
