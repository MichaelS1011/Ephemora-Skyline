// @vitest-environment jsdom
/**
 * The height axis must name the measure the field is drawn with.
 *
 * At far zoom the heat cells replace the building heights: THREAT rises by
 * findings, CHURN by churn, TIME by "stood at the date" (HeatCells.heatCellRise).
 * The legends that explain "what height means right now" used to print the
 * constant "Height = complexity" regardless of the picked channel — a panel
 * that shows one quantity and names another (handoff note
 * experience-shaper__skyline-defect-hunter__2026-10-27T103430, befund_3).
 *
 * Pinned here:
 *  - all four channels, EN and DE, name THEIR measure while the heat grid
 *    draws the height (far zoom);
 *  - at near zoom the buildings still stand at complexity height — the
 *    sentence must stay "Height = complexity" there, so the fix cannot
 *    simply hard-wire the channel;
 *  - no new surface: the legend keeps exactly its two explainer lines.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HudOverlay } from "../src/components/HudOverlay";
import { heightAxisKey } from "../src/city/heightAxis";
import { t } from "../src/i18n";
import { useStore, type HeatChannel } from "../src/stores/useStore";
import { city } from "./helpers/cityFixture";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

/** far zoom: dist over HeatCells' enter threshold max(170, bounds * 4.8) */
const FAR_DIST = 1_000_000;
/** near zoom: the fitted overview distance of the store default */
const NEAR_DIST = 80;

/** What the height sentence must say per channel — word stems, not full strings. */
const EXPECT: Record<HeatChannel, { en: RegExp; de: RegExp; enNot: RegExp }> = {
  threat: { en: /found|finding/i, de: /gefunden|Funde/i, enNot: /complexity/i },
  churn: { en: /churn/i, de: /Churn/i, enNot: /complexity/i },
  time: { en: /stood/i, de: /stand/i, enNot: /complexity/i },
  complexity: { en: /complexity/i, de: /Komplexität/i, enNot: /$^/ },
};

let host: HTMLDivElement;
let root: Root | null = null;

async function mount(channel: HeatChannel, lang: "en" | "de", dist: number): Promise<void> {
  const initial = useStore.getInitialState();
  useStore.setState(
    {
      ...initial,
      prefs: { ...initial.prefs, lang },
      cityData: city(),
      heatChannel: channel,
      showLegend: true,
      cameraInfo: { ...initial.cameraInfo, dist },
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  const nextRoot = createRoot(host);
  root = nextRoot;
  await act(async () => {
    nextRoot.render(createElement(HudOverlay, { apiStatus: "demo" }));
  });
}

const heightLine = (): HTMLElement => {
  const line = host.querySelector<HTMLElement>(".city-legend .legend-explainer");
  expect(line, "no height explainer in the city legend").not.toBeNull();
  return line!;
};

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

describe("the height axis names the measure the field is drawn with", () => {
  for (const channel of ["threat", "complexity", "churn", "time"] as const) {
    it(`EN, ${channel}: the legend says what height carries at far zoom`, async () => {
      await mount(channel, "en", FAR_DIST);
      const text = heightLine().textContent ?? "";
      expect(text, `legend says "${text}", not the ${channel} measure`).toMatch(EXPECT[channel].en);
      expect(text, `legend still claims complexity under ${channel}`).not.toMatch(
        EXPECT[channel].enNot,
      );
    });

    it(`DE, ${channel}: die Legende nennt das Maß des Kanals bei Heat-Raster`, async () => {
      await mount(channel, "de", FAR_DIST);
      const text = heightLine().textContent ?? "";
      expect(text, `Legende sagt "${text}", nicht das ${channel}-Maß`).toMatch(EXPECT[channel].de);
    });
  }

  it("near zoom keeps the complexity sentence — buildings stand by complexity", async () => {
    await mount("time", "en", NEAR_DIST);
    expect(heightLine().textContent).toMatch(/complexity/i);
  });

  it("keeps exactly the two explainer lines — no new standing surface", async () => {
    await mount("time", "en", FAR_DIST);
    expect(host.querySelectorAll(".city-legend .legend-explainer")).toHaveLength(2);
  });
});

describe("heightAxisKey — the one decision every legend reads", () => {
  const CHANNELS = ["threat", "complexity", "churn", "time"] as const;

  it("names a DIFFERENT measure than complexity for threat, churn and time — in both languages", () => {
    for (const channel of CHANNELS) {
      const key = heightAxisKey(true, channel);
      for (const lang of ["en", "de"] as const) {
        const sentence = t(lang, key);
        if (channel === "complexity") {
          expect(sentence).toMatch(lang === "en" ? /complexity/i : /Komplexität/i);
        } else {
          expect(sentence, `${lang}/${channel} says nothing but complexity`).not.toMatch(
            lang === "en" ? /complexity/i : /Komplexität/i,
          );
        }
      }
    }
    expect(t("en", heightAxisKey(true, "time"))).toMatch(/stood/i);
    expect(t("de", heightAxisKey(true, "time"))).toMatch(/stand/i);
    expect(t("en", heightAxisKey(true, "threat"))).toMatch(/found/i);
    expect(t("de", heightAxisKey(true, "threat"))).toMatch(/gefunden/i);
    expect(t("en", heightAxisKey(true, "churn"))).toMatch(/churn/i);
    expect(t("de", heightAxisKey(true, "churn"))).toMatch(/Churn/i);
  });

  it("keeps complexity while the heat grid is NOT what stands (near zoom)", () => {
    for (const channel of CHANNELS) {
      expect(heightAxisKey(false, channel)).toBe("hud.heightComplexity");
    }
  });
});

describe("die Messlatte in der Welt und das Projektkarte-Grammatik lesen dieselbe Entscheidung", () => {
  const SRC = path.resolve(import.meta.dirname, "../src/components");
  for (const file of ["RoadSystem.tsx", "ContextCard.tsx"]) {
    const text = readFileSync(path.join(SRC, file), "utf-8");
    it(`${file} picks the sentence from heightAxisKey, not from the constant`, () => {
      expect(text, "die Fläche nennt wieder konstant complexity").toMatch(/heightAxisKey\(/);
      expect(text, "der Achsensatz hängt noch hart an hud.heightComplexity").not.toMatch(
        /"hud\.heightComplexity"/,
      );
    });
  }
});
