// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DICT, t, type DictKey, type Lang } from "../src/i18n";
import { ENGINES, SCAN_PROFILES } from "../src/config/scanProfiles";
import { FINDING_CATEGORIES } from "../src/config/findingCategories";
import { describeGitignoreSkips } from "../src/city/provenance";
import { explainDistrictDraw } from "../src/city/layout";
import { ContextCard } from "../src/components/ContextCard";
import { HudOverlay } from "../src/components/HudOverlay";
import { ScanSummary } from "../src/components/ScanSummary";
import { Minimap } from "../src/components/Minimap";
import { ProfileChips } from "../src/components/ProfileChips";
import { CoachMarks } from "../src/components/CoachMarks";
import { useStore } from "../src/stores/useStore";
import { city, dir, file, provenance } from "./helpers/cityFixture";
import type { CityData, CityDir, CityFile } from "../src/city/types";

/**
 * #49 — die Seitenpanels antworteten auf Englisch, während der Rest des
 * Programms schon in der gewählten Sprache sprach. Zwei Dinge sind pinned:
 *
 * (a) Kein Panel schreibt noch ein hartes englisches Label ins DOM: jeder
 *     deutsche Render wird walked und durch den Englisch-Detektor darunter
 *     geschickt.
 * (b) Der englische Pfad bleibt, was er vor der Übersetzung war — die
 *     en-Werte sind wörtlich die alten Sätze, auch die der Tabellen
 *     (Profile, Engines, Kategorien), die jetzt Wörterbuch-Schlüssel tragen.
 *
 * Der Detektor ist dieselbe Messregel wie a local measurement script that is not shipped
 * (Browser-Lauf vorher/nachher). local scratch work ist gitignore-Arbeit, deshalb
 * steht die Regel hier und wird gegen dieses Wörterbuch kalibriert.
 */

const FUNC =
  /\b(the|your|this|that|with|from|were|are|have|has|not|and|of|for|by|its|it|is|to|or|as|at|be|do|if|no|on|we|you|will|would|could|can|than|then|into|onto)\b/gi;
const CONTENT =
  /\b(files|file|lines|line|folders|folder|findings|finding|kept|keep|keeps|review|reviewed|collapse|overview|legend|close|closes|dismiss|analyzed|analysed|included|include|includes|skipped|skip|current|what|which|nobody|looked|look|looks|authors|author|authorship|contributor|contributors|click|clicks|press|shows|shown|show|here|these|those|without|nothing|nowhere|stays|stay|machine|uploaded|upload|uploads|profile|profiles|critical|medium|languages|language|behaviour|behavior|severity|each|every|unread|clean|result|results|stand|buildings|building|podium|marker|markers|plaza|share|shares|risk|risks|highest|switched|editor|coming|soon|source|sources|comment|comments|blank|times|time|report|reports|project|projects|district|districts|city|cities|map|maps|exactly|being|changed|change|changes|many|some|any|none|only|also|just|more|less|most|under|above|inside|outside|counted|count|counts|measure|measured|width|height|size|number|numbers|total|whole|part|parts|left|right|top|bottom|when|while|where|why|how|who|whose|once|again|still|yet|already|high|danger|dangerous|safe|unsafe|unused|dead|active|hidden|visible|opens|back|next|previous|first|last|new|old|full|half|small|large|ready|loading|running|failed|passed|warning|title|heading|label|labels|name|names|path|paths|summary|complete|completed|exposure|cryptography|injection|execution|transport|certificates|permissions|destructive|classified|unclassified|supply|chain|rules|deep|patterns|walks|reads|writes|finds|detects|colors|connects|blocks|stops|starts)\b/gi;
const NEUTRAL = /^(scan|scans|code|data|ast|api|sarif|git|npm|csv|html|sql|url|id|ui)$/i;
// Echte deutsche Funktionswörter. Ein englischer Satz enthält keins davon;
// ohne diese Regel würde "Secrets in der Git-Historie" als Englisch zählen.
const DEUTSCH =
  /\b(der|die|das|dem|den|des|und|mit|von|vom|für|nicht|kein|keine|keiner|diese|dieser|zum|zur|beim|ein|eine|einer|ohne|über|unter|als|auch|noch|schon|bereits|ist|sind|werden|wird|hat|haben|deine|deinem|deiner|euer|selbst|jeweils|steht|stehen|läuft|gehe|gehen|geht|komme|kommt|mal|danach|hier|dort|immer|wieder|bis|vor|nach|bei|aus|bei|dem)\b/i;
const SKIP =
  /^(EN|DE|P0|P1|P2|✓|—|▦||▭|\+|−|×|✕|[0-9.,%~kms/\-_]+|semgrep|gitleaks|ruff|npm audit|osv-scanner|regex|json|yaml|yml|lockfile|lcov|sarif|api|git|github|npm|cwe|xss|sql|url|utf-8|[A-Za-z0-9_.\-/]+\.(ts|tsx|js|jsx|json|py|go|rs|java|php|rb|sh|sql|md|yml|yaml))$/i;
// Payload-Identifier mit Zähler ("injection 4 · hygiene 3") sind maschinenlesbare
// Schlüssel aus dem Scan, keine Prosa.
const ID_COUNT = /^[a-z][a-z-]*( \d+|: \d+)( · [a-z][a-z-]*( \d+|: \d+))*$/;
const IDS =
  /^(injection|secrets|crypto|transport|exposure|dependencies|permissions|hygiene|unclassified)$/;

const countHits = (re: RegExp, s: string) => (s.match(new RegExp(re.source, "gi")) || []).length;
const isWord = (re: RegExp, w: string) => new RegExp(`^(?:${re.source})$`, "i").test(w);

function isEnglish(raw: string): boolean {
  const rawS = String(raw).trim();
  if (rawS.length < 4) return false;
  const s = rawS.replace(/\{[a-zA-Z_]+\}/g, " ").trim();
  if (s.length < 4) return false;
  if (SKIP.test(s)) return false;
  if (ID_COUNT.test(s) && s.split(" · ").every((p) => IDS.test(p.split(/[: ]/)[0]!))) return false;
  if (/[äöüßÆæ]/.test(s)) return false;
  if (DEUTSCH.test(s)) return false;
  const tokens = s.toLowerCase().match(/[a-z][a-z']*/g) || [];
  if (tokens.length === 0) return false;
  if (countHits(FUNC, s) >= 1) return true;
  if (countHits(CONTENT, s) >= 2) return true;
  if (tokens.length <= 4) {
    const english = (w: string) => isWord(CONTENT, w) || isWord(FUNC, w);
    if (tokens.some(english) && tokens.every((w) => english(w) || NEUTRAL.test(w))) return true;
  }
  return false;
}

/** Every label a rendered subtree shows: its text nodes and its label attributes. */
function labelsOf(root: HTMLElement): string[] {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").trim();
      if (text) out.push(text);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    for (const attr of ["title", "aria-label", "placeholder"]) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
    el.childNodes.forEach(walk);
  };
  walk(root);
  return [...new Set(out)];
}

// ── Messaufbau: dieselbe Stadt, zwei Sprachen ───────────────────────────────
// Die Gebäude und Bezirke baut `helpers/cityFixture`; jede Zahl, die ein Fall
// zitiert, steht hier und nicht im Builder — das Casebook (92 Dateien, 249 Code-
// plus 300 Datenzeilen, 4 P0 und 3 P1, 84 von 92 ungeprüfte Häuser) ist die
// Messung selbst, kein Default.

const caseFiles = (where: string, n: number): CityFile[] =>
  Array.from({ length: n }, (_, i) => file(`${where}/f${i}.ts`, "TypeScript"));

function subDistrict(path: string, fileCount: number): CityDir {
  return dir({
    path,
    fileCount,
    linesOfCode: fileCount * 40,
    codeLines: fileCount * 40,
    dataLines: 0,
    languages: { TypeScript: fileCount * 40 },
    dataLanguages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    detailFiles: caseFiles(path, Math.min(5, fileCount)),
    remainingFiles: Math.max(0, fileCount - Math.min(5, fileCount)),
    districtFiles: caseFiles(path, 6),
  });
}

/** Der Fall aus #51: 92 Dateien, 249 Code- plus 300 Datenzeilen, 7 Funde. */
function cityData(overrides: Partial<CityData> = {}): CityData {
  const frontend: CityDir = dir({
    name: "frontend",
    path: "frontend",
    fileCount: 92,
    linesOfCode: 549,
    codeLines: 249,
    dataLines: 300,
    languages: { TypeScript: 134, PHP: 63, Shell: 45, SQL: 4, Terraform: 3 },
    dataLanguages: { JSON: 300 },
    findingsBySeverity: { P0: 4, P1: 3, P2: 0 },
    findingsByCategory: {
      injection: 4,
      hygiene: 3,
      unclassified: 7,
      secrets: 0,
      crypto: 0,
      transport: 0,
      exposure: 0,
      dependencies: 0,
      permissions: 0,
    },
    threatScore: 61,
    children: [subDistrict("frontend/src", 60), subDistrict("frontend/tests", 26)],
    detailFiles: caseFiles("frontend", 6),
    remainingFiles: 0,
    districtFiles: caseFiles("frontend", 6),
    topAuthor: "m.soppa",
    topAuthorShare: 0.62,
    unverifiedFiles: 84,
  });
  const tree: CityDir = dir({
    ...frontend,
    name: "",
    path: "",
    fileCount: 92,
    detailFiles: [],
    districtFiles: [],
    children: [frontend],
  });
  return city({
    repo: { owner: "local", name: "casebook", branch: "main" },
    totalFiles: 92,
    renderedFiles: 16,
    totalLines: 549,
    codeLines: 249,
    dataLines: 300,
    languages: tree.languages,
    dataLanguages: tree.dataLanguages,
    findingsBySeverity: tree.findingsBySeverity,
    findingsByCategory: tree.findingsByCategory,
    findingsInTests: 3,
    skippedByGitignore: { files: 49, directories: 3 },
    unverifiedEngines: ["semgrep"],
    limits: { skylineTowers: 6, buildingsPerDirectory: 35 },
    // semgrep war aus, alle anderen liefen — der Fall, den #51 gemessen hat
    scanProvenance: provenance({ semgrep: false }),
    tree,
    ...overrides,
  });
}

let container: HTMLDivElement;
let root: Root;

async function show(
  el: Parameters<Root["render"]>[0],
  lang: Lang,
  patch: Record<string, unknown> = {},
): Promise<HTMLElement> {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: cityData(),
      buildPhase: "built",
      analysisId: "scan-1",
      scanProfile: "standard",
      ...patch,
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(el));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return container;
}

const offenders = (host: HTMLElement) => labelsOf(host).filter(isEnglish);
const text = (host: HTMLElement) => (host.textContent ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("die Messregel selbst (#49)", () => {
  it("schlägt auf keinem deutschen Wörterbuch-Wert an", () => {
    const keys = Object.keys(DICT) as DictKey[];
    const falsePositives = keys.map((k) => t("de", k)).filter(isEnglish);
    expect(keys.length).toBeGreaterThan(400);
    expect(falsePositives, `deutsche Werte: ${falsePositives.join(" | ")}`).toEqual([]);
  });

  it("erkennt die englischen Panel-Sätze, die vorher im DOM standen", () => {
    const knownEnglish = [
      "Project overview",
      "District overview",
      "Collapse project overview",
      "Each source file is a building in your city.",
      "300 lines of data",
      "49 files and 3 folders",
      "No scanner looked at this city — it is a demo",
      "Nobody looked for: Secrets",
      "Review priority finding",
      "Here is exactly what will be checked. Nothing is uploaded anywhere else — files stay on your machine.",
      "✓ USE THIS PROFILE",
      "City minimap — click to fly, or press Enter to go to city overview",
      "scans every file for risky code patterns (injection, XSS, unsafe storage…)",
      "Weak algorithms and short keys — the maths that pretends to protect something.",
      "Number of exported symbols",
      "Arrow keys turn the view",
    ];
    for (const line of knownEnglish) expect(isEnglish(line), line).toBe(true);
  });

  it("zählt Kategorie-Kennungen mit Zähler nicht als englischen Satz", () => {
    expect(isEnglish("injection 4 · hygiene 3")).toBe(false);
    expect(isEnglish("unclassified 7")).toBe(false);
  });
});

describe("Englisch bleibt, was vor der Übersetzung im DOM stand", () => {
  /** Die wörtlichen Sätze der Tabellen vor der Schlüssel-Umstellung. */
  const VORHER = [
    // Profile
    "Quick",
    "critical findings only — fastest scan",
    "Standard",
    "all scanners — secrets, AST, CVEs, heuristics",
    "Deep",
    "standard + git-history secret scan",
    "Custom",
    "your own configuration (coming soon)",
    // Engines
    "Code patterns",
    "Deep AST rules",
    "syntax-tree analysis for injection and XSS flows the regexes can't see",
    "Dependency audit",
    "OSV database",
    "Python lint",
    "Git history secrets",
    "Copy-paste clones",
    "Circular imports",
    "Test coverage",
    "Author map",
    // Kategorien
    "Injection & execution",
    "Secrets",
    "Cryptography",
    "Transport & certificates",
    "Data exposure",
    "Dependencies & supply chain",
    "Permissions & destructive actions",
    "Code hygiene",
    "Not classified",
    "Not a vulnerability: dead imports, wrong comparisons, shadowed names.",
    // Legende
    "Building height",
    "Code complexity and file size",
    "Windowless monolith",
    "Cyan / violet streams",
    // Panel
    "Lines of code, excluding comments, blank lines and data files.",
    "One building per file that fits the plots of this view.",
  ];

  it("liefert jede Zeile der Tabellen wörtlich in Englisch", () => {
    const english = new Set<string>([
      ...SCAN_PROFILES.flatMap((p) => [t("en", p.label), t("en", p.summary)]),
      ...ENGINES.flatMap((e) => [t("en", e.name), t("en", e.what)]),
      ...FINDING_CATEGORIES.flatMap((c) => [t("en", c.label), t("en", c.meaning)]),
      ...Object.keys(DICT).map((k) => t("en", k as DictKey)),
    ]);
    for (const line of VORHER) {
      const found = [...english].some((e) => e.includes(line));
      expect(found, `fehlendes Zitat: ${line}`).toBe(true);
    }
  });

  it("hat für jeden Schlüssel einen deutschen Wert, der nicht nur Kopie ist", () => {
    const kopien = (Object.keys(DICT) as DictKey[]).filter(
      (k) => DICT[k].en.trim() === DICT[k].de.trim(),
    );
    // Erlaubt sind ausschließlich Fachwörter, die im Deutschen so stehen:
    // Werkzeug- und Formatnamen.
    expect(new Set(kopien)).toEqual(
      new Set([
        // Sprache wird in der Sprache selbst genannt (Endonym), deshalb ist der
        // deutsche Wert hier mit Absicht identisch: ein Leser, der die
        // Oberflaechensprache nicht kennt, erkennt "English" und "Deutsch".
        "access.langEnglish",
        "access.langGerman",
        "actions.triage",
        "actions.tourShort",
        "hints.catNavigation",
        "profile.standard",
        "studio.video",
        "engine.secrets",
        "cat.secrets",
        // Die Maßeinheit der Bildrate. „Bilder/s" wäre eine Übersetzung, die
        // niemand liest, und ein de-englisches Paar für dieselbe Abkürzung nur
        // Rauschen in der Liste.
        "hud.fpsUnit",
      ]),
    );
  });
});

describe("die Hilfstexte sprechen die gewählte Sprache", () => {
  it("die Karte zur riskantesten Datei heißt, wie sie soll", () => {
    // Der Knopf braucht eine Tour-Station im Fixture und fällt im Render-Test
    // weg — die Zeile selbst ist hier pinned.
    expect(t("en", "ctx.reviewHighest")).toBe("Review priority finding");
    expect(t("de", "ctx.reviewHighest")).toBe("Priorisierten Fund prüfen");
  });

  it("describeGitignoreSkips und explainDistrictDraw folgen dem Lang-Parameter", () => {
    expect(describeGitignoreSkips({ files: 49, directories: 3 }, "de")).toBe(
      "49 Dateien und 3 Ordner",
    );
    const city = cityData();
    const de = explainDistrictDraw(city.tree.children[0]!, city.limits, "de");
    expect(de.join(" ")).toContain("Unterbezirken");
    expect(de.join(" ")).not.toContain("sub-district");
    const en = explainDistrictDraw(city.tree.children[0]!, city.limits, "en");
    expect(en.join(" ")).toContain("sub-districts");
  });
});

describe("die Panels antworten in der gewählten Sprache", () => {
  it("Projekt-Panel: Deutsch ohne ein einziges englisches Label", async () => {
    const host = await show(createElement(ContextCard), "de");
    const s = text(host);
    expect(s).toContain("Projektübersicht");
    expect(s).toContain("Codezeilen");
    expect(s).toContain("Funde zur Prüfung");
    expect(s).toContain("von .gitignore ausgeschlossen");
    expect(s).toContain("Meiste Beiträge:");
    expect(s).toContain("Stadt-Legende");
    expect(s).toContain("84 von 92 Dateien hier wurden nie geprüft von semgrep");
    expect(offenders(host)).toEqual([]);
  });

  it("Projekt-Panel: Englisch bleibt, was es war", async () => {
    const host = await show(createElement(ContextCard), "en");
    const s = text(host);
    expect(s).toContain("Project overview");
    expect(s).toContain("7 findings to review");
    expect(s).toContain("49 files and 3 folders kept out by .gitignore");
    expect(s).toContain("84 of 92 files here were never checked by semgrep");
    expect(s).toContain("Not classified 7 · Injection & execution 4 · Code hygiene 3");
    expect(s).toContain("Top contributor:");
  });

  it("Legende im Panel: Deutsch, ohne englisches Label", async () => {
    const host = await show(createElement(ContextCard), "de");
    const toggle = [...host.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Stadt-Legende"),
    );
    await act(async () => toggle?.click());
    const legend = host.querySelector("#context-city-legend");
    expect(legend).not.toBeNull();
    expect(text(legend as HTMLElement)).toContain("Gebäudehöhe");
    expect(text(legend as HTMLElement)).toContain("Zirkulärer Import");
    expect(offenders(host)).toEqual([]);
  });

  it("Erstbesuch-Primer: Deutsch inklusive der vier Schritte", async () => {
    const host = await show(createElement(CoachMarks), "de", { showPrimer: true });
    const s = text(host);
    expect(s).toContain("Erkunde deine Codebasis");
    expect(s).toContain("Pfeiltasten drehen die Ansicht");
    expect(s).toContain("Was bedeuten die Marker in der Stadt?");
    expect(offenders(host)).toEqual([]);
  });

  it("Erstbesuch-Primer: Englisch unverändert", async () => {
    const host = await show(createElement(CoachMarks), "en", { showPrimer: true });
    const s = text(host);
    expect(s).toContain("Explore your codebase");
    expect(s).toContain("Arrow keys turn the view");
    expect(s).toContain("Press ? for the full guide");
  });

  /**
   * The grade words moved. They used to sit on the scan toast as well, which
   * is how one screen came to write "Critical / High / Medium" three times;
   * the header is the surface that says them, and it is the one that filters
   * the city when clicked. So the translation claim follows them here.
   */
  it("Kopfzeile: die Schwere-Wörter in deutscher Schreibweise", async () => {
    const host = await show(createElement(HudOverlay, { apiStatus: "live" }), "de");
    const s = text(host);
    expect(s).toContain("Kritisch");
    expect(s).toContain("Hoch");
    expect(offenders(host)).toEqual([]);
  });

  it("Kopfzeile: dieselben Schwere-Wörter auf Englisch", async () => {
    const host = await show(createElement(HudOverlay, { apiStatus: "live" }), "en");
    const s = text(host);
    expect(s).toContain("Critical");
    expect(s).toContain("High");
  });

  it("Scan-Toast: Deutsch ohne englisches Label", async () => {
    const host = await show(createElement(ScanSummary), "de");
    const s = text(host);
    expect(s).toContain("92 Dateien analysiert");
    expect(s).toContain("Scan abgeschlossen");
    expect(offenders(host)).toEqual([]);
  });

  it("Scan-Toast: Englisch unverändert", async () => {
    const host = await show(createElement(ScanSummary), "en");
    const s = text(host);
    expect(s).toContain("92 files analyzed");
    expect(s).toContain("◈ Scan complete");
    expect(s).toContain("49 files and 3 folders kept out by .gitignore");
  });

  it("Stadtplan: Deutsch ohne englisches Label", async () => {
    const host = await show(createElement(Minimap), "de");
    expect(text(host)).toContain("STADTKARTE");
    expect(offenders(host)).toEqual([]);
  });

  it("Profil-Chips und Detailkarte: Deutsch ohne englisches Label", async () => {
    // Der Flächen-Block (Kategorien, Regel-Packs) sitzt nur noch in der Stadt.
    const host = await show(createElement(ProfileChips, { variant: "analyze-panel" }), "de");
    const chips = host.querySelector(".profile-options:not(.category-options)");
    const labels = [...(chips?.querySelectorAll("button") ?? [])].map((b) =>
      (b.textContent ?? "").replace("✓ ", "").trim(),
    );
    expect(labels).toEqual(["Schnell", "Standard", "Tief"]);
    const categoryLabels = [
      ...(host.querySelectorAll(".category-options button") as NodeListOf<HTMLButtonElement>),
    ].map((b) => (b.textContent ?? "").replace("✓ ", "").trim());
    expect(categoryLabels).toContain("Abhängigkeiten & Lieferkette");
    expect(categoryLabels).toContain("Code-Hygiene");
    // Die Detailkarte ist die eigentliche Entscheidungs-Karte.
    const standard = [...(chips?.querySelectorAll("button") ?? [])].find((b) =>
      (b.textContent ?? "").includes("Standard"),
    );
    await act(async () => standard?.click());
    const card = host.querySelector(".profile-detail");
    expect(card).not.toBeNull();
    const s = text(card as HTMLElement);
    expect(s).toContain("Angeforderte Prüfungen");
    expect(s).toContain("Code-Muster");
    expect(s).toContain("Tiefe AST-Regeln");
    expect(s).toContain("BERICHT:");
    expect(s).toContain("DIESES PROFIL NEHMEN");
    // The dialog used to print a reference time here; the row is gone with the
    // unbacked number, and this pins that no seconds came back in its place.
    expect(s).not.toMatch(/~\d+\s*(s|Sekunden)\b/i);
    expect(s).not.toContain("REFERENZZEIT:");
    expect(offenders(host)).toEqual([]);
  });

  it("Profil-Chips: Englische Beschriftungen bleiben byte-identisch", async () => {
    const host = await show(createElement(ProfileChips, { variant: "analyze-panel" }), "en");
    const chips = host.querySelector(".profile-options:not(.category-options)");
    const labels = [...(chips?.querySelectorAll("button") ?? [])].map((b) =>
      (b.textContent ?? "").replace("✓ ", "").trim(),
    );
    expect(labels).toEqual(["Quick", "Standard", "Deep"]);
    const categoryLabels = [
      ...(host.querySelectorAll(".category-options button") as NodeListOf<HTMLButtonElement>),
    ].map((b) => (b.textContent ?? "").replace("✓ ", "").trim());
    expect(categoryLabels).toEqual(FINDING_CATEGORIES.map((c) => t("en", c.label)));
    expect(host.textContent ?? "").toContain(t("en", "profile.durationNote"));
  });
});

/**
 * #52 — InfoPanel stand voll harter englischer Chip-Wörter im JSX. Vier davon
 * nennen auf Englisch, WAS für ein Turm steht (DEAD CODE?, CYCLE, COV,
 * CLONE ×) — die gehen jetzt durchs Wörterbuch. Gerendert wird auf einer
 * Datei, die jeden Chip-Feldträger trägt, in beiden Sprachen, und die
 * Englisch-Werte bleiben wörtlich die alten Buchstaben (#49 Regel b).
 * Bewusst englisch geblieben — dieselben Wörter, die der deutsche Tooltip
 * selbst schreibt: CHURN ("Git-Churn"), API ("API-Fläche"), AST ("AST-Funde"),
 * SECRETS ("hartkodierte Secrets"), dazu die sprachneutralen Maße LOC, KB, cx.
 */
describe("InfoPanel: die Chip-Wörter sprechen die gewählte Sprache", () => {
  async function chipPanel(lang: Lang): Promise<HTMLElement> {
    // jsdom kennt beides nicht; der SourceBlock fragt bei Findings automatisch.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: () => {} })),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline — der SourceBlock muss das schlucken");
      }),
    );
    const { finding } = await import("./helpers/cityFixture");
    const rich = file(
      "frontend/src/db.js",
      "JavaScript",
      [
        finding({
          type: "EVAL_USAGE",
          ruleId: "regex:EVAL_USAGE",
          category: "injection",
          provenance: "semgrep",
          severity: "P0",
          line: 7,
          message: "eval usage",
        }),
        finding({
          type: "HARDCODED_SECRET",
          category: "secrets",
          provenance: "gitleaks",
          severity: "P1",
          line: 12,
        }),
      ],
      undefined,
      {
        linesOfCode: 1204,
        cyclomaticComplexity: 14,
        churnScore: 3.2,
        commitCount: 41,
        exportedSymbols: 7,
        deadCodeCandidate: true,
        bytes: 200_000,
        inCycle: true,
        coveragePct: 42,
        clonePartners: [{ id: "f-other", path: "frontend/src/other.js", lines: 12 }],
        topAuthor: "m.soppa",
      },
    );
    return show(createElement((await import("../src/components/InfoPanel")).InfoPanel), lang, {
      cityData: city({ files: [rich], scanProvenance: provenance() }),
      selectedUnit: { kind: "file", id: rich.id },
      focusPath: ["archiv"],
    });
  }

  it("Deutsch: die vier Chip-Wörter deutsch, Einheiten und Lehnwörter stehen, kein einziges englisches Label", async () => {
    const host = await chipPanel("de");
    const s = text(host);
    expect(s).toContain("TOTER CODE?");
    expect(s).toContain("ZYKLUS");
    expect(s).toContain("ABDECKUNG 42 %");
    expect(s).toContain("KLON ×1");
    expect(s).toContain("→ BEZIRK ÖFFNEN");
    // geprüfte Beibehaltungen, an den deutschen Zahlen gemessen:
    expect(s).toContain("CHURN 3,20");
    expect(s).toContain("1.204 LOC");
    expect(s).toContain("cx 14");
    expect(s).toContain("195 KB");
    expect(s).toContain("API 7");
    expect(s).toContain("AST");
    expect(s).toContain("SECRETS");
    // Zwei Flächen ignoriert diese Zeile bewusst, beide gehören nicht diesem
    // Panel an: der gesprittene `<style>`-Block (Focus-Puls-Keyframes —
    // Maschinen-Code, keine Label) und der harte englische placeholder in
    // OpenInIde.tsx:88 "/absolute/path/to/repo" — Nebenfund, übergeben, hier
    // erst wieder reingelassen, wenn diese Lane ihn gefixt hat.
    const foreign = (o: string) => o.startsWith("@keyframes") || o === "/absolute/path/to/repo";
    expect(offenders(host).filter((o) => !foreign(o))).toEqual([]);
    expect(offenders(host).some((o) => o === "/absolute/path/to/repo")).toBe(true);
  });

  it("Englisch: jeder Chip bleibt byte-identisch zum vormaligen Inline-Wort", async () => {
    const host = await chipPanel("en");
    const s = text(host);
    expect(s).toContain("DEAD CODE?");
    expect(s).toContain("CYCLE");
    expect(s).toContain("COV 42%");
    expect(s).toContain("CLONE ×1");
    expect(s).toContain("→ OPEN DISTRICT");
    expect(s).toContain("CHURN 3.20");
    expect(s).toContain("1,204 LOC");
    expect(s).toContain("cx 14");
    expect(s).toContain("195 KB");
    expect(s).toContain("API 7");
    expect(s).toContain("AST");
    expect(s).toContain("SECRETS");
  });

  it("die vier neuen Schlüssel sind keine EN/DE-Kopien", () => {
    for (const key of [
      "panel.chipDeadCode",
      "panel.chipCycle",
      "panel.chipCoverage",
      "panel.chipClone",
    ] as DictKey[]) {
      expect(DICT[key]!.en.trim()).not.toBe(DICT[key]!.de.trim());
    }
  });
});

/**
 * Die Klassen-Wache, nicht der Einzelfall: kein hartes englisches Wort (>3
 * Buchstaben) darf mehr als JSX-Textknoten in InfoPanel.tsx stehen, außer er
 * steht auf der begründeten Allowliste. greift die Quelle, nicht den Render —
 * damit die nächste Panel-Änderung nicht auf dieselbe Weise regressiert.
 */
describe("InfoPanel-Klasse: kein hartes englisches JSX-Wort ohne Wörterbuch", () => {
  const ALLOW: Record<string, string> = {
    CHURN:
      "Lehnwort, in beiden Sprachen identisch — der deutsche Tooltip schreibt selbst 'Git-Churn' (panel.churnTitle, de); stadt-ui-verdicts pinnt das Chip-Wort.",
    API: "etablierte Abkürzung, in beiden Sprachen identisch; deutscher Tooltip 'API-Fläche' (panel.apiTitle).",
    AST: "etablierte Abkürzung, in beiden Sprachen identisch; deutscher Tooltip 'AST-Funde' (panel.astTitle).",
    SECRETS:
      "Sicherheits-Fachlehnwort, in beiden Sprachen identisch; deutscher Tooltip 'hartkodierte Secrets' (panel.secretsTitle).",
    LOC: "sprachneutrale Zähleinheit (lines of code); Bedeutung im Tooltip (panel.locTitle).",
    KB: "SI-Einheit, sprachneutral.",
    CX: "Formelsymbol für zyklomatische Komplexität, sprachneutral; Erklärung im Tooltip (panel.cxTitle).",
  };

  function englishWordsInJsxText(source: string): string[] {
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``")
      .replace(/\/\/[^\n]*/g, " ");
    const hits: string[] = [];
    // ein JSX-Textknoten steht zwischen `>`/`}` und dem nächsten `<`/`{`
    for (const m of code.matchAll(/([>}])\s*([^<>{}]+?)(?=[<{])/g)) {
      const seg = m[2]!;
      // `} catch {`, `} else {` — Steuerkonstrukte, keine Copy; ein echter
      // Textknoten kann nie genau ein reserviertes Wort sein
      if (/^(catch|else|finally|return|case|default)$/.test(seg.trim())) continue;
      // Code-Fetzen (Klamern, Operatoren, Punkte) sind keine Copy — raus damit
      if (/[()[\];=|&:.,!"'`\\#$%^*+/\d]/.test(seg)) continue;
      for (const word of seg.toUpperCase().match(/[A-Z]{4,}/g) ?? []) {
        if (!ALLOW[word]) hits.push(`${word} (in "${seg.trim()}")`);
      }
    }
    return hits;
  }

  it("die Messregel sieht ein englisches Wort im Textknoten (Gegenprobe) und läss Einheiten durch", () => {
    expect(englishWordsInJsxText("<span>\n            DEAD CODE?\n          </span>")).toEqual([
      'DEAD (in "DEAD CODE?")',
      'CODE (in "DEAD CODE?")',
    ]);
    expect(englishWordsInJsxText("<span>\n            CHURN {v}\n          </span>")).toEqual([]);
    expect(englishWordsInJsxText("<span>\n            {n} LOC\n          </span>")).toEqual([]);
    expect(englishWordsInJsxText("const p = list.map((x) => x.path).join(', ');")).toEqual([]);
  });

  it("InfoPanel.tsx hält die Regel: nur die begründete Allowliste bleibt englisch", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve } = await import("node:path");
    const here = resolve(fileURLToPath(import.meta.url), "..");
    const source = readFileSync(resolve(here, "../src/components/InfoPanel.tsx"), "utf-8");
    expect(englishWordsInJsxText(source)).toEqual([]);
  });
});
