// FARBBAND — the guard the last round could not see.
//
// `farbsichere-alarme.test.ts` walks the tree for `SEVERITY_COLOR[.` reads and
// excludes `city/palette.ts`. Both halves of that design were needed to miss the
// city itself: `THREAT_COLOR` is assembled inside palette.ts from the unswitched
// table, and an alarm colour painted as a JSX attribute (`emissive="#ff2e4d"`)
// is not a read of anything. This guard closes both: it forbids the alarm
// family's *values* from appearing as literals in the components that paint the
// 3D city, and it forbids reading the threat table outside the palette.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  ENV,
  SEVERITY_COLOR,
  SEVERITY_CVD_COLOR,
  REVIEWED_BEACON_COLOR,
  alarmWindowColors,
} from "../src/city/palette";

const SRC = path.resolve(import.meta.dirname, "../src");

/** The components that paint the city and the key that names it. */
const CITY_FILES = [
  "components/Building.tsx",
  "components/District.tsx",
  "components/HeatCells.tsx",
  "components/CoachMarks.tsx",
  "components/BannerPlane.tsx",
];

/** Every spelling an alarm colour can take in a stylesheet or a JSX attribute. */
function alarmSpellings(): Array<{ label: string; hex: string; rgb: string }> {
  const pale = alarmWindowColors(false).pale;
  const hexes = [
    ...Object.values(SEVERITY_COLOR),
    ...Object.values(SEVERITY_CVD_COLOR),
    ENV.windowAlarm,
    pale,
    REVIEWED_BEACON_COLOR,
  ];
  return [...new Set(hexes)].map((hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return { label: hex, hex, rgb: `${r},${g},${b}` };
  });
}

describe("Kein Alarmton steht als Rohwert in einem Component, der die Stadt malt", () => {
  const spellings = alarmSpellings();

  it("kennt die Familie, gegen die es prüft — und die Familie ist nicht leer", () => {
    expect(spellings.length).toBeGreaterThanOrEqual(6);
    for (const s of spellings) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  for (const rel of CITY_FILES) {
    it(`${rel} malt keine Alarmfarbe aus einer Hand gesetzten Zahl`, () => {
      const text = readFileSync(path.join(SRC, rel), "utf-8");
      const hits = spellings
        .filter((s) => text.toLowerCase().includes(s.hex) || text.includes(`rgba(${s.rgb}`))
        .map((s) => s.label);
      expect(hits, `${rel} enthält rohe Alarmwerte: ${hits.join(", ")}`).toEqual([]);
    });
  }

  it("lässt die Stadt die Bedrohungs-Tabelle nicht direkt lesen", () => {
    const offenders = readdirSync(path.join(SRC, "components"), { withFileTypes: true })
      .filter((e) => /\.(ts|tsx)$/.test(e.name))
      .map(
        (e) =>
          [
            `components/${e.name}`,
            readFileSync(path.join(SRC, "components", e.name), "utf-8"),
          ] as const,
      )
      .filter(([, text]) => /THREAT_COLOR\s*[.[]/.test(text))
      .map(([f]) => f);
    expect(
      offenders,
      `THREAT_COLOR wird gelesen statt threatColor(): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("weist nach, dass es bissen würde: dieselbe Prüfung gegen eine Kopie mit gesetztem Literal", () => {
    // A guard that has never been red is a rumour. The planted copy lives in a
    // string, not in the tree, so the proof cannot leave a file behind.
    const planted = `const m = <meshStandardMaterial emissive="${SEVERITY_COLOR.P0}" />;`;
    const hits = alarmSpellings()
      .filter((s) => planted.toLowerCase().includes(s.hex) || planted.includes(`rgba(${s.rgb}`))
      .map((s) => s.label);
    expect(hits).toEqual([SEVERITY_COLOR.P0]);
  });
});
