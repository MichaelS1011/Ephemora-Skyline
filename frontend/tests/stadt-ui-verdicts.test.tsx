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
import { findingKey } from "../src/reviews";
import { useStore } from "../src/stores/useStore";
import { city as cityOf, dir, file as fileOf, finding, provenance } from "./helpers/cityFixture";
import type { CityData, CityFile, CityFinding } from "../src/city/types";

/**
 * Every payload here is built through `helpers/cityFixture`, so a field the
 * domain gains is known to one place instead of being quietly missing from a
 * private copy. The two things this file declares itself: the scanner's own
 * English sentence (which its assertions quote) and the JavaScript file the
 * panel opens.
 */

/** A file the way the local scan maps one: JavaScript, three lines, one folder. */
function file(path: string, findings: CityFinding[] = [], unverifiedBy?: string[]): CityFile {
  return fileOf(path, "JavaScript", findings, unverifiedBy, { linesOfCode: 3 });
}

/** The gitleaks hit the real scan of repo-deep reports. */
function secret(over: Partial<CityFinding> = {}): CityFinding {
  return finding({
    type: "HARDCODED_SECRET",
    severity: "P0",
    line: 2,
    message: "Hardcoded secret detected (generic-api-key) — gitleaks",
    provenance: "gitleaks",
    ruleId: "generic-api-key",
    category: "secrets",
    ...over,
  });
}

/**
 * `allEngines` builds the two cities the header has to tell apart: one whose
 * security engines all ran, one where gitleaks was switched off — same zero
 * findings, a different statement. The severity counts, the languages and the
 * file totals follow from the buildings, the way the mapper adds them up.
 */
function city(detailFiles: CityFile[], allEngines = true): CityData {
  return cityOf({
    analysisId: "scan-1",
    languages: { JavaScript: 100 },
    unverifiedEngines: allEngines ? [] : ["gitleaks"],
    scanProvenance: provenance({ gitleaks: allEngines }),
    tree: dir({ path: "", detailFiles }),
  });
}

/**
 * `messageDe` is not on `CityFinding` yet: the panel reads it as its own German
 * line as soon as Lane LOKAL ships it (`InfoPanel.tsx`), and a field the type
 * does not declare cannot go through a typed builder. The case below therefore
 * stays hand-built — the declared fields still come from the builder, the one
 * pending field is named here.
 */
type FindingWithGerman = CityFinding & { messageDe?: string };

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
  it("puts the finding before the handover, with its line one click away", async () => {
    const hit = file("src/auth.js", [secret()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const body = text();
    expect(body.indexOf("1 Fund")).toBeGreaterThan(-1);
    expect(body.indexOf("1 Fund")).toBeLessThan(body.indexOf("SARIF-Export"));
    const lineButton = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("title") === "Zeile 2 öffnen",
    );
    expect(lineButton, "the finding's line has no open button").toBeTruthy();
    await act(async () => (lineButton as HTMLButtonElement).click());
  });

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
    const hit = file("src/config.js", [secret()]);
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
    const hit = file("src/config.js", [secret()]);
    await show(createElement(HudOverlay, { apiStatus: "live" as const }), city([hit]));
    const chip = container.querySelector(".workspace-severities button");
    expect(chip!.getAttribute("aria-label")).toBe(
      t("de", "hud.sevAriaOffOne", { label: t("de", "hud.sevCritical"), count: 1 }),
    );
    expect(chip!.getAttribute("aria-label")).not.toContain("1 Funde");
  });

  it("sagt an der Demo-Stadt dauerhaft, dass die Funde Beispiele sind", async () => {
    await show(
      createElement(HudOverlay, { apiStatus: "demo" as const }),
      city([file("src/a.js", [])]),
    );
    const mark = container.querySelector("[data-testid='demo-synth-mark']");
    expect(mark, "the demo city carries no permanent syntheticity label").toBeTruthy();
    expect(mark!.textContent).toBe(t("de", "hud.demoSynth"));
  });

  it("trägt die Beispiel-Kennzeichnung nur in der Demo, nicht beim eigenen Scan", async () => {
    await show(
      createElement(HudOverlay, { apiStatus: "live" as const }),
      city([file("src/a.js", [])]),
    );
    expect(container.querySelector("[data-testid='demo-synth-mark']")).toBeNull();
  });
});

describe("der Fundtext bekommt seine deutsche Zeile, ohne ihn zu überschreiben", () => {
  it("keeps the scanner's English sentence and adds the curated German one", async () => {
    await show(createElement(InfoPanel), city([file("src/config.js", [secret()])]));
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
    // hand-built on purpose: `messageDe` is a field the type does not declare
    // yet, so no typed builder may write it — see `FindingWithGerman` above
    const german: FindingWithGerman = {
      ...secret(),
      messageDe: "Hartkodierte Zugangsdaten in Zeile 2",
    };
    const withDe = file("src/config.js", [german]);
    await show(createElement(InfoPanel), city([withDe]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: withDe.id }));
    expect(container.querySelector("[data-finding-de]")!.textContent).toContain(
      "Hartkodierte Zugangsdaten in Zeile 2",
    );
  });

  it("stays quiet instead of guessing when the payload says nothing German", async () => {
    const noCategory = file("src/config.js", [secret({ category: undefined })]);
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
    await show(createElement(FindingsPanel), city([file("src/config.js", [secret()])]));
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
    const hit = file("src/config.js", [secret()]);
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
    const hit = file("src/config.js", [secret()]);
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
    const hit = file("src/config.js", [secret()]);
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
    const hit = file("src/config.js", [secret()]);
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
    const hit = file("src/config.js", [secret()]);
    const demo = city([hit]);
    demo.repo = { ...demo.repo, owner: "codecity" };
    await show(createElement(InfoPanel), demo);
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    expect(container.querySelector(".ide-path")).toBeNull();
  });
});

describe("Schweregrade tragen nicht nur ihre Farbe", () => {
  it("switches the panel chips with the colour-blind preference", async () => {
    const hit = file("src/config.js", [secret()]);
    await show(createElement(InfoPanel), city([hit]));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: hit.id }));
    const readColor = () =>
      window.getComputedStyle(container.querySelector(".severity-chip")!).color;
    const plain = readColor();
    await act(async () => useStore.getState().setPref("colorblind", true));
    expect(readColor(), "the colour-blind switch does not reach the panel chip").not.toBe(plain);
  });

  it("names the severity in words next to the colour", async () => {
    const hit = file("src/config.js", [secret()]);
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
    const hot = fileOf("src/hot.js", "JavaScript", [], undefined, {
      churnScore: 0.8,
      commitCount: 40,
      linesOfCode: 3,
    });
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

/**
 * V1: the FIRST verdict of a visit is the commitment the panel confirms — with
 * the promise the storage actually keeps, in the panel's own language, and only
 * when the write succeeded. A "Saved" next to the blocked-storage warning would
 * be a lie, so the confirmation never appears there.
 */
describe("der erste Verdict bekommt sein ehrliches Versprechen", () => {
  const hit = () => file("src/config.js", [secret(), secret({ line: 9 })]);
  const segmentButtons = () =>
    [...container.querySelectorAll("button")].filter(
      (b) => b.textContent?.trim() === t("de", "panel.reviewReviewed"),
    );
  const confirmation = () => container.querySelector("[data-first-verdict]");

  it("bestätigt genau die Zeile des ersten Urteils", async () => {
    await show(createElement(InfoPanel), city([hit()]));
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    expect(confirmation()).toBeNull();

    await act(async () => segmentButtons()[0]!.click());
    const one = container.querySelectorAll("[data-first-verdict]");
    expect(one.length).toBe(1);
    expect(one[0]!.textContent).toContain(t("de", "panel.firstVerdictSaved"));

    // the SECOND verdict elsewhere is not re-confirmed — the promise is for
    // the first commitment, not a nag on every click
    await act(async () => segmentButtons()[1]!.click());
    expect(container.querySelectorAll("[data-first-verdict]").length).toBe(1);
  });

  it("sagt es auf Englisch, wenn das Panel Englisch spricht", async () => {
    await show(createElement(InfoPanel), city([hit()]), "en");
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    const reviewed = [...container.querySelectorAll("button")].filter(
      (b) => b.textContent?.trim() === t("en", "panel.reviewReviewed"),
    );
    await act(async () => reviewed[0]!.click());
    expect(confirmation()!.textContent).toContain(t("en", "panel.firstVerdictSaved"));
    expect(confirmation()!.textContent).not.toContain("Urteil");
  });

  it("lügt nie neben der Blockade-Warnung: kein „Gespeichert“ bei vollem Speicher", async () => {
    await show(createElement(InfoPanel), city([hit()]));
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    await act(async () => segmentButtons()[0]!.click());
    setItem.mockRestore();
    expect(confirmation()).toBeNull();
    expect(container.querySelector("[data-verdicts-blocked]")).toBeTruthy();
    expect(text()).toContain(t("de", "panel.verdictsBlocked"));
  });

  it("kommt für den ersten Verdict des nächsten Besuchs zurück", async () => {
    await show(createElement(InfoPanel), city([hit()]));
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    await act(async () => segmentButtons()[0]!.click());
    expect(confirmation()).toBeTruthy();

    // teardown (Back to landing) spends the visit's confirmation
    await act(async () => useStore.getState().resetToLanding());
    expect(useStore.getState().firstVerdictKey).toBeNull();
    // the next visit reads the old verdict back from storage — the OLD verdict
    // is not re-confirmed (it is not a new commitment), but the first verdict
    // actually set in this visit gets its promise
    await act(async () => useStore.getState().setCityData(city([hit()])));
    await act(async () =>
      useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
    );
    expect(confirmation()).toBeNull();
    await act(async () => segmentButtons()[1]!.click());
    expect(confirmation()).toBeTruthy();
    expect(container.querySelectorAll("[data-first-verdict]").length).toBe(1);
  });

  /**
   * The demo city (`analysisId === "demo-001"`, the same flag the share result
   * uses) has no folder and saves nothing anywhere — the saved promise would be
   * a lie there, which is exactly what the Erstnutzerin saw. The demo gets its
   * own honest sentence, in the panel's language and without the saved-check.
   */
  it.each(["de", "en"] as const)(
    "sagt in der Demo-Stadt die Wahrheit (%s): nichts wird gespeichert",
    async (lang) => {
      await show(
        createElement(InfoPanel),
        cityOf({
          analysisId: "demo-001",
          repo: { owner: "codecity", name: "demo-city", branch: "main" },
          languages: { JavaScript: 100 },
          scanProvenance: provenance({ gitleaks: true }),
          tree: dir({ path: "", detailFiles: [hit()] }),
        }),
        lang,
      );
      await act(async () =>
        useStore.getState().setSelectedUnit({ kind: "file", id: "f-src/config.js" }),
      );
      expect(confirmation()).toBeNull();
      const label = t(lang, "panel.reviewReviewed");
      const reviewed = [...container.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === label,
      );
      await act(async () => reviewed!.click());
      const note = confirmation()!;
      expect(note).toBeTruthy();
      expect(note.textContent).toContain(t(lang, "panel.firstVerdictSavedDemo"));
      expect(note.textContent).not.toContain(t(lang, "panel.firstVerdictSaved"));
      // no saved-check on a sentence that says nothing was saved
      expect(note.textContent?.trim().startsWith("✓")).toBe(false);
    },
  );
});

/**
 * UX 6 — after the scan the dock's "Triage N findings" was the first thing a
 * reader learned, and the card of the first (heaviest) finding was a second
 * click. That card now opens with the honest scope: N findings across M files,
 * and that this is the first of them. The numbers come from the whole payload,
 * not from the one file's list, and only the queue's first position may claim
 * "first" — a later step says nothing about being first.
 */
describe("die Karte des ersten Funds nennt den ganzen Umfang (UX 6)", () => {
  const twoFiles = () => [file("src/a.js", [secret()]), file("src/b.js", [secret({ line: 4 })])];

  it("nennt Fundzahl, Dateizahl und „hier ist der erste“", async () => {
    const files = twoFiles();
    await show(createElement(InfoPanel), city(files));
    await act(async () => {
      useStore.setState({
        triageActive: true,
        triageCursor: 0,
        focusedFindingKey: findingKey(files[0]!.id, 0),
      });
      useStore.getState().setSelectedUnit({ kind: "file", id: files[0]!.id });
    });
    const line = container.querySelector("[data-first-finding]");
    expect(line, "the first finding's card says nothing about the scan").toBeTruthy();
    expect(line!.textContent).toContain("2 Funde in 2 Dateien");
    expect(line!.textContent).toContain("hier ist der erste");
  });

  it("beansprucht „erster“ nicht für einen späteren Schritt der Warteschlange", async () => {
    const files = twoFiles();
    await show(createElement(InfoPanel), city(files));
    await act(async () => {
      useStore.setState({
        triageActive: true,
        triageCursor: 1,
        focusedFindingKey: findingKey(files[1]!.id, 0),
      });
      useStore.getState().setSelectedUnit({ kind: "file", id: files[1]!.id });
    });
    expect(container.querySelector("[data-first-finding]")).toBeNull();
  });

  it("bleibt ohne laufende Triage aus", async () => {
    const files = twoFiles();
    await show(createElement(InfoPanel), city(files));
    await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: files[0]!.id }));
    expect(container.querySelector("[data-first-finding]")).toBeNull();
  });

  it("sagt es auch auf Englisch", async () => {
    const files = twoFiles();
    await show(createElement(InfoPanel), city(files), "en");
    await act(async () => {
      useStore.setState({
        triageActive: true,
        triageCursor: 0,
        focusedFindingKey: findingKey(files[0]!.id, 0),
      });
      useStore.getState().setSelectedUnit({ kind: "file", id: files[0]!.id });
    });
    const line = container.querySelector("[data-first-finding]");
    expect(line!.textContent).toContain("2 findings in 2 files");
    expect(line!.textContent).toContain("here is the first one");
  });
});
