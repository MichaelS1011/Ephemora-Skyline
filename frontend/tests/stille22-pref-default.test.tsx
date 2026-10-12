// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPrefs, savePrefs } from "../src/prefs";
import { useStore } from "../src/stores/useStore";
import { Landing } from "../src/components/Landing";

/**
 * "Your source code stays on this machine. No account needed." sits on the very
 * first screen, and the first thing a reader does to check it is open the
 * network panel. One passive release lookup ran there before any click — the
 * backend asked `api.github.com` on behalf of a page nobody had touched yet.
 *
 * An anonymous request for a release tag gives away no source. It does decide
 * whether the rest of the sentence is believed, so the preference it is gated by
 * starts off. The switch itself stays where it is (the More menu of a city), and
 * a reader who turned it on keeps it turned on.
 */

const KEY = "codecity-prefs";

let host: HTMLDivElement;
let root: Root;
let calls: string[];

function stubFetch(body: unknown = {}): void {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response;
    }),
  );
}

async function mountLanding(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Landing />);
  });
  // let the effects' promise chains settle
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState() }, true);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("the entry screen is silent before the first click", () => {
  it("asks for a new version by default: no", () => {
    const fresh = loadPrefs();
    expect(fresh.updateCheck).toBe(false);
    // the store the landing's gate reads is the same object
    expect(useStore.getInitialState().prefs.updateCheck).toBe(false);
  });

  it("does not ask just because an older build saved the file", () => {
    // Preferences saved before this decision carry no `updateCheck` key at all.
    // A default that reads "anything but an explicit false" would turn the
    // lookup back on for every reader who already has a saved file.
    localStorage.setItem(KEY, JSON.stringify({ lang: "de", gfxLite: false, colorblind: false }));
    expect(loadPrefs().updateCheck).toBe(false);
  });

  it("keeps asking for the reader who switched it on", () => {
    expect(savePrefs({ lang: "en", gfxLite: false, colorblind: false, updateCheck: true })).toBe(
      undefined,
    );
    expect(loadPrefs().updateCheck).toBe(true);
  });

  it("mounts the entry screen without naming the release feed", async () => {
    stubFetch();
    await mountLanding();
    const updateCalls = calls.filter((c) => c.includes("/api/update/check"));
    expect(updateCalls).toEqual([]);
    // …and is still the same screen: the copy footprint it shows is read
    expect(calls.some((c) => c.includes("/api/footprint"))).toBe(true);
  });

  it("asks once per mount for the reader who switched it on", async () => {
    stubFetch();
    useStore.setState({
      ...useStore.getInitialState(),
      prefs: { ...loadPrefs(), updateCheck: true },
    });
    await mountLanding();
    expect(calls.filter((c) => c.includes("/api/update/check")).length).toBe(1);
  });

  it("shows no version note on a fresh screen", async () => {
    stubFetch({ updateAvailable: true, latest: "v9.9.9", releaseUrl: null });
    await mountLanding();
    const text = (host.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toMatch(/Version\s+\S+\s+(is available|ist verfügbar)/);
    expect(host.querySelector(".landing-update-banner")).toBeNull();
  });
});
