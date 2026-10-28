// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { t, type Lang } from "../src/i18n";
import { Landing } from "../src/components/Landing";
import { rememberArrivalStage } from "../src/firstArrival";

/**
 * Erste Reise (2026-10-28) — the five questions a first-time reader must be
 * able to answer after thirty seconds, guarded as sentences on the screen.
 *
 *   q1  what is this?            q2  what is a building?       q3  what happens to my code?
 *   q4  what does red mean?      q5  what do I do now?
 *
 * WHY THIS FILE READS PAINTED TEXT AND NOT `textContent`. The sentence that
 * explained the metaphor lived in the plate's SVG `<desc>` — "Each building
 * represents a file; height represents complexity and a red beacon marks a
 * security finding." A screen reader speaks it and an eye never sees it, so
 * `textContent` said the first beat explained the city while the delivered
 * frame showed the explanation only in the bottom strip, 358 px below the card
 * the reader was reading (`verstaendnis-before/beat1-welcome-en.json`:
 * `.landing-footer` y=863, 12 px). `<title>` and `<desc>` are therefore cut
 * before the text is read, and a question answered only there is a finding.
 *
 * The patterns are the ones the live probe runs
 * (`.qoder-scratch/…/verstaendnis.mjs`), so the guard and the measurement
 * cannot drift apart. They match a SENTENCE SHAPE, not a fixed string: reword
 * the copy around the fact and the case stays green; drop the fact and it goes
 * red.
 */

const ANSWERS = {
  q1_wasIstDas: {
    en: /\b(builds?|turn|becomes?).{0,60}\bcity\b|\bcity\b.{0,60}\b(code|folder|project)\b/i,
    de: /\b(baut?|verwandel|wird|werden).{0,70}(stadt)|(stadt).{0,70}(code|ordner|projekt)/i,
  },
  q2_gebaeude: {
    en: /\b(files?|every file)\b.{0,40}\bbuildings?\b|\bbuildings?\b.{0,40}\bfiles?\b/i,
    de: /\bdatei(en)?\b.{0,40}\bgebäude(n)?\b|\bgebäude(n)?\b.{0,40}\bdatei(en)?\b/i,
  },
  q3_meinCode: {
    en: /\b(code|source|files?)\b.{0,110}\b(stays|never uploaded|not uploaded|read here|reads it here|uploads nothing|on this machine|never leaves|not sent)\b/i,
    de: /\b(code|quelltext|quellcode|datei(en)?)\b.{0,120}\b(bleibt|nie hochgeladen|wird nie|nicht hochgeladen|lokal|verlässt|lädt nichts hoch|liest ihn hier)/i,
  },
  q4_rot: {
    en: /\b(red|glow red|red light|red beacon)\b.{0,60}\b(findings?|security|risk)\b|\b(findings?|security|risk)\b.{0,50}\b(red|glows red|leuchtet)\b/i,
    de: /(rot|leuchtfeuer|leuchten)[\s\S]{0,70}(fund|sicherheits|risiko)|(fund|sicherheits|risiko)[\s\S]{0,70}(rot|leucht)/i,
  },
} satisfies Record<string, Record<Lang, RegExp>>;

let host: HTMLDivElement;
let root: Root;

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response),
  );
}

async function mountAt(stage: "welcome" | "intro", lang: Lang): Promise<void> {
  localStorage.clear();
  if (stage === "intro") rememberArrivalStage("intro");
  useStore.setState(
    {
      ...useStore.getInitialState(),
      firstRun: true,
      prefs: { ...useStore.getInitialState().prefs, lang },
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Landing />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The beat's own card, with the picture's invisible metadata cut away. */
function beatCard(): Element {
  const card = host.querySelector(".landing-welcome, .landing-guide");
  expect(card, "the guided beat is not on screen").not.toBeNull();
  const clone = card!.cloneNode(true) as Element;
  clone.querySelectorAll("title, desc, style, script").forEach((n) => n.remove());
  return clone;
}

/** Painted text of a subtree, one space between sentences. `textContent` would
 *  weld "…glow red" to "See the complexity" and no word boundary survives that. */
function paintedIn(selector: string): string {
  const el = host.querySelector(selector);
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("title, desc, style, script").forEach((n) => n.remove());
  const parts: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) parts.push(text);
      } else {
        walk(child);
      }
    }
  };
  walk(clone);
  return parts.join(" ");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  stubFetch();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
});

for (const lang of ["en", "de"] as const) {
  describe(`the greeting answers what a reader asks (${lang})`, () => {
    it("says what this is, in the card", async () => {
      await mountAt("welcome", lang);
      expect(paintedIn(".landing-welcome")).toMatch(ANSWERS.q1_wasIstDas[lang]);
    });

    it("says what a building is, where the reader is looking", async () => {
      await mountAt("welcome", lang);
      // Before this round the same claim was reachable only as the plate's
      // `<desc>` (never painted) and as the footer strip at y=863.
      expect(paintedIn(".landing-welcome")).toMatch(ANSWERS.q2_gebaeude[lang]);
      expect(paintedIn(".landing-footer")).not.toMatch(ANSWERS.q2_gebaeude[lang]);
    });

    it("says what happens to the code, and does not overstate it", async () => {
      await mountAt("welcome", lang);
      const body = paintedIn(".landing-welcome");
      expect(body).toMatch(ANSWERS.q3_meinCode[lang]);
      // an absolute the hourly release check contradicts
      expect(body).not.toMatch(/Nothing leaves this machine|Nichts verlässt diesen Rechner/);
    });

    it("says what red means before the first red light appears", async () => {
      await mountAt("welcome", lang);
      // the plate is the picture's own annotation: it is painted on this beat
      expect(paintedIn(".landing-visual")).toMatch(ANSWERS.q4_rot[lang]);
    });

    it("asks for one thing in the card and one way out above it", async () => {
      await mountAt("welcome", lang);
      const card = beatCard();
      expect(card.querySelectorAll("button")).toHaveLength(1);
      const row = host.querySelector(".start-progress-steps");
      expect(row?.querySelectorAll("button")).toHaveLength(1);
      // the row holds no word that could be mistaken for a control
      expect([...(row?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual([
        "",
        "",
      ]);
    });
  });

  describe(`the introduction carries the exception (${lang})`, () => {
    it("states the two requests that do leave, in one sentence", async () => {
      await mountAt("intro", lang);
      const note = paintedIn(".landing-guide-reaches");
      expect(note).not.toBe("");
      expect(note.toLowerCase()).toContain("github");
      expect(host.querySelector(".landing-guide-reaches")?.textContent).toBe(
        t(lang, "landing.guideReaches"),
      );
    });

    it("does not say the greeting's sentences a second time", async () => {
      await mountAt("intro", lang);
      const card = paintedIn(".landing-guide");
      expect(card).not.toMatch(ANSWERS.q3_meinCode[lang]);
      expect(card).not.toMatch(ANSWERS.q2_gebaeude[lang]);
    });
  });
}
