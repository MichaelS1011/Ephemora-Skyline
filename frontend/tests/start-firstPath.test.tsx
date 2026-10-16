// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanSummary } from "../src/components/ScanSummary";
import { CoachMarks } from "../src/components/CoachMarks";
import {
  StartNotice,
  ScanProgress,
  classifyStartError,
  type StartErrorKind,
} from "../src/components/Landing";
import { LoadingScreen } from "../src/components/LoadingScreen";
import { useStore } from "../src/stores/useStore";
import { DICT, t } from "../src/i18n";
import type { CityData, CityDir, CityFile, DroppedFiles } from "../src/city/types";

/**
 * The first path — landing, wait, walls, completion line, first look.
 *
 * Measured in a local measurement script that is not shipped (Befunde 2, 3, 5, 6, 7, 9)
 * and re-measured by Lane START: a German run that caught an English error
 * sentence, a wait whose bar stood at 88 % for 28 s without saying it was
 * alive, a 3000-file folder that gave no number and no way out, and a
 * completion toast that was gone in 5,1 s.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

const EN_MARKERS =
  /\b(the|your|and|with|from|files?|folder|exceeds?|aborted|exclude|retry|supported|analyzed|complete|waiting|uploading|reading|ready|cancelled|failed|timed out|restarted|backend|choose|server|still working)\b/i;
const GERMAN_ONLY =
  /[äöüß]|\b(der|die|das|und|nicht|deine|mit|für|ist|auf|von|werden|keine|kein|ein|wird|Stadt|Ordner|Dateien|Datei|Rechner|bereit|Struktur|Quelle|Funde|Fund|diese|über|unter|nach|vor|zum|zur|bei|aus|im|du|dir|wählen|wähle|erkunde|siehe|finde|bleibt|läuft|hat|sind|gemacht|gelesen)\b/i;

/** Lines a German screen may not show. Words that are the same in both
 *  languages (Scan, Ordner-Endungen, Pfade) are allowed. */
function englishLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/\{[a-zA-Z]+\}/g, " ").trim())
    .filter((l) => l.length > 3)
    .filter((l) => /[a-z]/i.test(l))
    .filter((l) => !/^[a-z0-9_.\-/:,#()[\]{}'"+*\s]+$/i.test(l) || l.includes(" "))
    .filter((l) => EN_MARKERS.test(l) && !GERMAN_ONLY.test(l));
}

function file(path: string): CityFile {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 40,
    cyclomaticComplexity: 3,
    threatLevel: "safe",
    findings: [],
  };
}

function dir(path: string): CityDir {
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: 32,
    linesOfCode: 1280,
    languages: { TypeScript: 1280 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [file(`${path}/a.ts`)],
    districtFiles: [],
    remainingFiles: 0,
  };
}

function city(overrides: Partial<CityData> = {}): CityData {
  const tree = dir("");
  return {
    repo: { owner: "local", name: "repo-deep", branch: "main" },
    analysisId: "scan-1",
    totalFiles: 32,
    renderedFiles: 32,
    totalLines: 1280,
    languages: tree.languages,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree: { ...tree, name: "", path: "" },
    fileConnections: [],
    dirConnections: [],
    meta: {
      churn: false,
      deadCode: false,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: false,
    },
    ...overrides,
  };
}

let host: HTMLDivElement;
let root: Root;

function render(node: ReactElement): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
}

const text = (): string => (host.textContent ?? "").replace(/\s+/g, " ");
const html = (): string => host.innerHTML;
/** One entry per visible text block — the unit a reader calls a line. */
const lines = (): string[] =>
  [...host.querySelectorAll("p, li, button, summary, h2, code")]
    .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((l) => l !== "");

function useCity(c: CityData): void {
  const lang = useStore.getState().prefs.lang;
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: c,
      analysisId: "scan-1",
      buildPhase: "built",
    },
    true,
  );
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { lang: "de", gfxLite: false, colorblind: false, updateCheck: true },
    },
    true,
  );
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

/** The dwell tests own the clock; the rest of the file runs on the real one. */
function withFakeClock(fn: () => void): void {
  vi.useFakeTimers();
  try {
    fn();
  } finally {
    vi.useRealTimers();
  }
}

describe("no invented dictionary key reaches the screen", () => {
  /**
   * `t()` answers a missing key with the key itself, so one wrong string in a
   * component prints `landing.streetNote` on the landing page instead of a
   * sentence. The bridge in `startCopy.ts` is allowed to name keys the
   * dictionary does not have yet (it checks first); a bare `t()` is not.
   * Same rule the type floor pins: the guard lives next to the text.
   */
  const files = [
    "components/Landing.tsx",
    "components/ScanSummary.tsx",
    "components/CoachMarks.tsx",
    "components/LoadingScreen.tsx",
    "components/ProfileChips.tsx",
  ];
  const dict = new Set(Object.keys(DICT));
  for (const f of files) {
    it(`${f} only asks the dictionary for keys it has`, () => {
      const src = readFileSync(path.join(SRC, f), "utf-8");
      const used = [...src.matchAll(/\bt\(\s*[a-zA-Z]+\s*,\s*"([a-zA-Z0-9.]+)"/g)].map(
        (m) => m[1]!,
      );
      expect(used.length, `${f} should call t() at all`).toBeGreaterThan(0);
      expect(used.filter((k) => !dict.has(k))).toEqual([]);
    });
  }
});

describe("the boundary states speak the screen's language", () => {
  /** Befund 5 / D5: 10,300 files, 31 s of work, then an English sentence. */
  const cases: [string, string, number, StartErrorKind][] = [
    [
      t("de", "cap.filesFound", { found: "10.300", max: "10.000" }),
      "folder exceeds 10000 files",
      10300,
      "cap",
    ],
    [t("en", "cap.filesFound", { found: "10,300", max: "10,000" }), "exceeds", 10300, "cap"],
    [t("de", "cap.filesFound", { found: "0", max: "10.000" }), "", 0, "no-source"],
    [t("de", "scan.noSourceTooLargeOne", { n: "1" }), "", 0, "no-source"],
    [t("en", "scan.noSourceTooLarge", { n: "3" }), "", 0, "no-source"],
    ["Der lokale Server bittet um eine Pause — weiter in 192 s", "HTTP 429", 12, "rate-limit"],
    ["Die Demo konnte nicht geladen werden.", "Failed to fetch", 4, "server-down"],
    ["Der lokale Server antwortet nicht auf Port 4000.", "no answer within 20 min", 4, "timeout"],
    ["Analyse fehlgeschlagen.", "analysis job not found (404) — backend restarted?", 4, "job-gone"],
  ];

  it.each(cases)("classifies %j as its kind", (message, detail, found, kind) => {
    expect(classifyStartError(detail, message, found)).toBe(kind);
  });

  it("names what was measured and what comes next, in German", () => {
    render(
      <StartNotice
        lang="de"
        kind="cap"
        measured={t("de", "cap.filesFound", { found: "10.300", max: "10.000" })}
        next={`${t("de", "cap.hint")} · Ordner ausschließen`}
        raw="Analysis aborted — folder exceeds 10000 files / 150 MB"
      />,
    );
    expect(text()).toContain("Was gemessen wurde");
    expect(text()).toContain("Wie es weitergeht");
    expect(text()).toContain("10.300");
    // the server's own words stay reachable, but never as the headline
    expect(html()).toContain("start-state-raw");
    expect(host.querySelector(".start-state--cap")).toBeTruthy();
  });

  it("leaves no English sentence on a German state card", () => {
    render(
      <StartNotice
        lang="de"
        kind="no-source"
        measured="Dieser Ordner enthält keinen Quellcode, den die Scanner lesen können."
        next="Unterstützte Sprachen: ts, tsx, js"
      />,
    );
    expect(englishLines(lines().join("\n"))).toEqual([]);
  });
});

describe("the completion line", () => {
  /** Befund 4 / D4: 30 of 62 paths left the scan without a number anywhere. */
  it("counts every path the scan did not read", () => {
    const dropped: DroppedFiles = {
      pathTooLong: 30,
      unsafePath: 0,
      tooLarge: 2,
      unreadable: 1,
      excluded: 0,
      gitIgnored: 0,
      gitBudget: 0,
      unsupportedFormat: 4,
    };
    useCity(city({ dropped }));
    render(<ScanSummary />);
    expect(text()).toContain("30 Dateien lagen über der Pfadgrenze");
    expect(text()).toContain("2 Dateien waren zu groß oder unlesbar");
    expect(text()).toContain("1 Datei konnte nicht gelesen werden");
    expect(text()).toContain("4 Dateien in einem Format, das die Scanner nicht lesen");
    expect(host.querySelector(".start-summary-drops")).toBeTruthy();
  });

  /**
   * The case the counter existed for, measured over docs/ on this machine: 17
   * files on disk, 0 of them a format the scan reads, and the result said
   * nothing went unread. A folder of documents must not render as an empty one.
   */
  it("owns the files it never read, even when it read none", () => {
    useCity(
      city({
        totalFiles: 0,
        dropped: {
          pathTooLong: 0,
          unsafePath: 0,
          tooLarge: 0,
          unreadable: 0,
          excluded: 0,
          gitIgnored: 0,
          gitBudget: 0,
          unsupportedFormat: 17,
        },
      }),
    );
    withFakeClock(() => {
      render(<ScanSummary />);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
    });
    // 17 unread of 17 on disk, and the one number the strip carries says so.
    expect(host.querySelector(".start-summary-strip")?.textContent ?? "").toContain(
      "17 Dateien wurden nicht gelesen",
    );
    expect(host.querySelector(".start-summary-strip")?.textContent ?? "").toContain(
      "0 Dateien analysiert",
    );
  });

  it("says nothing about drops it does not know", () => {
    useCity(city());
    render(<ScanSummary />);
    expect(host.querySelector(".start-summary-drops")).toBeNull();
  });

  /** Befund 8's sibling: "no findings" must not wear the green of a checked sweep. */
  it("draws an unverified sweep differently from a clean one", () => {
    useCity(
      city({
        scanProvenance: {
          regex: true,
          gitleaks: false,
          semgrep: false,
          dependencies: false,
          osv: false,
          ruff: false,
          churn: false,
          duplicates: false,
          coverage: false,
        },
      }),
    );
    render(<ScanSummary />);
    expect(host.querySelector(".start-summary.is-unverified")).toBeTruthy();
    expect(text()).toContain("Keine Funde —");
    expect(text()).toContain("liefen nicht");

    useCity(
      city({
        scanProvenance: {
          regex: true,
          gitleaks: true,
          semgrep: true,
          dependencies: true,
          osv: true,
          ruff: true,
          churn: true,
          duplicates: true,
          coverage: true,
        },
      }),
    );
    act(() => root.render(<ScanSummary />));
    expect(host.querySelector(".start-summary.is-clear")).toBeTruthy();
    expect(text()).toContain("Die Scanner liefen und fanden nichts");
  });

  /** The card used to be gone after 5,1 s whether read or not. */
  it("keeps the information after the card closes itself", () => {
    useCity(city());
    withFakeClock(() => {
      render(<ScanSummary />);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
    });
    expect(host.querySelector(".start-summary")).toBeNull();
    const strip = host.querySelector(".start-summary-strip");
    expect(strip).toBeTruthy();
    expect(strip?.textContent ?? "").toContain("Dateien");
  });

  /** A strip of bare numbers ("· 1 · 1") is not a measurement you can read. */
  it("labels every number the strip keeps", () => {
    useCity(
      city({
        findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
        dropped: {
          pathTooLong: 28,
          unsafePath: 0,
          tooLarge: 0,
          unreadable: 0,
          excluded: 0,
          gitIgnored: 0,
          gitBudget: 0,
          unsupportedFormat: 4,
        },
      }),
    );
    withFakeClock(() => {
      render(<ScanSummary />);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
    });
    const strip = host.querySelector(".start-summary-strip")?.textContent ?? "";
    expect(strip).toContain("1 Fund zur Prüfung");
    // every reason adds to the one number, the new one included
    expect(strip).toContain("32 Dateien wurden nicht gelesen");
  });

  it("stops closing while it is being read", () => {
    useCity(city());
    render(<ScanSummary />);
    withFakeClock(() => {
      const card = host.querySelector(".start-summary") as Element;
      // React synthesises onMouseEnter from a bubbling mouseover
      act(() => {
        card.dispatchEvent(new Event("mouseover", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(20000);
      });
      expect(host.querySelector(".start-summary"), "held by the pointer").toBeTruthy();
      act(() => {
        card.dispatchEvent(new Event("mouseout", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(host.querySelector(".start-summary-strip"), "released, so it closes").toBeTruthy();
    });
  });
});

describe("the wait while a scan runs", () => {
  const stages = [
    { key: "stage.enumerating", label: "Dateien aufzählen", state: "done" },
    { key: "stage.parsing", label: "Dateien parsen", state: "done" },
    { key: "stage.deepscan", label: "Tiefenscan (semgrep + gitleaks)", state: "active" },
    { key: "stage.git", label: "Git-Historie", state: "todo" },
  ] as const;

  const panel = (elapsedSec: number, collecting = false) => (
    <ScanProgress
      lang="de"
      collecting={collecting}
      stageLine={`Tiefenscan (semgrep + gitleaks) · seit ${elapsedSec} s`}
      progress={88}
      collected={{ files: 33, bytes: 11000, total: 62 }}
      elapsedSec={elapsedSec}
      budgetWaitSec={0}
      stages={[...stages]}
      onCancel={() => {}}
    />
  );

  /** Befund 3 / D3: 88 % for 28 s and nothing said the program was alive. */
  it("says a standing stage is still working", () => {
    useCity(city());
    render(panel(9));
    expect(host.querySelector(".start-progress.is-stalled")).toBeTruthy();
    expect(text()).toContain("läuft noch — 9 s auf dieser Stufe");
    expect(text()).toContain("Stufe 3 von 4");
  });

  it("stays calm while the stage changes quickly", () => {
    useCity(city());
    render(panel(3));
    expect(host.querySelector(".start-progress.is-stalled")).toBeNull();
    expect(text()).not.toContain("läuft noch");
  });

  /** Befund 2 / D2: the counter that read "0 Dateien" for 31 s. */
  it("counts what has been read against what the folder holds", () => {
    useCity(city());
    render(panel(2, true));
    expect(text()).toContain("33 von 62");
    expect(text()).toContain("11 KB");
  });

  /**
   * Item 15: while the folder is still being read, no server stage has been
   * named, and the ladder ticks nothing — but the meta line below it read
   * "Stufe 1 von 10" anyway, which is a step nobody had run.
   */
  it("names no stage while the folder is still being read", () => {
    useCity(city());
    const reading = [
      { key: "stage.enumerating", label: "Dateien aufzählen", state: "todo" },
      { key: "stage.parsing", label: "Dateien parsen", state: "todo" },
      { key: "stage.deepscan", label: "Tiefenscan (semgrep + gitleaks)", state: "todo" },
    ] as const;
    render(
      <ScanProgress
        lang="de"
        collecting
        stageLine=""
        progress={0}
        collected={{ files: 12, bytes: 4000, total: 62 }}
        elapsedSec={4}
        budgetWaitSec={0}
        stages={[...reading]}
        onCancel={() => {}}
      />,
    );
    const meta = host.querySelector(".start-progress-meta");
    expect(meta?.textContent).toContain("noch keine Scan-Stufe gelaufen");
    expect(text()).not.toMatch(/Stufe [0-9]+ von/);
  });

  it("counts the stage that is actually running", () => {
    useCity(city());
    render(panel(2));
    expect(host.querySelector(".start-progress-meta")?.textContent).toContain("Stufe 3 von 4");
  });
});

describe("the boot screen", () => {
  /** The four typed-out boot lines advanced on a timer, whatever the server did. */
  it("shows the city it is waiting for and the seconds it has waited", () => {
    window.history.replaceState(null, "", "/?city=11ce2b42-d295-4759-8abd-8e05f5d30789");
    render(<LoadingScreen isVisible />);
    expect(text()).toContain("Die Stadt unter diesem Link wird geladen");
    expect(text()).toContain("11ce2b42");
    expect(text()).not.toContain("Ready");
    expect(text()).not.toContain("Flugkamera");
  });
});

describe("the first look at the city", () => {
  it("starts as a strip and keeps the hints behind one click", () => {
    useCity(city());
    render(<CoachMarks />);
    const primer = host.querySelector('[role="region"]');
    expect(primer).toBeTruthy();
    // resting state: one line, the card closed over the city
    expect(primer?.getAttribute("open")).toBeNull();
    const summary = host.querySelector("summary.start-coach-strip") as HTMLElement;
    expect(summary).toBeTruthy();
    act(() => summary.click());
    expect(host.querySelector("details.start-coach[open]")).toBeTruthy();
    expect(host.querySelector(".start-coach-hints")).toBeTruthy();
    expect(host.querySelectorAll(".start-coach-hint")).toHaveLength(4);
  });
});

describe("the summary line gets out of the way when it is told to", () => {
  /**
   * The ✕ wrote a state the render never read: `open` only feeds the countdown,
   * `collapsed` decides panel or strip. Measured in the browser before the fix —
   * after the click the panel was still there, and still there 14 s later. A
   * dismiss control that dismisses nothing is worse than no control, because it
   * teaches people that this interface does not answer to them.
   */
  it("collapses to its strip on dismiss and comes back on show again", () => {
    useCity(city());
    render(<ScanSummary />);
    expect(host.querySelector(".start-summary"), "the panel did not arrive").toBeTruthy();
    const close = host.querySelector(".start-summary-close") as HTMLElement;
    expect(close, "no dismiss button on the panel").toBeTruthy();
    act(() => close.click());
    expect(host.querySelector(".start-summary"), "the panel survived its own dismiss").toBeNull();
    expect(host.querySelector(".start-summary-strip"), "no strip took its place").toBeTruthy();
    const again = host.querySelector(".start-summary-strip-open") as HTMLElement;
    act(() => again.click());
    expect(
      host.querySelector(".start-summary"),
      "show again did not bring the panel back",
    ).toBeTruthy();
  });

  /**
   * The arrival effect keyed on `cityData`, and a language switch hands it a
   * fresh reference for the same scan. Measured in the browser: the node that
   * carried the dismissal came back as the full panel, covering the card the
   * person had been reading. One line per scan, not one per re-render.
   */
  it("stays dismissed when the same city is handed over again", () => {
    useCity(city());
    render(<ScanSummary />);
    const close = host.querySelector(".start-summary-close") as HTMLElement;
    act(() => close.click());
    expect(host.querySelector(".start-summary")).toBeNull();
    act(() => {
      useStore.setState({ cityData: { ...useStore.getState().cityData! } });
    });
    expect(
      host.querySelector(".start-summary"),
      "a re-render re-opened a dismissed notice",
    ).toBeNull();
    expect(host.querySelector(".start-summary-strip"), "the strip went away with it").toBeTruthy();
  });
});
