// @vitest-environment jsdom
// Three surfaces that were built and never connected, plus the one refusal the
// landing owed its camera keys:
// — `toggleUpdateCheck` sat in the store with one reader (`Landing.tsx:563`) and
//   no row anywhere: declining the version note meant leaving the city;
// — `ShareHint` was mounted nowhere, so the share feature's own nudge never ran
//   outside its test file;
// — on the landing the camera keys moved the picture in silence (measured: 26,
//   20, 137, 134 and 40 of 1000 screen cells against an idle spread of ≤ 4).
import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { explain, type Press, type World } from "../src/interaction/shortcuts";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import { t, type DictKey } from "../src/i18n";
import type { CityData } from "../src/city/types";

const REPO = path.resolve(import.meta.dirname, "../..");
const src = (rel: string): string => readFileSync(path.join(REPO, "frontend/src", rel), "utf-8");

const WORLD: World = {
  hasCity: true,
  focusPath: [],
  buildings: 12,
  blocks: 0,
  selectedFileId: null,
  markedDistrict: null,
  cameraMode: "free",
  triageActive: false,
  triageSize: 4,
  triageOpen: 2,
  tourActive: false,
  constructing: false,
  primerVisible: false,
  hasSearchField: false,
};

const press = (key: string): Press => ({
  key,
  code: key,
  meta: false,
  ctrl: false,
  typing: false,
  modalOpen: false,
  onCanvas: true,
});

describe("the camera keys answer on the landing", () => {
  /** Every keyboard camera key the registry lists. */
  const CAMERA = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d", "q", "e"];

  it("names what moved when there is no city to fly through", () => {
    for (const key of CAMERA) {
      const text = explain(press(key), { ...WORLD, hasCity: false });
      expect(text, `${key} still silent on the landing`).not.toBeNull();
      expect(text!.de).toContain("Land vor der ersten Stadt");
      expect(text!.en).toContain("in front of the first city");
    }
  });

  it("stays out of the way where the keys do their real job", () => {
    for (const key of CAMERA) {
      expect(explain(press(key), WORLD), `${key} explained while a city is open`).toBeNull();
    }
  });

  it("takes the set from the registry, not from a list typed beside it", () => {
    // A camera key added to ROWS must answer on the landing without anyone
    // remembering to extend a second list.
    const rows = src("interaction/shortcuts.ts");
    const derived = rows.indexOf("const CAMERA_KEYS = new Set(");
    expect(derived).toBeGreaterThan(-1);
    expect(rows.slice(derived, derived + 260)).toContain('r.group === "camera"');
  });
});

describe("der Versionshinweis hat seinen Schalter im Menü", () => {
  const city = (): CityData =>
    ({
      repo: { owner: "local", name: "probe", branch: "main" },
      analysisId: "scan-1",
      languages: { TypeScript: 30 },
      totalFiles: 1,
      renderedFiles: 1,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      fileConnections: [],
      dirConnections: [],
      meta: {},
      tree: { name: "probe", path: "", children: [], detailFiles: [], districtFiles: [] },
    }) as unknown as CityData;

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    useStore.setState(
      {
        ...useStore.getInitialState(),
        prefs: { ...useStore.getInitialState().prefs, lang: "de", updateCheck: true },
        cityData: city(),
        buildPhase: "built",
        analysisId: "scan-1",
      },
      true,
    );
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
    useStore.setState(useStore.getInitialState(), true);
    vi.unstubAllGlobals();
  });

  const openMenu = async (): Promise<void> => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(ActionBar)));
    const more = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Mehr"),
    );
    expect(more, "the dock has no overflow menu").toBeTruthy();
    await act(async () => more!.click());
  };

  it("flips the stored switch and says which way", async () => {
    await openMenu();
    const row = [...container.querySelectorAll("button")].find(
      (b) =>
        b.getAttribute("role") === "menuitemcheckbox" &&
        (b.textContent ?? "").includes(t("de", "actions.updateCheck" as DictKey)),
    );
    expect(row, "no version-note row in the menu").toBeTruthy();
    expect(row!.getAttribute("aria-checked")).toBe("true");
    await act(async () => row!.click());
    expect(useStore.getState().prefs.updateCheck).toBe(false);
    expect(t("de", "actions.updateCheckOff" as DictKey)).toContain("die Landung");
  });

  it("is read by the landing it controls", () => {
    expect(src("components/Landing.tsx")).toContain("if (!prefs.updateCheck) return;");
    expect(src("stores/useStore.ts")).toContain('setPref("updateCheck", next)');
  });
});

describe("der Share-Hinweis ist montiert", () => {
  it("steht in der Stadt, nicht nur in seinem Test", () => {
    const app = src("App.tsx");
    expect(app).toContain('from "./share/ShareHint"');
    expect(app).toContain("<ShareHint");
  });

  it("behält seine eigene Grenze: einmal pro Stadt, und ein Nein gilt für immer", () => {
    const hint = src("share/ShareHint.tsx");
    expect(hint).toContain("ephemora-share-hint");
    expect(hint).toContain("muted");
  });
});
