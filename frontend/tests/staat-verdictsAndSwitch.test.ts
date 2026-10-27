// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { loadReviews, saveReviews } from "../src/reviews";
import { loadPrefs } from "../src/prefs";
import type { CityData } from "../src/city/types";

/**
 * Two switches that were built but never connected.
 *
 * `prefs.updateCheck` was read by the landing page (`Landing.tsx:177`) and set
 * by nothing — the only `setPref` call in the project set `lang`. And a
 * `localStorage` that refuses the write swallowed the failure whole:
 * `saveReviews` caught it and said nothing, so a full day of triage could die
 * with the tab while the screen still looked saved. Both are state sides here;
 * the menu row and the warning line are ordered at Lane STADT-UI.
 */

const city = {
  repo: { owner: "local", name: "mein-repo", branch: "main" },
  analysisId: "scan-9",
  tree: { name: "mein-repo", children: [], detailFiles: [], districtFiles: [] },
} as unknown as CityData;

function openCity(): void {
  useStore.setState(
    { ...useStore.getInitialState(), cityData: city, analysisId: "scan-9", reviews: {} },
    true,
  );
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState() }, true);
});

describe("the update check has a state side", () => {
  it("flips the switch and the switch is what the page reloads read", () => {
    // on arrival — since 2026-10-27 the entry screen asks on its own, so the
    // switch's first move is a decline, and the second gives the choice back.
    expect(useStore.getState().prefs.updateCheck).toBe(true);
    expect(useStore.getState().toggleUpdateCheck()).toBe(false);
    expect(useStore.getState().prefs.updateCheck).toBe(false);
    // the landing page's gate reads the STORE, so the fetch is off from now on
    expect(JSON.parse(localStorage.getItem("codecity-prefs") ?? "{}")).toEqual({
      lang: "en",
      gfxLite: false,
      colorblind: false,
      updateCheck: false,
    });
    expect(loadPrefs().updateCheck).toBe(false);
    expect(useStore.getState().toggleUpdateCheck()).toBe(true);
    expect(loadPrefs().updateCheck).toBe(true);
  });

  it("keeps every other preference intact while switching", () => {
    useStore.getState().setPref("lang", "de");
    useStore.getState().setPref("gfxLite", true);
    useStore.getState().toggleUpdateCheck();
    const after = loadPrefs();
    expect([after.lang, after.gfxLite, after.colorblind]).toEqual(["de", true, false]);
  });
});

describe("a verdict that cannot be written says so", () => {
  it("writes into storage while storage takes it", () => {
    openCity();
    expect(useStore.getState().verdictsBlocked).toBe(false);
    useStore.getState().setReview("fp:abc123", "reviewed");
    expect(useStore.getState().verdictsBlocked).toBe(false);
    // the bucket is keyed by the project, not by the scan — the same verdict
    // a re-scan of this folder reads back
    const full = Object.keys(localStorage).find((k) => k.startsWith("codecity-reviews:p-"));
    expect(full).toBeTruthy();
    // loadReviews takes the bucket name and adds the prefix itself
    expect(loadReviews(full!.replace("codecity-reviews:", ""))).toEqual({
      "fp:abc123": "reviewed",
    });
  });

  it("reports the run a full storage swallows, and keeps the session verdict", () => {
    openCity();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    useStore.getState().setReview("fp:abc123", "to-fix");
    expect(useStore.getState().verdictsBlocked).toBe(true);
    // the verdict is not lost yet — it lives in this session and still counts
    expect(useStore.getState().reviews["fp:abc123"]).toBe("to-fix");
    setItem.mockRestore();
  });

  it("clears the report when the storage takes the write again", () => {
    openCity();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    useStore.getState().setReview("fp:abc123", "reviewed");
    setItem.mockRestore();
    useStore.getState().setReview("fp:abc123", "false-positive");
    expect(useStore.getState().verdictsBlocked).toBe(false);
  });

  it("starts a new city unburdened by the last one's storage trouble", () => {
    openCity();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    useStore.getState().setReview("fp:abc123", "reviewed");
    setItem.mockRestore();
    expect(useStore.getState().verdictsBlocked).toBe(true);
    useStore.getState().setCityData(city);
    expect(useStore.getState().verdictsBlocked).toBe(false);
  });

  it("answers false for a write that never had a bucket to go to", () => {
    expect(saveReviews("", { "fp:a": "reviewed" })).toBe(false);
  });
});
