// @vitest-environment jsdom
// Befund 8 (Dossier D8) and Befund 7 (Dossier D7), measured on the running app
// 2026-10-08: a file the payload marks `unverifiedBy: ["gitleaks","semgrep"]`
// (demo city, 67 of 73 files) opened its green "Keine Funde in dieser Datei"
// box in the panel while the very same file hovered grey in the city. The
// panel never consulted `isUncheckedClean`, the only decision Tooltip and the
// heat tiles use. The second block pins the bilingual finding line: the
// scanner speaks English ("Hardcoded secret detected (generic-api-key) —
// gitleaks", from the real scan of repo-deep), and until Lane LOKAL ships
// `messageDe` the panel shows the curated German sentence for that finding
// class as its own line — and shows nothing invented when it has no idea.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoPanel } from "../src/components/InfoPanel";
import { HudOverlay } from "../src/components/HudOverlay";
import { FindingsPanel } from "../src/components/FindingsPanel";
import { t, type Lang } from "../src/i18n";
import { isUncheckedClean } from "../src/city/provenance";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile, CityFinding } from "../src/city/types";

function finding(over: Partial<CityFinding> = {}): CityFinding {
  return {
    type: "HARDCODED_SECRET",
    severity: "P0",
    line: 2,
    message: "Hardcoded secret detected (generic-api-key) — gitleaks",
    provenance: "gitleaks",
    ruleId: "generic-api-key",
    category: "secrets",
    ...over,
  } as CityFinding;
}

function file(path: string, findings: CityFinding[], unverifiedBy?: string[]): CityFile {
  return {
    id: `f-${path}`,
    name: path.split("/").pop() ?? path,
    path,
    language: "JavaScript",
    linesOfCode: 3,
    cyclomaticComplexity: 1,
    threatLevel: findings.length > 0 ? "critical" : "safe",
    findings,
    unverifiedBy,
  };
}

function dir(path: string, detailFiles: CityFile[]): CityDir {
  const p0 = detailFiles.reduce(
    (s, f) => s + f.findings.filter((q) => q.severity === "P0").length,
    0,
  );
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: detailFiles.length,
    linesOfCode: 100,
    languages: { JavaScript: 100 },
    findingsBySeverity: { P0: p0, P1: 0, P2: 0 },
    threatScore: p0 > 0 ? 60 : 0,
    topFindings: [],
    children: [],
    detailFiles,
    remainingFiles: 0,
    districtFiles: [],
  } as CityDir;
}

/**
 * `allEngines` builds the two cities the header has to tell apart: one whose
 * security engines all ran, one where gitleaks was switched off — same zero
 * findings, a different statement.
 */
function city(detailFiles: CityFile[], allEngines = true): CityData {
  const findings = detailFiles.flatMap((f) => f.findings);
  return {
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { JavaScript: 100 },
    totalFiles: detailFiles.length,
    renderedFiles: detailFiles.length,
    threatScore: 0,
    findingsBySeverity: {
      P0: findings.filter((f) => f.severity === "P0").length,
      P1: 0,
      P2: 0,
    },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    unverifiedEngines: allEngines ? [] : ["gitleaks"],
    scanProvenance: {
      regex: true,
      gitleaks: allEngines,
      semgrep: true,
      dependencies: true,
      osv: true,
      ruff: true,
    },
    tree: dir("", detailFiles),
  } as unknown as CityData;
}

let container: HTMLDivElement;
let root: Root;

async function show(
  el: Parameters<Root["render"]>[0],
  data: CityData,
  lang: Lang = "de",
): Promise<void> {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: data,
      buildPhase: "built",
      analysisId: "scan-1",
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(el));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, addListener: () => {} })),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

const text = () => (container.textContent ?? "").replace(/\s+/g, " ");

describe("grün im Panel heißt: ein Engine hätte es finden können", () => {
  it("shows the checked-clean sentence only where nothing was kept out", async () => {
    const clean = file("src/checked.js", []);
    expect(isUncheckedClean(clean)).toBe(false);
    await show(createElement(InfoPanel), city([clean]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: clean.id }));
    expect(text()).toContain(t("de", "panel.noFindingsChecked"));
    expect(text()).toContain(t("de", "panel.statusNoFindings"));
    expect(text()).not.toMatch(/\bsafe\b/i);
    expect(container.querySelector('[data-file-verdict="checked"]')).toBeTruthy();
  });

  it("refuses the green box for a file no engine looked at", async () => {
    const unchecked = file("src/never-seen.js", [], ["gitleaks", "semgrep"]);
    expect(isUncheckedClean(unchecked)).toBe(true);
    await show(createElement(InfoPanel), city([unchecked]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: unchecked.id }));
    const shown = text();
    expect(shown).toContain(t("de", "panel.statusUnchecked"));
    expect(shown).not.toMatch(/\bsafe\b/i);
    expect(shown).not.toContain(t("de", "panel.noFindingsInFile"));
    expect(shown).toContain(t("de", "panel.noFindingsUnchecked", { n: 2 }));
    // the same naming the hover and the heat tile use for the same file
    expect(shown).toContain("gitleaks");
    expect(shown).toContain("semgrep");
    expect(container.querySelector('[data-file-verdict="unchecked"]')).toBeTruthy();
  });

  it("counts one missing scanner in the singular", async () => {
    const one = file("src/one.js", [], ["semgrep"]);
    await show(createElement(InfoPanel), city([one]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: one.id }));
    expect(text()).toContain(t("de", "panel.noFindingsUncheckedOne", { n: 1 }));
  });

  it("keeps the finding list, not the verdict, for a file that has findings", async () => {
    const hit = file("src/config.js", [finding()]);
    expect(isUncheckedClean(hit)).toBe(false);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    expect(text()).not.toContain(t("de", "panel.noFindingsUnchecked", { n: 2 }));
    expect(text()).toContain(t("de", "panel.findingsCountOne", { count: 1 }));
  });
});

describe("die Kopfzeile qualifizierte ihr „Keine Funde“ nicht", () => {
  it("names the engine that did not run when the count is zero", async () => {
    await show(
      createElement(HudOverlay, { apiStatus: "live" as const }),
      city([file("src/a.js", [])], false),
    );
    const badge = container.querySelector("[data-city-verdict]");
    expect(badge, "the header shows no verdict at all").toBeTruthy();
    expect(badge!.getAttribute("data-city-verdict")).toBe("shallow");
    expect(badge!.textContent).toBe(t("de", "hud.noFindingsQual", { missing: "gitleaks" }));
  });

  it("says plain no findings when every engine ran", async () => {
    await show(
      createElement(HudOverlay, { apiStatus: "live" as const }),
      city([file("src/a.js", [])]),
    );
    const badge = container.querySelector("[data-city-verdict]");
    expect(badge!.getAttribute("data-city-verdict")).toBe("clear");
    expect(badge!.textContent).toBe(t("de", "hud.noFindings"));
  });

  it("reads the severity count in the singular it means", async () => {
    const hit = file("src/config.js", [finding()]);
    await show(createElement(HudOverlay, { apiStatus: "live" as const }), city([hit]));
    const chip = container.querySelector(".workspace-severities button");
    expect(chip!.getAttribute("aria-label")).toBe(
      t("de", "hud.sevAriaOffOne", { label: t("de", "hud.sevCritical"), count: 1 }),
    );
    expect(chip!.getAttribute("aria-label")).not.toContain("1 Funde");
  });
});

describe("der Fundtext bekommt seine deutsche Zeile, ohne ihn zu überschreiben", () => {
  it("keeps the scanner's English sentence and adds the curated German one", async () => {
    await show(createElement(InfoPanel), city([file("src/config.js", [finding()])]));
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    const line = container.querySelector("[data-finding-block]");
    expect(line, "no finding block in the panel").toBeTruthy();
    expect(line!.textContent).toContain("Hardcoded secret detected (generic-api-key) — gitleaks");
    const de = line!.querySelector("[data-finding-de]");
    expect(de, "no German line under the English original").toBeTruthy();
    expect(de!.textContent!.trim()).toBe(t("de", "cat.secretsMeaning"));
    expect(de!.getAttribute("lang")).toBe("de");
    // the English original stays the scanner's own words, untouched
    expect(line!.querySelector("[data-finding-orig]")!.textContent!.trim()).toBe(
      "Hardcoded secret detected (generic-api-key) — gitleaks",
    );
  });

  it("prefers the backend's own German once LOKAL ships it", async () => {
    const withDe = file("src/config.js", [
      finding({ messageDe: "Hartkodierte Zugangsdaten in Zeile 2" } as Partial<CityFinding>),
    ]);
    await show(createElement(InfoPanel), city([withDe]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: withDe.id }));
    expect(container.querySelector("[data-finding-de]")!.textContent).toContain(
      "Hartkodierte Zugangsdaten in Zeile 2",
    );
  });

  it("stays quiet instead of guessing when the payload says nothing German", async () => {
    const noCategory = file("src/config.js", [finding({ category: undefined })]);
    await show(createElement(InfoPanel), city([noCategory]));
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    expect(container.querySelector("[data-finding-de]")).toBeNull();
    expect(container.querySelector("[data-finding-orig]")!.textContent).toContain(
      "Hardcoded secret detected",
    );
  });

  it("carries the same pair in the findings list", async () => {
    await show(createElement(FindingsPanel), city([file("src/config.js", [finding()])]));
    await act(async () => useStore.getState().setShowFindings(true));
    const pair = container.querySelector("[data-finding-de]");
    expect(pair, "the findings list shows the English line alone").toBeTruthy();
    expect(pair!.textContent!.trim()).toBe(t("de", "cat.secretsMeaning"));
  });
});

describe("ein Urteil, das der Speicher nicht annimmt, sagt es", () => {
  /**
   * `verdictsBlocked` was set by the store since the swallowed `catch {}` was
   * closed (staat-verdictsAndSwitch.test.ts) and read by nothing but its own
   * test — the warning line this file's own header orders at Lane STADT-UI. A
   * full day of triage could still die with the tab and look saved.
   */
  it("answers the refused verdict where the verdict was clicked", async () => {
    const hit = file("src/config.js", [finding()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    expect(container.querySelector("[data-verdicts-blocked]")).toBeNull();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    const mark = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === t("de", "panel.reviewReviewed"),
    );
    expect(mark, "no review segment in the panel").toBeTruthy();
    await act(async () => mark!.click());
    setItem.mockRestore();

    const note = container.querySelector("[data-verdicts-blocked]");
    expect(note, "the verdict was refused and the panel says nothing").toBeTruthy();
    expect(note!.getAttribute("role")).toBe("alert");
    expect(text()).toContain(t("de", "panel.verdictsBlocked"));
    // the verdict itself is not lost yet — it still counts in this session
    expect(useStore.getState().reviews).not.toEqual({});
  });

  it("walks away when the storage takes the write again", async () => {
    const hit = file("src/config.js", [finding()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    await act(async () => useStore.getState().setReview("fp:1", "to-fix"));
    setItem.mockRestore();
    expect(container.querySelector("[data-verdicts-blocked]")).toBeTruthy();
    await act(async () => useStore.getState().setReview("fp:1", "reviewed"));
    expect(container.querySelector("[data-verdicts-blocked]")).toBeNull();
  });

  it("says it in the language the panel speaks", async () => {
    const hit = file("src/config.js", [finding()]);
    await show(createElement(InfoPanel), city([hit]), "en");
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    await act(async () => useStore.getState().setReview("fp:1", "to-fix"));
    setItem.mockRestore();
    expect(text()).toContain(t("en", "panel.verdictsBlocked"));
    expect(text()).not.toContain("Urteile");
  });
});

describe("der Editor-Weg nennt sein Ziel und bleibt korrigierbar", () => {
  it("prints the absolute path the deep link will ask for", async () => {
    localStorage.setItem("codecity.workspaceRoot:local/probe", "/Users/dev/probe");
    const hit = file("src/config.js", [finding()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const path = container.querySelector(".ide-path");
    expect(path, "the panel opens the editor without naming the path").toBeTruthy();
    expect(path!.textContent).toBe("/Users/dev/probe/src/config.js");
    const open = [...container.querySelectorAll("button")].find((b) =>
      /IN VS CODE ÖFFNEN/.test(b.textContent ?? ""),
    );
    expect(open!.getAttribute("aria-label")).toContain("/Users/dev/probe/src/config.js");
    // A root saved once used to be permanent; the setup form has to come back.
    const edit = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Absoluter Pfad zum Arbeitsverzeichnis"]',
    );
    expect(edit, "no way to correct the workspace root").toBeTruthy();
    await act(async () => edit!.click());
    expect(
      container.querySelector('input[aria-label="Absoluter Pfad zum Arbeitsverzeichnis"]'),
    ).toBeTruthy();
  });

  it("stays out of the panel for a city that was never on this disk", async () => {
    const hit = file("src/config.js", [finding()]);
    const demo = city([hit]);
    demo.repo = { ...demo.repo, owner: "codecity" };
    await show(createElement(InfoPanel), demo);
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    expect(container.querySelector(".ide-path")).toBeNull();
  });
});

describe("Schweregrade tragen nicht nur ihre Farbe", () => {
  it("switches the panel chips with the colour-blind preference", async () => {
    const hit = file("src/config.js", [finding()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const readColor = () =>
      window.getComputedStyle(container.querySelector(".severity-chip")!).color;
    const plain = readColor();
    await act(async () => useStore.getState().setPref("colorblind", true));
    expect(readColor(), "the colour-blind switch does not reach the panel chip").not.toBe(plain);
  });

  it("names the severity in words next to the colour", async () => {
    const hit = file("src/config.js", [finding()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const chip = container.querySelector(".severity-chip");
    expect(chip!.textContent).toContain(t("de", "hud.sevCritical"));
    expect(chip!.getAttribute("aria-hidden")).toBeNull();
  });

  /**
   * The churn band has had a colour-blind variant in the palette since
   * `churnColor`, and the far heat grid uses it. The chip beside the severity
   * hardwired the three steps instead, so one surface switched and its
   * neighbour did not.
   */
  it("switches the churn band like the heat tile it belongs to", async () => {
    const hot = { ...file("src/hot.js", []), churnScore: 0.8, commitCount: 40 };
    await show(createElement(InfoPanel), city([hot]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hot.id }));
    const read = (): string => {
      const chip = [...container.querySelectorAll("span")].find((s) =>
        (s.textContent ?? "").startsWith("CHURN"),
      );
      return chip ? window.getComputedStyle(chip as HTMLElement).color : "";
    };
    const plain = read();
    expect(plain, "no churn chip on the panel").not.toBe("");
    await act(async () => useStore.getState().setPref("colorblind", true));
    expect(read(), "the churn chip ignores the colour-blind switch").not.toBe(plain);
  });
});
