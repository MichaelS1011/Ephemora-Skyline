import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * A label floating over the city used to sit on a plate that was 75 % opaque,
 * so its contrast depended on whatever the scene painted behind it — measured at
 * one camera angle as 1.17:1 against the required 4.5:1. The plate is a solid
 * colour now, which makes the ratio a property of the stylesheet instead of a
 * property of the frame. The arithmetic is done here so the claim is checkable.
 */
const REPO = path.resolve(import.meta.dirname, "..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string): number => {
  const parts: number[] = [];
  for (const i of [1, 3, 5]) parts.push(parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = parts;
  return (
    0.2126 * channel(r as number) + 0.7152 * channel(g as number) + 0.0722 * channel(b as number)
  );
};
const ratio = (a: string, b: string): number => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe("the city label plates", () => {
  const files = ["components/CityTree.tsx", "components/District.tsx"];

  it("are solid, so nothing behind them counts", () => {
    for (const f of files) {
      const text = read(`src/${f}`);
      expect(text, `${f} still paints a translucent plate`).not.toMatch(
        /background: "rgba\(18, 18, 16, 0\.\d+\)"/,
      );
      expect(text).toContain('background: "#121210"');
    }
  });

  it("clears WCAG AA for every ink it carries", () => {
    const plate = "#121210";
    // --meta-strong (district and building labels), the panel's warm grey, and
    // the red used for a selected file's counts — all sit on this plate
    const pairs: Array<[string, string]> = [
      ["#d7e2e9", "14.24"],
      ["#cfcabe", "11.47"],
      ["#ffb3bc", "11.10"],
    ];
    for (const [ink, expected] of pairs) {
      const r = ratio(plate, ink);
      expect(r, `${ink} on the plate`).toBeGreaterThan(4.5);
      expect(r.toFixed(2), `${ink} on the plate`).toBe(expected);
    }
  });

  it("are not left at a size below the type floor by the plate change", () => {
    for (const f of files) {
      const text = read(`src/${f}`);
      for (const m of text.matchAll(/fontSize:\s*([\d.]+)/g)) {
        // the 3D labels scale with distanceFactor, so only the district HTML labels
        // are screen pixels; nothing there may drop under 11
        if (f === "components/District.tsx")
          expect(Number(m[1]), `${f} shrank a label`).toBeGreaterThanOrEqual(11);
      }
    }
  });
});
