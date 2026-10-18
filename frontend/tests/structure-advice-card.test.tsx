// @vitest-environment jsdom
/**
 * The card teaches what the tower showed.
 *
 * A giant file is visible from afar (23.6 units beside a 3.0 neighbour), but
 * height has no words — and a beginner who never split a file cannot read the
 * lesson off a silhouette. The card of the opened building carries the note:
 * one measurable property, why it costs, what the split buys. The notes are
 * not findings (measured: as findings they turned this repository's honest
 * 38 into 122 — the lecture buried the queue), so the card block is the whole
 * surface. This file renders the real component against the real dictionary;
 * a copy of either would prove nothing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PanelAdvice } from "../src/components/PanelAdvice";
import type { Lang } from "../src/i18n";

type Note = { kind: "monolith" | "deep" | "longline"; value: number };

let host: HTMLDivElement | undefined;
let root: Root | undefined;

function render(advice: Note[] | undefined, lang: Lang): string | null {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(PanelAdvice, { advice, lang })));
  const block = host.querySelector("[data-structure-advice]");
  return block ? (block.textContent ?? "") : null;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("the card's teaching block", () => {
  it("stays silent for a file with nothing to say", () => {
    expect(render(undefined, "en")).toBeNull();
    expect(render([], "de")).toBeNull();
  });

  it("speaks every kind in both languages, with the file's own number in it", () => {
    for (const lang of ["en", "de"] as const) {
      for (const kind of ["monolith", "deep", "longline"] as const) {
        const text = render([{ kind, value: 1204 }], lang);
        expect(text, `${kind}/${lang} renders a block`).not.toBeNull();
        // an unresolved key would leak its own name into the card
        expect(text, `${kind}/${lang} resolves the key`).not.toMatch(/panel\.advice/i);
        // the placeholder must be substituted, not printed
        expect(text, `${kind}/${lang} fills {n}`).not.toContain("{n}");
        expect(text).toContain(lang === "en" ? "1,204" : "1.204");
      }
    }
  });

  it("counts the way the UI language counts, not the way the browser does", () => {
    // the bug this guards: toLocaleString() with no argument follows the
    // browser, so a German UI on an en-US machine printed 5,000 lines
    expect(render([{ kind: "monolith", value: 5000 }], "de")).toContain("5.000");
    expect(render([{ kind: "monolith", value: 5000 }], "en")).toContain("5,000");
  });

  it("names the benefit, not the blame", () => {
    for (const lang of ["en", "de"] as const) {
      expect(render([{ kind: "monolith", value: 900 }], lang)).toMatch(/reviewable|prüfbar/i);
      expect(render([{ kind: "deep", value: 900 }], lang)).toMatch(/test/i);
      expect(render([{ kind: "longline", value: 900 }], lang)).toMatch(/scroll/i);
    }
  });

  it("the German holds its meaning: too many branches are lost, not overlooked", () => {
    // "kein Leser mehr übersehen" would say readers miss the branches; the
    // lesson is that they cannot keep them all in mind at once
    const de = render([{ kind: "deep", value: 51 }], "de")!;
    expect(de).toMatch(/Überblick|im Kopf/i);
    expect(de).not.toMatch(/übersehen/i);
  });
});

describe("the block is mounted where the card is", () => {
  const panelSource = readFileSync(
    resolve(import.meta.dirname, "../src/components/InfoPanel.tsx"),
    "utf-8",
  );
  it("InfoPanel renders PanelAdvice from the file's own advice", () => {
    expect(panelSource).toMatch(/<PanelAdvice advice=\{file\.advice\} lang=\{lang\} \/>/);
  });
});
