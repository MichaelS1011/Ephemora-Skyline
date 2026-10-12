/**
 * The accompanying text for a shared city video.
 *
 * Every number that appears here is read out of the city payload the scanner
 * produced, and a figure the payload does not carry is left out rather than
 * estimated. The three tones differ in voice, not in facts.
 *
 * The link is a separate decision: with `SHARE_LINK` empty no variant names a
 * destination and none hints at a repository or a star, because the project is
 * private and pointing at it would send a viewer to a 404.
 */

import type { CityData } from "../city/types";
import { formatCount } from "../i18n";
import type { Lang } from "../i18n";

export type CaptionTone = "dry" | "warm" | "curious";

export interface MeasuredFacts {
  demo?: boolean;
  /** `totalFiles` as the scan reported it. */
  files: number;
  /**
   * Lines the scanner read. `true` when this is code lines only; when false
   * the number still includes data catalogues and the sentence says so.
   */
  codeLines: number;
  codeLinesOnly: boolean;
  findings: number;
  p0: number;
  languages: number;
  /** Language names, most lines first, as the payload lists them. */
  languageNames: string[];
  districts: number;
  /** Files that no switched-off scanner covered — the grey buildings. */
  unverified: number;
  /** Of `files`, how many actually stand as their own building. */
  rendered: number;
}

export interface Caption {
  tone: CaptionTone;
  text: string;
}

export function measuredFacts(city: CityData | null): MeasuredFacts {
  if (!city) {
    return {
      files: 0,
      codeLines: 0,
      codeLinesOnly: false,
      findings: 0,
      p0: 0,
      languages: 0,
      languageNames: [],
      districts: 0,
      unverified: 0,
      rendered: 0,
    };
  }
  const langs = Object.entries(city.languages).sort((a, b) => b[1] - a[1]);
  return {
    demo: city.analysisId === "demo-001",
    files: city.totalFiles,
    codeLines: city.codeLines ?? city.totalLines,
    codeLinesOnly: city.codeLines !== undefined,
    findings: city.findingsBySeverity.P0 + city.findingsBySeverity.P1 + city.findingsBySeverity.P2,
    p0: city.findingsBySeverity.P0,
    languages: langs.length,
    languageNames: langs.slice(0, 3).map(([name]) => name),
    districts: city.tree.children.length,
    unverified: city.unverifiedFiles ?? 0,
    rendered: city.renderedFiles,
  };
}

/** Numbers a caption may quote. Anything else stays out. */
function factLine(lang: Lang, f: MeasuredFacts): string {
  const n = (value: number): string => formatCount(lang, value);
  const units =
    lang === "de"
      ? {
          files: (v: string) => `${v} Dateien`,
          lines: (v: string, code: boolean) => `${v} Zeilen ${code ? "Code" : "gelesener Text"}`,
          findings: (v: string) => `${v} ${f.demo ? "Beispielfunde" : "Scanner-Funde zur Prüfung"}`,
          languages: (v: string) => (v === "1" ? "1 Sprache" : `${v} Sprachen`),
        }
      : {
          files: (v: string) => `${v} files`,
          lines: (v: string, code: boolean) => `${v} lines of ${code ? "code" : "read text"}`,
          findings: (v: string) =>
            `${v} ${f.demo ? "sample findings" : "scanner findings to review"}`,
          languages: (v: string) => (v === "1" ? "1 language" : `${v} languages`),
        };
  return [
    units.files(n(f.files)),
    units.lines(n(f.codeLines), f.codeLinesOnly),
    units.findings(n(f.findings)),
    units.languages(n(f.languages)),
  ].join(lang === "de" ? ", " : ", ");
}

/** What the picture is made of, said once, in the caption's own voice. */
function shapeLine(lang: Lang, f: MeasuredFacts): string {
  const n = (value: number): string => formatCount(lang, value);
  if (f.demo) {
    return lang === "de"
      ? "Synthetische Demo: Kein Scanner wurde ausgeführt. Ordner sind Bezirke, Dateien sind Gebäude, die Höhe zeigt zyklomatische Komplexität. Die Baken zeigen Beispielfunde."
      : "Synthetic demo: No scanner ran. Folders are districts, files are buildings, height shows cyclomatic complexity. Beacons show sample findings.";
  }
  if (lang === "de") {
    const grey =
      f.unverified > 0
        ? ` ${n(f.unverified)} davon standen noch nie unter einem Prüfprogramm und sind grau.`
        : "";
    return `Ordner sind Bezirke, Dateien sind Gebäude, die Höhe kommt aus der zyklomatischen Komplexität. Rote Baken markieren Scanner-Funde, keine bestätigten Schwachstellen.${grey}`;
  }
  const grey =
    f.unverified > 0
      ? ` ${n(f.unverified)} of them were never covered by a scanner, so they stand grey.`
      : "";
  return `Folders are districts, files are buildings, the height is cyclomatic complexity. Red beacons mark scanner findings, not confirmed vulnerabilities.${grey}`;
}

function nameLead(lang: Lang, f: MeasuredFacts): string {
  const list = f.languageNames.join(", ");
  if (!list) return "";
  return lang === "de" ? ` Sprachen: ${list}.` : ` Languages: ${list}.`;
}

/**
 * The ask. Only when the operator set a link; otherwise the caption thanks
 * without pointing anywhere and without a star.
 */
function callToAction(lang: Lang, link: string): string {
  if (!link) return "";
  return lang === "de" ? ` Mehr: ${link}.` : ` More: ${link}.`;
}

/** A picture's user-facing caption: no claim that a build video was watched. */
export function imageCaptionFor(f: MeasuredFacts, lang: Lang, link: string): string {
  const facts = factLine(lang, f);
  const shape = shapeLine(lang, f);
  return lang === "de"
    ? `${f.demo ? "Die Demo-Stadt" : "Mein Projekt als Stadt"}: ${facts}.\n${shape}\nLokal erstellt mit Ephemora Skyline.${callToAction(lang, link)}`
    : `${f.demo ? "The demo city" : "My project as a city"}: ${facts}.\n${shape}\nMade locally with Ephemora Skyline.${callToAction(lang, link)}`;
}

export function captionsFor(f: MeasuredFacts, lang: Lang, link: string): Caption[] {
  const facts = factLine(lang, f);
  const shape = shapeLine(lang, f);
  const names = nameLead(lang, f);
  const cta = callToAction(lang, link);
  const n = (value: number): string => formatCount(lang, value);

  if (f.demo) {
    const lead =
      lang === "de" ? "Die Demo-Stadt von Ephemora Skyline" : "Ephemora Skyline's demo city";
    return (["dry", "warm", "curious"] as const).map((tone) => ({
      tone,
      text: `${lead}: ${facts}.${names}\n${shape}${cta}`,
    }));
  }

  if (lang === "de") {
    const none =
      f.findings === 0
        ? "Keine Scanner-Funde in dieser Stadt; graue Dächer zeigen trotzdem, wo nichts geprüft wurde. "
        : "";
    return [
      {
        tone: "dry",
        text: `${facts}.${names}\n${shape}\nGebaut aus einem Ordner auf dem eigenen Rechner, ohne Konto und ohne Upload. ${none}Ephemora Skyline.${cta}`,
      },
      {
        tone: "warm",
        text: `Ich habe einen Ordner zur Stadt werden lassen und beim Bauen zugesehen. ${facts}.${names}\n${shape}\nSo sehe ich zum ersten Mal, wo mein Projekt dicht wird und was noch geprüft werden muss.${cta}`,
      },
      {
        tone: "curious",
        text: `Wie sieht ein Codebestand von oben aus? ${n(f.districts)} Bezirke, ${facts}.${names}\n${shape}\nDas höchste Gebäude ist nicht das größte, sondern das verzweigteste. Ausprobieren kann man das auf dem eigenen Rechner. ${cta}`,
      },
    ];
  }

  const none =
    f.findings === 0
      ? "No scanner findings in this city; grey roofs still show what was never checked. "
      : "";
  return [
    {
      tone: "dry",
      text: `${facts}.${names}\n${shape}\nBuilt from a folder on my own machine, no account, no upload. ${none}Ephemora Skyline.${cta}`,
    },
    {
      tone: "warm",
      text: `I let a folder turn into a city and watched it get built. ${facts}.${names}\n${shape}\nNow I can see where my project gets dense and what still needs checking.${cta}`,
    },
    {
      tone: "curious",
      text: `What does a codebase look like from above? ${n(f.districts)} districts, ${facts}.${names}\n${shape}\nThe tallest building is not the biggest one, it is the most tangled. You can run this on your own machine. ${cta}`,
    },
  ];
}
