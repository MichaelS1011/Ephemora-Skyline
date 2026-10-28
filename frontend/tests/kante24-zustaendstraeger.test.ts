// KANTE-24 — what says "this dock control cannot be used right now".
//
// The dock and its overflow menu said it with `opacity: <state> ? 1 : 0.4` and
// with Tailwind's `disabled:opacity-40`. Measured at the model field of
// `glas-chrome.test.ts` (the same field the painted pixels sit 2-4 points
// under), that put the step labels at 3,37:1, the export items at 3,26:1 and
// the ordinary dock label at 2,90:1 — all under the 4,5 this round holds the
// fixed shell to, with no state exception left in the guard. The state stayed;
// its carrier moved to a strike drawn in the label's own ink plus the words on
// the element. `glas-chrome.test.ts` holds the number, this file holds the
// shape — the same split `ton20-zustaendstraeger.test.ts` set up for the heat
// channel.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SRC = path.resolve(import.meta.dirname, "../src");
const bar = readFileSync(path.join(SRC, "components/ActionBar.tsx"), "utf-8");

/** The whole opening tag of the control that paints `needle`. An inline style
 *  is not a stylesheet rule, so the only way to ask whether a state and its
 *  mark come from one and the same condition is to read both off the element
 *  that shows them. */
function control(needle: string): string {
  const at = bar.indexOf(needle);
  expect(at, `ActionBar.tsx kennt "${needle}" nicht mehr`).toBeGreaterThan(-1);
  const open = bar.lastIndexOf("<button", at);
  expect(open, `"${needle}" gehört zu keinem <button>`).toBeGreaterThan(-1);
  const rest = bar.slice(open);
  const end = rest.search(/\n\s*>\n/);
  expect(end, `der <button> um "${needle}" wird nie geschlossen`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("Das Dock trägt seinen Zustand ohne Deckkraft", () => {
  it("dimmt gar nichts mehr — weder inline noch als Klasse", () => {
    expect(bar, "ein Deckkraft-Wort ist im Dock zurück").not.toMatch(/opacity/);
    expect(bar, "eine Inline-Deckkraft ist zurück").not.toMatch(
      /opacity:\s*[^;{}]*\?\s*[\d.]+\s*:\s*[\d.]+/,
    );
    expect(bar, "disabled:opacity- ist zurück").not.toMatch(/disabled:opacity-\d/);
  });

  it("streicht in der eigenen Tinte, nicht in einem zweiten Grundton", () => {
    expect(bar).toMatch(/textDecoration:\s*"line-through"/);
    expect(bar, "eine eigene Decorations-Farbe wäre wieder ein zweiter Grundton").not.toMatch(
      /text-decoration-color|textDecorationColor/,
    );
  });

  it("sagt den leeren Schritt mit derselben Bedingung, die er streicht", () => {
    for (const [side, key] of [
      ["behind", "Behind"],
      ["ahead", "Ahead"],
    ] as const) {
      const tag = control(`struck(!queue?.${side})`);
      expect(tag, `${side}: aria-disabled fehlt`).toMatch(
        new RegExp(`aria-disabled=\\{!queue\\?\\.${side}\\}`),
      );
      expect(tag, `${side}: der Titel erklärt den leeren Schritt nicht`).toMatch(
        new RegExp(`t\\(lang, "actions\\.triageNone${key}"\\)`),
      );
    }
  });

  it("streicht Triage-Start und Exporte aus derselben Bedingung wie den Zustand", () => {
    expect(control("struck(totalFindings === 0)")).toMatch(/disabled=\{totalFindings === 0\}/);
    for (const [format, key] of [
      ["sarif", "Sarif"],
      ["handoff", "Handoff"],
    ] as const) {
      const tag = control(`downloadReport("${format}"`);
      expect(tag, `${format}: aria-disabled fehlt`).toMatch(/aria-disabled=\{!analysisId\}/);
      expect(tag, `${format}: gestrichen wird eine andere Bedingung als die, die sperrt`).toMatch(
        /struck\(!analysisId\)/,
      );
      expect(tag, `${format}: der fehlende Scan erklärt sich nicht`).toMatch(
        new RegExp(`actions\\.export${key}Title[\\s\\S]*actions\\.exportNoScanTitle`),
      );
    }
  });

  it("streicht den Stadt-Link, der die gleiche Sperre hat, ebenso", () => {
    // The link used to be the one blocked item in the menu that said nothing at
    // all: no dim, no mark. The same missing scan now marks it the same way.
    const tag = control("onClick={() => void handleShare()}");
    expect(tag).toMatch(/disabled=\{!analysisId\}/);
    expect(tag).toMatch(/struck\(!analysisId\)/);
  });

  it("sagt „läuft schon' in Worten und streicht es nicht", () => {
    // A control that is busy is not unavailable: `Tour läuft` and `Tests
    // laufen…` stand on the element, so those two carry their state as text,
    // stay unstruck, and keep their full ink.
    expect(bar).toMatch(/running=\{tourActive\}/);
    expect(bar).toMatch(/disabled=\{tourActive \|\| totalFindings === 0\}/);
    expect(bar).toMatch(/color: active \? "#fff2e9" : "#dedbd3"/);
    expect(control("...struck(disabled === true && !running)")).toMatch(/disabled=\{disabled\}/);
    const blocked = bar.match(/const testsBlocked = ([^;]+);/);
    expect(blocked, "testsBlocked ist keine Zeile mehr").not.toBeNull();
    expect((blocked as RegExpMatchArray)[1], "der laufende Testlauf würde gestrichen").toMatch(
      /^!testing/,
    );
    // The disable and the strike must name the SAME conditions. Measured in an
    // exported city: the button was disabled (with the reason in its title)
    // while the strike still asked the older question and left it looking live.
    // The check therefore holds the two expressions equal instead of spelling
    // out one of them — a spelled-out list passes a one-sided edit.
    const disabled = bar.match(/disabled=\{testing \|\| ([^}]+)\}/);
    expect(disabled, "testsBlocked ist keine Zeile mehr").not.toBeNull();
    const sameBlock = (blocked as RegExpMatchArray)[1]!
      .replace(/^!testing && \(?/, "")
      .replace(/\)$/, "");
    expect((disabled as RegExpMatchArray)[1]!.trim()).toBe(sameBlock);
    expect(bar).toMatch(/testing \? t\(lang, "actions\.testsRunning"\)/);
  });

  it("hat für jede Sperre eine Markung, und keine hängt an nichts", () => {
    // Nine blocked shapes on the bar and in its menu; a number that drops means
    // one of them went back to being said by tone alone, which is exactly the
    // fall `glas-chrome.test.ts` measures. The ninth is the seat in the
    // tow-plane: refused while the crane is up or the tour drives.
    const marks = [...bar.matchAll(/struck\(([^)]*)\)/g)].map((m) => m[1] as string);
    expect(marks, `Markungen: ${marks.join(" | ")}`).toHaveLength(9);
    for (const m of marks) expect(m, `eine Markung hängt an keiner Bedingung`).not.toBe("");
  });
});
