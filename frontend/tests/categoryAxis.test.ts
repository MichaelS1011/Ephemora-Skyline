// @vitest-environment node
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_IDS,
  FINDING_CATEGORIES,
  blindCategories,
  enabledCategoriesPayload,
  summarizeCategories,
} from "../src/config/findingCategories";
import { loadSavedCategories, saveCategories } from "../src/config/findingCategories";
import { useStore } from "../src/stores/useStore";

/**
 * The category axis only means something if the chips the user clicks are the
 * categories the scanner reports. These tests pin the two against each other.
 */
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

describe("the UI table and the scanner table agree", () => {
  const backendSrc = readFileSync(
    path.join(repoRoot, "backend/src/services/security/categories.ts"),
    "utf-8",
  );

  it("lists exactly the backend's categories, in the same order", () => {
    const block = backendSrc.match(/export const FINDING_CATEGORIES[\s\S]*?\n\] as const;/);
    expect(block, "backend category table not found").toBeTruthy();
    const ids = [...block![0]!.matchAll(/^\s+id: "([a-z]+)",$/gm)].map((m) => m[1]!);
    expect(ids).toHaveLength(9);
    expect(ids).toEqual([...CATEGORY_IDS]);
  });

  it("names only engines the scan reports under", () => {
    const union = backendSrc.match(/engines: (Array<[^;]+>);/);
    expect(union, "backend engine union not found").toBeTruthy();
    const keys = [...union![1]!.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
    for (const category of FINDING_CATEGORIES) {
      expect(category.engines.length).toBeGreaterThan(0);
      for (const engine of category.engines) expect(keys).toContain(engine);
    }
  });
});

describe("summarizeCategories", () => {
  it("lists the kinds a folder reported, fullest first", () => {
    expect(
      summarizeCategories({
        injection: 4,
        secrets: 1,
        hygiene: 12,
        crypto: 0,
        transport: 0,
        exposure: 0,
        dependencies: 0,
        permissions: 0,
        unclassified: 0,
      }),
    ).toBe("hygiene 12 · injection 4 · secrets 1");
  });

  it("says nothing for a city that never published categories", () => {
    expect(summarizeCategories(undefined)).toBe("");
    expect(
      summarizeCategories({
        injection: 0,
        secrets: 0,
        hygiene: 0,
        crypto: 0,
        transport: 0,
        exposure: 0,
        dependencies: 0,
        permissions: 0,
        unclassified: 0,
      }),
    ).toBe("");
  });
});

describe("blindCategories", () => {
  it("calls a category blind only when every engine that could fill it is off", () => {
    expect(blindCategories(["semgrep"])).toEqual([]);
    expect(blindCategories(["gitleaks", "regex"])).toContain("secrets");
    expect(blindCategories(["gitleaks", "regex"])).not.toContain("dependencies");
    expect(blindCategories([])).toEqual([]);
  });
});

describe("enabledCategoriesPayload", () => {
  it("sends no filter when everything is selected", () => {
    expect(enabledCategoriesPayload([...CATEGORY_IDS])).toEqual([]);
    expect(enabledCategoriesPayload([])).toEqual([]);
  });

  it("sends the selection in table order, not click order", () => {
    expect(enabledCategoriesPayload(["secrets", "injection"])).toEqual(["injection", "secrets"]);
  });
});

describe("the saved selection", () => {
  const storage = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  };

  it("defaults to everything when nothing was stored", () => {
    storage.clear();
    expect(loadSavedCategories()).toEqual([...CATEGORY_IDS]);
  });

  it("keeps a narrowed selection across a reload, in table order", () => {
    saveCategories(["secrets", "injection"]);
    expect(loadSavedCategories()).toEqual(["injection", "secrets"]);
  });

  it("refuses to restore a broken or empty list as no filter at all", () => {
    storage.set("codecity-scan-categories", '["nonsense"]');
    expect(loadSavedCategories()).toEqual([...CATEGORY_IDS]);
    storage.set("codecity-scan-categories", "not json");
    expect(loadSavedCategories()).toEqual([...CATEGORY_IDS]);
  });
});

describe("the selection in the store", () => {
  it("switches a kind off and back on", () => {
    useStore.setState({ scanCategories: [...CATEGORY_IDS] });
    useStore.getState().toggleScanCategory("hygiene");
    expect(useStore.getState().scanCategories).not.toContain("hygiene");
    useStore.getState().toggleScanCategory("hygiene");
    expect(useStore.getState().scanCategories).toContain("hygiene");
  });

  it("never lets the last kind be switched off", () => {
    useStore.setState({ scanCategories: ["secrets"] });
    useStore.getState().toggleScanCategory("secrets");
    expect(useStore.getState().scanCategories).toEqual(["secrets"]);
  });
});
