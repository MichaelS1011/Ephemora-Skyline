// @vitest-environment jsdom
/**
 * The overview card's first screen says the facts; its qualifications sit one
 * layer below them.
 *
 * Measured on the live card before this file existed: 802 characters and 33
 * lines, of which one paragraph — what the shipped rules cannot see — was the
 * single longest block, sitting in the body between the user and the findings.
 * The paragraph is right and stays; it now lives under a one-line disclosure in
 * the same words. This test holds both halves: the body's budget, and the
 * promise that no sentence was dropped to reach it.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextCard } from "../src/components/ContextCard";
import { t } from "../src/i18n";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityData, CityDir, CityFile } from "../src/city/types";

const BODY_BUDGET = 420;

const files = (where: string, n: number): CityFile[] =>
  Array.from({ length: n }, (_, i) => file(`${where}/f${i}.ts`, "TypeScript"));

function cityData(): CityData {
  const src: CityDir = dir({
    name: "src",
    path: "src",
    fileCount: 40,
    linesOfCode: 900,
    codeLines: 900,
    dataLines: 0,
    languages: { TypeScript: 900 },
    findingsBySeverity: { P0: 2, P1: 1, P2: 0 },
    detailFiles: files("src", 6),
    remainingFiles: 34,
    districtFiles: files("src", 6),
  });
  const tree: CityDir = dir({
    ...src,
    name: "",
    path: "",
    detailFiles: [],
    districtFiles: [],
    children: [src],
  });
  return city({
    repo: { owner: "local", name: "casebook", branch: "main" },
    totalFiles: 40,
    totalLines: 900,
    codeLines: 900,
    dataLines: 0,
    languages: tree.languages,
    findingsBySeverity: tree.findingsBySeverity,
    limits: { skylineTowers: 6, buildingsPerDirectory: 35 },
    tree,
  });
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function show(lang: "en" | "de"): Promise<HTMLDivElement> {
  useStore.setState({
    ...useStore.getInitialState(),
    cityData: cityData(),
    prefs: { ...useStore.getInitialState().prefs, lang },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const element: ReactElement = <ContextCard />;
  await act(async () => root!.render(element));
  return container;
}

/**
 * What the first screen says: the card's text WITHOUT the stacked details —
 * the learning primer (three tabs) and the rule disclosure live one layer down,
 * exactly like the paragraph that moved there. jsdom renders a closed
 * <details> as ordinary DOM and applies no stylesheet, so "visible" has to be
 * read structurally: everything outside those two disclosures.
 */
const bodyText = (el: HTMLElement): string => {
  const card = el.querySelector(".panel-context-card") ?? el;
  const clone = card.cloneNode(true) as HTMLElement;
  // a details that is open is on the first screen by definition
  const open = [...card.querySelectorAll<HTMLDetailsElement>("details[open]")].map(
    (d) => d.textContent ?? "",
  );
  for (const stacked of clone.querySelectorAll("details, .city-learning")) stacked.remove();
  const text = `${clone.textContent ?? ""} ${open.join(" ")}`;
  return text.replace(/\s+/g, " ").trim();
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("the overview card's first screen", () => {
  it("keeps the body inside its budget with the disclosure shut", async () => {
    for (const lang of ["en", "de"] as const) {
      const el = await show(lang);
      const details = el.querySelector<HTMLDetailsElement>("details.ctx-coverage")!;
      expect(details, `${lang}: the qualification is a disclosure`).toBeTruthy();
      expect(details.open, `${lang}: shut by default`).toBe(false);
      expect(bodyText(el).length, `${lang}: body budget`).toBeLessThanOrEqual(BODY_BUDGET);
      await act(async () => root?.unmount());
      container?.remove();
    }
  });

  it("keeps every sentence of the disclosure, in the same words", async () => {
    for (const lang of ["en", "de"] as const) {
      const el = await show(lang);
      const details = el.querySelector<HTMLDetailsElement>("details.ctx-coverage")!;
      // the full paragraph is in the DOM exactly as the dictionary writes it —
      // folded, not cut, and the same text the README quotes
      expect(details.textContent).toContain(t(lang, "ctx.classCoverage"));
      expect(details.querySelector("summary")!.textContent).toContain(
        t(lang, "ctx.classCoverageSummary"),
      );
      await act(async () => root?.unmount());
      container?.remove();
    }
  });

  it("inflects the file count beside its sub-district", async () => {
    // "1 files live in 1 sub-district" was what the card printed: the
    // sub-district was inflected, the file above it was not
    for (const lang of ["en", "de"] as const) {
      const el = await show(lang);
      const text = bodyText(el);
      expect(text, `${lang}: no uninflected one`).not.toMatch(/\b1 files\b|1 Dateien\b/);
      await act(async () => root?.unmount());
      container?.remove();
    }
  });
});
