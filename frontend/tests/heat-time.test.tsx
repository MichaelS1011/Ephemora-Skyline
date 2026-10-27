// @vitest-environment jsdom
/**
 * The TIME channel on the heat toggle — the fourth channel and its field.
 *
 * Guards for the rules the zeitkanal stands on:
 *  - the date field exists ONLY while the time channel is picked. It is part
 *    of the HEAT surface, not a fifth standing surface (arrival-budget keeps
 *    the count of those);
 *  - a payload without a scan moment or without git dates cannot be asked the
 *    question: the channel is aria-disabled with an honest tooltip and the
 *    click changes nothing — no invented rail;
 *  - the number the field claims ("1 of 3 files stood at …") is computed from
 *    `timeCensus` in `city/stoodAt.ts`, in the UI language, and it stands ONCE
 *    on the plate;
 *  - the slider commits DEBOUNCED. Every committed date rewrites all instance
 *    matrices of the far field; a thumb that rebuilds per frame would spend
 *    the frame budget on geometry the reader is still dragging through;
 *  - the slider is a native range input — keyboard reachable, and its
 *    aria-label carries the word (Datum/date), not just a number.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { HeatmapToggle } from "../src/components/HeatmapToggle";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";
import { formatDate } from "../src/i18n";

const DAY = 86_400_000;
const SCAN = "2026-03-01T00:00:00Z";
const SCAN_MS = Date.parse(SCAN);
/** Commit debounce in HeatmapToggle.tsx — kept in sync by hand, asserted below. */
const COMMIT_MS = 200;

const CHURN_META = {
  churn: true,
  deadCode: false,
  duplicates: false,
  cycles: false,
  coverage: false,
  blame: false,
} as const;

/** One file stood long ago, one only two days before the scan, one carries no date. */
const DATED_FILES = [
  file("old.ts", "TypeScript", [], undefined, { firstCommitAt: SCAN_MS - 60 * DAY }),
  file("new.ts", "TypeScript", [], undefined, { firstCommitAt: SCAN_MS - 2 * DAY }),
  file("undated.ts", "TypeScript", [], undefined, { firstCommitAt: undefined }),
];

const DATED_CITY = city({
  createdAt: SCAN,
  meta: { ...CHURN_META },
  files: DATED_FILES,
});

/** A payload from before the scan moment — the question has no rail. */
const NO_MOMENT_CITY = city({
  createdAt: undefined,
  meta: { ...CHURN_META },
  files: DATED_FILES,
});

/** A payload with a moment but no git dates — same honest answer. */
const NO_CHURN_CITY = city({
  createdAt: SCAN,
  meta: { ...CHURN_META, churn: false },
  files: DATED_FILES,
});

let host: HTMLDivElement;
let root: Root;

async function mount(cityData: typeof DATED_CITY, lang: "en" | "de" = "en"): Promise<void> {
  const initial = useStore.getInitialState();
  useStore.setState(
    {
      ...initial,
      prefs: { ...initial.prefs, lang },
      cityData,
      heatChannel: "threat",
      heatDateMs: null,
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(HeatmapToggle));
  });
}

const channelButton = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(
    (b) => b.textContent === label,
  );

const slider = (): HTMLInputElement | null =>
  host.querySelector<HTMLInputElement>('input[type="range"]');

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function dragSliderTo(ms: number): Promise<void> {
  const input = slider();
  if (!input) throw new Error("no date slider mounted");
  await act(async () => {
    // React keeps its own value tracker per input: assigning `.value` directly
    // is invisible to it, so `onChange` never fires and the probe measures its
    // own blindness. The native setter is what a real drag goes through.
    const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (!native) throw new Error("no native value setter on HTMLInputElement");
    native.call(input, String(ms));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  root.unmount();
  host.remove();
});

describe("the TIME channel and its field", () => {
  it("offers TIME as the fourth channel of the same radiogroup", async () => {
    await mount(DATED_CITY);
    expect(channelButton("THREAT")).toBeDefined();
    expect(channelButton("CX")).toBeDefined();
    expect(channelButton("CHURN")).toBeDefined();
    const time = channelButton("TIME");
    expect(time, "the fourth channel exists").toBeDefined();
    expect(host.querySelectorAll('button[role="radio"]')).toHaveLength(4);
  });

  it("the date field stands ONLY while TIME is picked — no fifth surface", async () => {
    await mount(DATED_CITY);
    expect(slider(), "no slider while THREAT is active").toBeNull();
    expect(host.textContent).not.toMatch(/stood at/);
    await click(channelButton("TIME")!);
    expect(slider(), "slider while TIME is active").not.toBeNull();
    await click(channelButton("CHURN")!);
    expect(slider(), "slider gone after leaving TIME").toBeNull();
  });

  it("picking TIME asks the scan moment first", async () => {
    await mount(DATED_CITY);
    await click(channelButton("TIME")!);
    expect(useStore.getState().heatChannel).toBe("time");
    expect(useStore.getState().heatDateMs).toBe(SCAN_MS);
    expect(slider()!.value).toBe(String(SCAN_MS));
  });

  it("says the census the field claims — stood of files, at the date", async () => {
    await mount(DATED_CITY);
    await click(channelButton("TIME")!);
    const date = formatDate("en", SCAN_MS);
    const census = `2 of 3 files stood at ${date}`;
    expect(host.textContent).toContain(census);
    // the number once: the same sentence must not be printed twice on the plate
    const hits = host.querySelectorAll("span");
    let said = 0;
    hits.forEach((s) => {
      if (s.textContent && s.textContent.includes("files stood")) said++;
    });
    expect(said, "the census stands once").toBe(1);
  });

  it("moves the census with the date — one day before 'new.ts' one file less stood", async () => {
    await mount(DATED_CITY);
    await click(channelButton("TIME")!);
    const asked = SCAN_MS - 3 * DAY;
    await dragSliderTo(asked);
    await settle(COMMIT_MS + 50);
    expect(host.textContent).toContain(`1 of 3 files stood at ${formatDate("en", asked)}`);
  });

  it("in German the sentence and the date follow the UI language", async () => {
    await mount(DATED_CITY, "de");
    await click(channelButton("TIME")!);
    expect(host.textContent).toContain(`2 von 3 Dateien standen am ${formatDate("de", SCAN_MS)}`);
    expect(host.textContent, "no English census in the German plate").not.toMatch(/files stood/);
  });

  it("names the limit: deletions before the scan are not in this city, undated files are not 'not yet'", async () => {
    await mount(DATED_CITY);
    await click(channelButton("TIME")!);
    expect(host.textContent).toMatch(/deleted before the scan/);
    expect(host.textContent).toMatch(/without a git date \(1\)/);
  });

  it("commits the date debounced — the thumb moves, the field rebuilds later", async () => {
    await mount(DATED_CITY);
    await click(channelButton("TIME")!);
    const asked = SCAN_MS - 30 * DAY;
    await dragSliderTo(asked);
    expect(useStore.getState().heatDateMs, "committed synchronously — per-frame rebuild risk").toBe(
      SCAN_MS,
    );
    // keep dragging: the timer restarts, nothing commits mid-drag
    await dragSliderTo(asked + DAY);
    await settle(120);
    expect(useStore.getState().heatDateMs).toBe(SCAN_MS);
    await settle(COMMIT_MS + 100);
    expect(useStore.getState().heatDateMs, "committed after the debounce fired").toBe(asked + DAY);
  });

  it("is keyboard reachable and its aria-label carries the word", async () => {
    await mount(DATED_CITY, "de");
    await click(channelButton("TIME")!);
    const input = slider()!;
    expect(input.getAttribute("aria-label")).toMatch(/Datum/);
    // native range inputs move with the arrow keys — step is one calendar day
    expect(input.step).toBe(String(DAY));
    expect(input.min).toBe(String(SCAN_MS - 60 * DAY));
    expect(input.max).toBe(String(SCAN_MS));
  });

  it("disables TIME without a scan moment — no invented rail, click changes nothing", async () => {
    await mount(NO_MOMENT_CITY);
    const time = channelButton("TIME")!;
    expect(time.getAttribute("aria-disabled")).toBe("true");
    expect(time.dataset.tip).toMatch(/scan moment|Scan-Moment/);
    await click(time);
    expect(useStore.getState().heatChannel).toBe("threat");
    expect(slider()).toBeNull();
  });

  it("disables TIME when the payload never collected git dates", async () => {
    await mount(NO_CHURN_CITY);
    const time = channelButton("TIME")!;
    expect(time.getAttribute("aria-disabled")).toBe("true");
    await click(time);
    expect(useStore.getState().heatChannel).toBe("threat");
  });
});

describe("the block rail of the time channel", () => {
  it("reads a district's stood-share from its whole subtree", async () => {
    // subtreeTimeShare is imported here (not mocked) so the block aggregation
    // is pinned next to the decision it is built from: undated files may not
    // vote, and a subtree with nothing to say is null, not zero.
    const { subtreeTimeShare } = await import("../src/components/HeatCells");
    const dated = dir({
      path: "src",
      detailFiles: [
        file("src/a.ts", "TypeScript", [], undefined, { firstCommitAt: SCAN_MS - 10 * DAY }),
        file("src/b.ts", "TypeScript", [], undefined, { firstCommitAt: SCAN_MS - DAY }),
        file("src/c.ts", "TypeScript", [], undefined, { firstCommitAt: undefined }),
      ],
    });
    expect(subtreeTimeShare(dated, SCAN_MS - 5 * DAY, CHURN_META)).toBe(0.5);
    const silent = dir({
      path: "x",
      detailFiles: [file("x.ts", "TypeScript", [], undefined, { firstCommitAt: undefined })],
    });
    expect(subtreeTimeShare(silent, SCAN_MS, CHURN_META)).toBeNull();
  });
});
