// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { configPayload } from "../src/config/scanProfiles";
import { useStore } from "../src/stores/useStore";
import { loadSavedPacks, savePacks } from "../src/config/rulePacks";
import type { RulePackInfo } from "../src/config/rulePacks";

/**
 * #41 — the payload contract for rule packs.
 *
 * The scan takes ids, never paths, and "no pack" has to stay invisible in the
 * body: sending an empty array would read as a filter that selects nothing.
 */

const pack = (id: string): RulePackInfo => ({
  id,
  name: id,
  version: "1",
  origin: "shipped",
  source: "test",
  license: "BSL-1.1",
  categories: ["injection"],
  languages: ["python"],
  ruleCount: 1,
  default: false,
});

describe("configPayload mit Regel-Pack", () => {
  it("schickt die Auswahl als ids", () => {
    expect(configPayload("deep", [], ["ephemora-core"])).toEqual({
      profile: "deep",
      rulePacks: ["ephemora-core"],
    });
  });

  it("lässt das Feld weg, wenn kein Pack gewählt ist — Registry wie bisher", () => {
    expect(configPayload("standard")).toEqual({ profile: "standard" });
    expect(configPayload("standard", [], [])).not.toHaveProperty("rulePacks");
  });

  it("custom fällt auf standard zurück, auch mit Pack", () => {
    expect(configPayload("custom", [], ["ephemora-core"])).toEqual({
      profile: "standard",
      rulePacks: ["ephemora-core"],
    });
  });
});

describe("die Pack-Auswahl im Store", () => {
  afterEach(() => useStore.setState(useStore.getInitialState(), true));

  it("mehrfachauswahl, und Abwahl nimmt sie wieder raus", () => {
    useStore.setState({ availablePacks: [pack("a"), pack("b")], scanPacks: [] });
    useStore.getState().toggleScanPack("a");
    useStore.getState().toggleScanPack("b");
    expect(useStore.getState().scanPacks).toEqual(["a", "b"]);
    expect(loadSavedPacks()).toEqual(["a", "b"]);
    useStore.getState().toggleScanPack("a");
    expect(useStore.getState().scanPacks).toEqual(["b"]);
  });

  it("wirft ein gemerktes Pack weg, das es nicht mehr gibt", () => {
    savePacks(["a", "verschwunden"]);
    useStore.setState({ scanPacks: loadSavedPacks() });
    useStore.getState().setAvailablePacks([pack("a")]);
    expect(useStore.getState().scanPacks).toEqual(["a"]);
    // und merkt die Korrektur, damit der nächste Start nicht erneut lügt
    expect(loadSavedPacks()).toEqual(["a"]);
  });
});
