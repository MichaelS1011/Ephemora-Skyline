// @vitest-environment jsdom
// Two paths the program promised and never built an end for:
// — the file-cap refusal says "exclude folders", and `saveExcludes` had no
//   caller, so there was no field to say it in (measured: 0 writers of the
//   exclude list, 4 readers of it, and `.scan-exclude` CSS with no markup);
// — the "recently opened" row parsed `codecity-recent-cities` with a `name`
//   field while the index that filled up all day lives under
//   `codecity-recent:v1` with `folder` (measured: 0 writers of the key the
//   screen read).
import { readFileSync } from "fs";
import path from "path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanExcludes } from "../src/components/ScanExcludes";
import { MAX_EXCLUDE_PATHS, loadExcludes } from "../src/config/scanProfiles";
import { recordCityVisit, recentCities } from "../src/recentCities";
import { t } from "../src/i18n";
import type { CityData } from "../src/city/types";

const REPO = path.resolve(import.meta.dirname, "../..");
const src = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

let container: HTMLDivElement;
let root: Root;

async function mount(lang: "de" | "en"): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ScanExcludes, { lang })));
}

async function unmount(): Promise<void> {
  await act(async () => root.unmount());
  container.remove();
}

/** Type like a person: the framework has to see the change, then the field loses focus. */
async function type(value: string): Promise<void> {
  const input = container.querySelector("input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

const status = (): string =>
  (container.querySelector('[role="status"]')?.textContent ?? "").replace(/\s+/g, " ");

const city = (id: string, name: string): CityData =>
  ({
    analysisId: id,
    repo: { owner: "local", name, branch: "main" },
    totalFiles: 12,
    findingsBySeverity: { P0: 1, P1: 1, P2: 0 },
    tree: { name, path: "", children: [], detailFiles: [], districtFiles: [] },
  }) as unknown as CityData;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.unstubAllGlobals();
});

describe("the exclude field the refusal points at", () => {
  it("stores what was typed the moment the field is left", async () => {
    await mount("de");
    expect(loadExcludes()).toEqual([]);
    expect(status()).toBe(t("de", "cap.excludeNone"));
    await type("generated, fixtures/build");
    expect(loadExcludes()).toEqual(["generated", "fixtures/build"]);
    expect(status()).toBe(t("de", "cap.excludeCount", { n: "2", max: String(MAX_EXCLUDE_PATHS) }));
  });

  it("reads back the stored list on the next opening", async () => {
    await mount("de");
    await type("vendor");
    await unmount();
    await mount("de");
    expect(container.querySelector("input")!.value).toBe("vendor");
    expect(loadExcludes()).toEqual(["vendor"]);
  });

  it("keeps the needles the list cannot hold out of storage", async () => {
    await mount("de");
    await type("../secrets, , , ,,");
    expect(loadExcludes()).toEqual([]);
    expect(status()).toBe(t("de", "cap.excludeNone"));
  });

  it("counts its bound and does not pass it", async () => {
    await mount("en");
    await type(Array.from({ length: MAX_EXCLUDE_PATHS + 20 }, (_, i) => `d${i}`).join(", "));
    expect(loadExcludes()).toHaveLength(MAX_EXCLUDE_PATHS);
    expect(status()).toContain(`at most ${MAX_EXCLUDE_PATHS}`);
  });

  it("says the singular it means and names the rule it applies", async () => {
    await mount("de");
    await type("build");
    expect(status()).toBe(
      t("de", "cap.excludeCountOne", { n: "1", max: String(MAX_EXCLUDE_PATHS) }),
    );
    expect(container.textContent).toContain(t("de", "cap.excludeRule"));
  });

  it("stands in both places a scan is started", () => {
    for (const file of [
      "frontend/src/components/Landing.tsx",
      "frontend/src/components/AnalyzePanel.tsx",
    ]) {
      const text = src(file);
      expect(text, `${file} never offers the exclude field`).toContain("<ScanExcludes");
      expect(text).toContain('from "./ScanExcludes"');
    }
  });
});

describe("the recently opened row reads the list the app actually writes", () => {
  it("shows the folder the last visit named", () => {
    recordCityVisit(city("scan-7", "mein-repo"));
    const list = recentCities();
    expect(list).toHaveLength(1);
    expect(list[0]!.folder).toBe("mein-repo");
    const landing = src("frontend/src/components/Landing.tsx");
    expect(landing).toContain('from "../recentCities"');
    expect(landing).toContain("{c.folder}");
  });

  it("leaves no second key and no second parser behind", () => {
    for (const file of [
      "frontend/src/components/Landing.tsx",
      "frontend/src/hooks/useLocalAnalysis.ts",
      "frontend/src/stores/useStore.ts",
    ]) {
      expect(src(file), `${file} still parses its own recent list`).not.toContain(
        "codecity-recent-cities",
      );
    }
    expect(src("frontend/src/recentCities.ts")).toContain("codecity-recent:v1");
  });
});
