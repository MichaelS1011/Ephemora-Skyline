// @vitest-environment jsdom
/**
 * „Where the user asks for less transparency, the material becomes solid" is the
 * obligation Apple binds to a translucent material, and the shell had not taken
 * it: the glass was glass for everyone. Two halves make it true — the sheet pins
 * both tokens opaque, and the adaptive sampler has to stand off, because the
 * inline stage it writes would otherwise win over the sheet. A media block alone
 * is the kind of accessibility promise that passes a grep and fails a screen.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clearGlassStages } from "../src/render/useGlassStage";

const here = dirname(fileURLToPath(import.meta.url));
const css = (f: string) => readFileSync(resolve(here, "../src/design", f), "utf-8");
const hook = readFileSync(resolve(here, "../src/render/useGlassStage.ts"), "utf-8");

describe("prefers-reduced-transparency reaches the material", () => {
  const globals = css("globals.css");
  const at = globals.indexOf("@media (prefers-reduced-transparency: reduce)");

  it("pins both materials opaque and takes the frost away", () => {
    expect(at, "die Anfrage hat noch keinen Block im Blatt").toBeGreaterThan(-1);
    const block = globals.slice(
      at,
      globals.indexOf("}", globals.indexOf("--glass-chrome-blur", at)) + 1,
    );
    for (const token of ["--glass-control-bg", "--material-read-bg"]) {
      const value = block.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]?.trim() ?? "";
      expect(value, `${token} muss deckend werden, nicht nur dichter`).toMatch(
        /^rgb\(\s*\d+\s*[,\s]\s*\d+\s*[,\s]\s*\d+\s*\)$/,
      );
      expect(value, `${token} trägt noch eine Alpha-Klausel`).not.toMatch(/\//);
    }
    expect(block, "ohne Frost wird aus dem Glas keine Milchglasscheibe").toMatch(
      /--glass-chrome-blur:\s*none/,
    );
  });

  it("stands the sampler off, and takes back what it already wrote", () => {
    expect(hook, "der Sampler fragt die Anfrage nicht ab").toMatch(
      /prefersReducedTransparency\(\)/,
    );
    expect(hook, "ein geschriebener Stand gewinnt über das Blatt — er muss zurück").toMatch(
      /clearGlassStages\(/,
    );
    const header = document.createElement("div");
    header.className = "workspace-header";
    header.style.setProperty("--glass-control-bg", "rgba(14, 16, 21, 0.42)");
    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.append(header);
    document.body.append(shell);
    expect(header.style.getPropertyValue("--glass-control-bg")).not.toBe("");
    clearGlassStages(document);
    expect(
      header.style.getPropertyValue("--glass-control-bg"),
      "der Inline-Stand bleibt stehen",
    ).toBe("");
    // and the reading plates are not on the sampler's list at all
    const card = document.createElement("div");
    card.className = "panel-context-card";
    card.style.setProperty("--glass-control-bg", "rgba(14, 16, 21, 0.42)");
    document.body.append(card);
    clearGlassStages(document);
    expect(
      card.style.getPropertyValue("--glass-control-bg"),
      "die Lesplatte gehört nicht daher",
    ).toBe("rgba(14, 16, 21, 0.42)");
  });
});

describe("the world says what it can be done with", () => {
  const globals = css("globals.css");

  it("offers a drag on the canvas, and a grip while it is held", () => {
    // Measured on the running canvas: `cursor: auto`. The only hint that a
    // click-drag orbits the city was the camera moving afterwards.
    const at = globals.indexOf(".city-canvas canvas {");
    expect(at, "die Stadt trägt keinen Zeiger").toBeGreaterThan(-1);
    expect(globals.slice(at, globals.indexOf("}", at))).toMatch(/cursor:\s*grab/);
    const active = globals.indexOf(".city-canvas canvas:active");
    expect(active, "beim Halten sagt nichts „ich greife“").toBeGreaterThan(at);
    expect(globals.slice(active, globals.indexOf("}", active))).toMatch(/cursor:\s*grabbing/);
  });

  it("keeps every control of the folded announcement over the shell's 28 px floor", () => {
    // Live census on the running strip: 91 × 23 px for “Show again”, 26 × 26 for
    // the ✕. Both grew; the floor is the one the shell already holds elsewhere.
    const start = css("start.css");
    const pair = start.slice(
      start.indexOf(".start-summary-pin,"),
      start.indexOf(".start-summary-pin.is-on"),
    );
    expect(pair, "die Streifen-Knöpfe brauchen eine Mindesthöhe").toMatch(/min-height:\s*28px/);
    const close = start.slice(start.indexOf(".start-summary-close {"));
    expect(close.slice(0, 260)).toMatch(/width:\s*28px/);
    expect(close.slice(0, 260)).toMatch(/height:\s*28px/);
  });
});
