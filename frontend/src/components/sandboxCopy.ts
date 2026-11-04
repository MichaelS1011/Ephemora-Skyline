import type { Lang } from "../i18n";
import type { SandboxAssumption } from "../city/refactorSandbox";

/**
 * The Refactor-Sandbox's own copy. Deliberately outside `i18n/dict.ts`: the
 * learning sandbox owns its words, and the main dictionary stays the place for
 * the city's shared vocabulary.
 */
const COPY = {
  title: { en: "Refactor sandbox", de: "Refactor-Sandbox" },
  heuristic: {
    en: "Heuristic preview only — no files are changed.",
    de: "Nur eine heuristische Vorschau — keine Datei wird geändert.",
  },
  heuristicBadge: { en: "Heuristic", de: "Heuristik" },
  chooseAction: { en: "Choose a learning action", de: "Lernschritt wählen" },
  split: { en: "Split file", de: "Datei teilen" },
  extract: { en: "Extract module", de: "Modul extrahieren" },
  test: { en: "Add test", de: "Test hinzufügen" },
  parts: { en: "Parts", de: "Teile" },
  partsHint: {
    en: "Two to four parts. The estimate divides lines and branches evenly.",
    de: "Zwei bis vier Teile. Die Schätzung verteilt Zeilen und Verzweigungen gleichmäßig.",
  },
  comparison: { en: "Original vs. scenario", de: "Original vs. Szenario" },
  original: { en: "Original", de: "Original" },
  scenario: { en: "Scenario", de: "Szenario" },
  metricHeight: { en: "Height", de: "Höhe" },
  metricComplexity: { en: "Complexity", de: "Komplexität" },
  metricLines: { en: "Lines (tallest module)", de: "Zeilen (höchstes Modul)" },
  metricModules: { en: "Modules", de: "Module" },
  assumptions: { en: "Assumptions", de: "Annahmen" },
  reset: { en: "Reset preview", de: "Vorschau zurücksetzen" },
  coverageGoal: {
    en: "Coverage goal: {pct}% — a goal, not a measurement.",
    de: "Abdeckungsziel: {pct} % — ein Ziel, keine Messung.",
  },
  goalNotMeasured: {
    en: "A goal, not a measurement.",
    de: "Ein Ziel, keine Messung.",
  },
  noHeightChange: {
    en: "No height change is claimed for this action.",
    de: "Für diesen Schritt wird keine Höhenänderung behauptet.",
  },
  importers: {
    en: "{count} external importers stay unchanged.",
    de: "{count} externe Importeure bleiben unverändert.",
  },
} as const;

export type SandboxCopyKey = keyof typeof COPY;

const ASSUMPTIONS: Record<SandboxAssumption, { en: string; de: string }> = {
  "heuristic-not-measured": {
    en: "The numbers are estimates from existing measurements, not a new measurement.",
    de: "Die Zahlen sind Schätzungen aus vorhandenen Messwerten, keine neue Messung.",
  },
  "no-code-changed": {
    en: "This preview changes no code and does not modify the city data.",
    de: "Diese Vorschau ändert keinen Code und verändert keine Stadtdaten.",
  },
  "split-distributes-lines-and-branches": {
    en: "Lines and branches are divided evenly across the parts.",
    de: "Zeilen und Verzweigungen werden gleichmäßig auf die Teile verteilt.",
  },
  "split-adds-internal-edges": {
    en: "Each new part adds one internal import edge to the next part.",
    de: "Jeder neue Teil fügt eine interne Import-Kante zum nächsten Teil hinzu.",
  },
  "extract-moves-30-percent": {
    en: "The extracted module takes an estimated 30% of lines and branches.",
    de: "Das extrahierte Modul übernimmt geschätzt 30 % der Zeilen und Verzweigungen.",
  },
  "extract-adds-one-module": {
    en: "Exactly one module is extracted; no further split is assumed.",
    de: "Genau ein Modul wird extrahiert; keine weitere Aufteilung wird angenommen.",
  },
  "test-does-not-change-height": {
    en: "Adding a test does not change the building's height.",
    de: "Ein zusätzlicher Test ändert die Höhe des Gebäudes nicht.",
  },
  "coverage-goal-not-measured": {
    en: "The coverage shield is a target, not a measured coverage value.",
    de: "Das Abdeckungsschild ist ein Ziel, kein gemessener Abdeckungswert.",
  },
  "external-importers-unchanged": {
    en: "External importers are counted from the city's edges and stay unchanged.",
    de: "Externe Importeure werden aus den Kanten der Stadt gezählt und bleiben unverändert.",
  },
};

export function sandboxCopy(
  lang: Lang,
  key: SandboxCopyKey,
  vars?: Record<string, string | number>,
): string {
  let text: string = COPY[key][lang];
  if (!vars) return text;
  for (const [name, value] of Object.entries(vars)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

export function sandboxAssumptionCopy(lang: Lang, assumption: SandboxAssumption): string {
  return ASSUMPTIONS[assumption][lang];
}
