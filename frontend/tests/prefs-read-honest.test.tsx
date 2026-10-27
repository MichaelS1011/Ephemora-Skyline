// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPrefs, loadPrefsRead, preservedUnreadablePrefs, savePrefs } from "../src/prefs";
import { PrefsNote } from "../src/components/PrefsNote";
import { useStore } from "../src/stores/useStore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { t } from "../src/i18n";

/**
 * The stored-preference reader asks this machine a question about a file it
 * keeps. When those bytes are broken — truncated write, another process, a
 * disk that half-took the last save — the old answer was the defaults, and
 * the defaults are also the answer for a browser that never chose anything.
 * "Your settings could not be read" rendered identical to "you never had
 * settings": the reader who switched on the colour-blind-safe alarms woke up
 * without them, without a word, and the next toggle of ANY preference
 * overwrote the unreadable blob — the bytes they might still recover were
 * gone, silenced by a click on something else entirely.
 *
 * Same class the verdicts and rule-pack rounds closed tonight: a failed read
 * is not an answer about the disk, and the app must not rewrite bytes it
 * never proved it could read.
 */

const KEY = "codecity-prefs";
const PRESERVED = "codecity-prefs:unreadable";

const CORRUPT = '{"lang":"de","colorblind":tru';

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the corrupt blob is not destroyed on sight", () => {
  it("a corrupt read preserves the exact bytes under the quarantine key", () => {
    localStorage.setItem(KEY, CORRUPT);
    loadPrefs();
    expect(
      localStorage.getItem(PRESERVED),
      "unreadable prefs bytes must survive the read that found them unreadable",
    ).toBe(CORRUPT);
  });

  it("a later savePrefs overwrites the live key but never the preserved bytes", () => {
    localStorage.setItem(KEY, CORRUPT);
    loadPrefs();
    savePrefs({ lang: "en", gfxLite: false, colorblind: false, updateCheck: false });
    expect(localStorage.getItem(PRESERVED), "the click that follows must not eat the file").toBe(
      CORRUPT,
    );
  });

  it("a wrong-shape but valid JSON blob is corrupt too, not a silent read", () => {
    const garbage = "[1,2,3]";
    localStorage.setItem(KEY, garbage);
    loadPrefs();
    expect(localStorage.getItem(PRESERVED)).toBe(garbage);
  });
});

describe("what must NOT move", () => {
  it("empty storage still reads as first run: defaults, and no quarantined bytes", () => {
    const fresh = loadPrefs();
    expect(fresh).toEqual({ lang: "en", gfxLite: false, colorblind: false, updateCheck: true });
    expect(localStorage.getItem(PRESERVED)).toBeNull();
  });

  it("well-formed prefs are still prefs", () => {
    savePrefs({ lang: "de", gfxLite: true, colorblind: true, updateCheck: true });
    expect(loadPrefs()).toEqual({ lang: "de", gfxLite: true, colorblind: true, updateCheck: true });
    expect(localStorage.getItem(PRESERVED), "a good read quarantines nothing").toBeNull();
  });

  it("the reader says the three states apart: read, absent, unreadable", () => {
    expect(loadPrefsRead()).toEqual({ state: "absent" });
    savePrefs({ lang: "de", gfxLite: false, colorblind: false, updateCheck: false });
    expect(loadPrefsRead().state).toBe("read");
    localStorage.setItem(KEY, CORRUPT);
    expect(loadPrefsRead()).toEqual({ state: "unreadable" });
    localStorage.clear();
    localStorage.setItem(KEY, "{}");
    expect(
      loadPrefsRead().state,
      "an object missing keys is a pre-decision file, not a corrupt one",
    ).toBe("read");
  });

  it("the quarantine slot is written once and never traded for newer junk", () => {
    localStorage.setItem(KEY, CORRUPT);
    loadPrefs();
    localStorage.setItem(KEY, "second corruption");
    loadPrefs();
    expect(
      preservedUnreadablePrefs(),
      "first-wins: preserved bytes are not the app's to replace",
    ).toBe(CORRUPT);
  });
});

describe("corrupt storage does not render as first run", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  async function paintNote(): Promise<void> {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(PrefsNote));
    });
  }

  afterEach(async () => {
    const r = root;
    if (r) await act(async () => r.unmount());
    host?.remove();
    root = null;
    useStore.setState(useStore.getInitialState(), true);
  });

  it("an unreadable blob puts the sentence on screen, as an alert, glyph and words — not colour alone", async () => {
    localStorage.setItem(KEY, CORRUPT);
    await paintNote();
    const note = host.querySelector("[data-prefs-unreadable]");
    expect(
      note,
      "corrupt prefs render identical to first run — the failure is invisible",
    ).not.toBeNull();
    expect(note?.getAttribute("role")).toBe("alert");
    const text = host.textContent ?? "";
    expect(text).toContain(t("en", "app.prefsUnreadable"));
    expect(text).toContain("⚠");
  });

  it("the German sentence is the same fact in German", async () => {
    useStore.setState({ prefs: { ...useStore.getInitialState().prefs, lang: "de" } });
    localStorage.setItem(KEY, CORRUPT);
    await paintNote();
    const text = host.textContent ?? "";
    expect(text).toContain(t("de", "app.prefsUnreadable"));
    expect(text).not.toContain(t("en", "app.prefsUnreadable"));
  });

  it("genuinely empty storage says nothing: no false alarm on first run", async () => {
    await paintNote();
    expect(host.querySelector("[data-prefs-unreadable]")).toBeNull();
    expect(host.textContent).toBe("");
  });

  it("well-formed storage says nothing either", async () => {
    savePrefs({ lang: "de", gfxLite: false, colorblind: true, updateCheck: false });
    await paintNote();
    expect(host.querySelector("[data-prefs-unreadable]")).toBeNull();
  });

  it("the note is mounted by App, not orphaned beside it", () => {
    const src = readFileSync(resolve(import.meta.dirname, "../src/App.tsx"), "utf8");
    expect(src).toContain("<PrefsNote />");
  });
});
