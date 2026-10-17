// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileChips } from "../src/components/ProfileChips";
import { t as tDict } from "../src/i18n";
const tEn = (key: string, vars?: Record<string, string | number>) =>
  tDict("en", key as never, vars);
import { SCAN_PROFILES } from "../src/config/scanProfiles";
import type { RulePackInfo } from "../src/config/rulePacks";
import { useStore } from "../src/stores/useStore";

/**
 * #50 — profile selection. Three measured complaints, three pinned answers:
 * (a) reading two profiles in a row (the modal blocked it), (b) no overlay in
 * the DOM at all, (c) one duration sentence, from one place — and since the
 * 2026-10-09 pass it names no seconds, because the measurement behind them
 * lived outside the repository (a local measurement script that is not shipped, git-ignored).
 */

let container: HTMLDivElement;
let root: Root;

async function render(variant: "landing" | "analyze-panel" = "landing"): Promise<string> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ProfileChips, { variant })));
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

/**
 * The entry screen, measured as the first thing a stranger sees (operator
 * decision, taken at the live screen on 2026-10-11): the nine category chips
 * and the rule-pack row are too much for someone standing here for the first
 * time. Both blocks are gone from this variant — and so is the network call
 * that existed only to fill the row that is no longer shown. The city keeps
 * both; the four cases above moved there and stayed green.
 */
describe("the entry screen carries neither block", () => {
  const pack: RulePackInfo = {
    id: "ephemora-core",
    name: "Ephemora core rules",
    version: "1.0.0",
    origin: "shipped",
    source: "in-repo",
    license: "Apache-2.0",
    categories: ["injection"],
    languages: ["typescript"],
    ruleCount: 12,
    default: true,
  };

  it("shows no category chips, no pack row, and asks the backend for neither", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: string): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
        urls.push(String(input));
        return { ok: true, json: async () => ({ packs: [pack] }) };
      },
    );
    await render("landing");
    const body = await text();
    expect(body).toContain(tEn("profile.durationNote"));
    expect(container.querySelectorAll(".category-options")).toHaveLength(0);
    expect(container.querySelectorAll(".pack-options")).toHaveLength(0);
    expect(body).not.toContain(tEn("profile.lookFor"));
    expect(body).not.toContain(tEn("profile.packsCaption"));
    expect(urls.filter((u) => u.includes("/api/rule-packs"))).toEqual([]);
    // what stays: the profile row itself, so the screen is still usable
    expect(container.querySelectorAll(".profile-options button").length).toBeGreaterThan(0);
  });
});

describe("scan profile picker (#50)", () => {
  /**
   * The reference seconds ("~2s", "~5s") are gone: the script that produced
   * them is git-ignored, so the shipped claim had no artifact anyone else can
   * run, and the tree it measured is days older. A test that copied the same
   * four literals in proved nothing either. What is pinned now is the rule the
   * launch bar asks for: a duration claim carries a number only where the
   * program has one it can show.
   */
  it("promises no seconds it cannot show the measurement for", () => {
    for (const lang of ["en", "de"] as const) {
      const note = tDict(lang, "profile.durationNote" as never);
      expect(note).not.toMatch(/\d+\s*(s\b|sec\b|min\b|Sekunde|Minute)/i);
    }
    // summaries must not carry a competing number any more ("~10s" was #50c)
    for (const p of SCAN_PROFILES) {
      expect(p.summary, `summary of "${p.id}" still contains a time`).not.toMatch(
        /\d+\s*(s|sec|min)\b/i,
      );
    }
    // and the one export that used to hold them is gone, not lying beside it
    const config = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/config/scanProfiles.ts"),
      "utf-8",
    );
    expect(config).not.toContain("PROFILE_DURATION");
    expect(config).not.toMatch(/:\s*"~\d+s"/);
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
    expect(t).toContain(tEn("profile.durationNote"));
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

  it("says the duration once per surface, from one key", async () => {
    const html = await render();
    const line = tEn("profile.durationNote");
    expect(html).toContain(line);
    expect(html.split(line).length - 1, "the duration sentence competes with itself").toBe(1);
  });

  it("keeps the category chips visible below the profile chips in the city panel", async () => {
    await render("analyze-panel");
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
      // the category caption is a scope line, and scope is asked in the city
      await render("analyze-panel");
      const body = await text();
      expect(body).toContain(tDict("de", "profile.durationNote" as never));
      expect(body).toContain("Worauf achten");
    } finally {
      await act(async () => useStore.setState({ prefs: before }));
    }
  });
});

describe("honest, reversible choices", () => {
  it("does not offer a custom profile that actually runs standard", async () => {
    await render();
    expect(SCAN_PROFILES.some((p) => p.id === "custom")).toBe(false);
  });
  it("keeps the last category enabled while allowing other categories back on", async () => {
    useStore.setState({ scanCategories: ["injection"] });
    await render("analyze-panel");
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".category-options button")];
    expect(buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.disabled).toBe(true);
    const off = buttons.find((b) => b.getAttribute("aria-pressed") === "false")!;
    expect(off.disabled).toBe(false);
    await act(async () => off.click());
    expect(useStore.getState().scanCategories).toHaveLength(2);
  });
});
