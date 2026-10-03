// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileChips } from "../src/components/ProfileChips";
import { t as tDict } from "../src/i18n";
const tEn = (key: string, vars?: Record<string, string | number>) =>
  tDict("en", key as never, vars);
import { PROFILE_DURATION, SCAN_PROFILES } from "../src/config/scanProfiles";
import { useStore } from "../src/stores/useStore";
import type { ScanProfile } from "../src/config/scanProfiles";

/**
 * #50 — profile selection. Three measured complaints, three pinned answers:
 * (a) reading two profiles in a row (the modal blocked it), (b) no overlay in
 * the DOM at all, (c) exactly one source of time promises: PROFILE_DURATION,
 * measured by .qoder-scratch/profile-diff.mjs against the real backend.
 */

let container: HTMLDivElement;
let root: Root;

async function render(): Promise<string> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ProfileChips, { variant: "landing" })));
  return container.textContent ?? "";
}

async function clickByLabel(label: string): Promise<void> {
  const chip = [...container.querySelectorAll<HTMLButtonElement>(".profile-options button")].find(
    (b) => (b.textContent ?? "").includes(label),
  );
  if (!chip) throw new Error(`chip "${label}" not found`);
  await act(async () => chip.click());
}

async function text(): Promise<string> {
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), scanProfile: "standard" }, true);
});

afterEach(async () => {
  // the constants-only test never renders — nothing to unmount there
  if (root) await act(async () => root.unmount());
  if (container) container.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("scan profile picker (#50)", () => {
  it("promises exactly one duration per profile, from PROFILE_DURATION only", () => {
    const measured: Record<ScanProfile, string> = {
      // from .qoder-scratch/profile-diff.mjs, real HTTP route, this repo:
      // quick 1.7s, standard 4.7s, security-only 4.7s, quality-only 1.7s, deep 4.7s
      quick: "~2s",
      standard: "~5s",
      deep: "~5s",
      "security-only": "~5s",
      "quality-only": "~2s",
      custom: "~5s",
    };
    expect(PROFILE_DURATION).toEqual(measured);
    // summaries must not carry a competing number any more ("~10s" was #50c)
    for (const p of SCAN_PROFILES) {
      expect(p.summary, `summary of "${p.id}" still contains a time`).not.toMatch(
        /\d+\s*(s|sec|min)\b/i,
      );
    }
  });

  it("opens the detail as an inline card, never as a modal overlay", async () => {
    await render();
    await clickByLabel("Standard");
    expect(container.querySelectorAll('[role="dialog"]').length).toBe(0);
    expect(container.querySelectorAll('[aria-modal="true"]').length).toBe(0);
    expect(container.querySelectorAll('[role="presentation"]').length).toBe(0);
    expect(container.querySelector(".profile-detail")).not.toBeNull();
    const t = await text();
    expect(t).toContain("Standard scan");
    expect(t).toContain(`TIME: ${PROFILE_DURATION.standard}`);
  });

  it("lets you read Standard and then Deep without losing either", async () => {
    await render();
    await clickByLabel("Standard");
    const standardView = await text();
    expect(standardView).toContain("Deep AST rules");
    expect(standardView).toContain("Author map");
    await clickByLabel("Deep");
    const deepView = await text();
    // the card re-rendered for Deep…
    expect(deepView).toContain("Deep scan");
    expect(deepView).toContain("Git history secrets");
    // …while nothing was activated yet: the active chip is still Standard
    expect(useStore.getState().scanProfile).toBe("standard");
    const activeChip = [
      ...container.querySelectorAll<HTMLButtonElement>(".profile-options button"),
    ].find((b) => b.getAttribute("aria-pressed") === "true");
    expect(activeChip?.textContent).toContain("✓");
    expect(activeChip?.textContent).toContain("Standard");
    // confirming the card is what switches the profile
    const use = container.querySelector<HTMLButtonElement>(".profile-detail-use");
    await act(async () => use?.click());
    expect(useStore.getState().scanProfile).toBe("deep");
  });

  it("shows the time once per surface and both copies come from one constant", async () => {
    const html = await render();
    // description line for the active profile…
    // the sentence is localized; the number always comes from PROFILE_DURATION
    const line = tEn("profile.estimated", { time: PROFILE_DURATION.standard });
    expect(html.split(line).length - 1).toBe(1);
    expect(html).toContain(line);
  });

  it("keeps the category chips visible below the profile chips", async () => {
    await render();
    const t = await text();
    expect(t).toContain(tEn("profile.lookFor"));
    const groups = container.querySelectorAll(".profile-options");
    expect(groups.length).toBe(2);
    // category toggle behaviour is unchanged: last active category stays on
    await clickByLabel("Deep"); // opens the card — categories still rendered
    expect(container.querySelectorAll(".category-options button").length).toBeGreaterThan(0);
  });

  it("escapes closed instead of trapping focus", async () => {
    await render();
    await clickByLabel("Quick");
    expect(container.querySelector(".profile-detail")).not.toBeNull();
    const card = container.querySelector<HTMLElement>(".profile-detail")!;
    await act(async () => {
      card.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(container.querySelector(".profile-detail")).toBeNull();
    expect(useStore.getState().scanProfile).toBe("standard");
  });
});

/**
 * The picker is a decision surface, and a decision surface that stays English
 * while the user chose Deutsch (#49) is the reason this file exists. Both
 * languages must carry the same promise from the same constant.
 */
describe("the picker answers in the chosen language", () => {
  it("renders the German time promise and category caption", async () => {
    const before = useStore.getState().prefs;
    await act(async () => useStore.setState({ prefs: { ...before, lang: "de" } }));
    try {
      await render();
      const body = await text();
      expect(body).toContain("Scanzeit, nachdem der Ordner gelesen ist:");
      expect(body).toContain("Worauf achten");
      expect(body).toContain(PROFILE_DURATION.standard);
    } finally {
      await act(async () => useStore.setState({ prefs: before }));
    }
  });
});
