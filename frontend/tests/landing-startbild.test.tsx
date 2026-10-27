// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { t, type Lang } from "../src/i18n";
import { Landing } from "../src/components/Landing";
import { ArrivalProgress } from "../src/components/ArrivalProgress";

/**
 * Auftrag #27 + #30 — the start picture's own guard (experience lane).
 *
 * #27: the flat portrait left the entry surface. What remains in the right
 * column is the image that carries what the words explain (the schematic
 * city), and the figure is still reachable in 3D from this labeled line and,
 * inside a city, from the dock's menu (§04.11, guarded in
 * ephe-preview.test.tsx). If a portrait ever returns to the landing, this
 * file says so.
 *
 * #30: the step bar is one shape for all its entries, and the last entry
 * names the action that really follows — the folder button's own words, in
 * both languages. Click and keyboard paths are unchanged (the beats' tests
 * live in welcome-state and arrival-progress).
 */

// jsdom has no WebGL; the vitrine's canvas is stubbed exactly as
// ephe-preview.test.tsx does — this file only asks whether the door opens.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-stub-canvas>{children}</div>,
  useFrame: () => undefined,
}));
vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children?: React.ReactNode }) => <div data-stub-html>{children}</div>,
}));

let host: HTMLDivElement;
let root: Root;

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response),
  );
}

async function mountLanding(): Promise<void> {
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

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  stubFetch();
  // the plain landing — where the right column stands
  useStore.setState({ ...useStore.getInitialState(), firstRun: false }, true);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
});

describe("the start picture carries its explanation (#27)", () => {
  it("holds no flat portrait on the entry surface", async () => {
    await mountLanding();
    expect(host.querySelector(".start-ephe")).toBeNull();
  });

  it("lets the plate carry the image that shows what the words explain", async () => {
    await mountLanding();
    const visual = host.querySelector(".landing-visual");
    expect(visual).not.toBeNull();
    expect(visual?.querySelector(".city-illustration .start-plate")).not.toBeNull();
  });

  it("keeps the figure's 3D entrance on the landing, and it opens", async () => {
    await mountLanding();
    const open = host.querySelector<HTMLButtonElement>(".start-ephe-open");
    expect(
      open,
      "the labeled 3D line is gone — the vitrine would be unreachable here",
    ).not.toBeNull();
    await act(async () => {
      open?.click();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(useStore.getState().showEpheVitrine).toBe(true);
  });
});

/**
 * #35 — the door into the figure's vitrine belongs to the plate it opens.
 * It used to stand on the empty ground below the frame, where it read as the
 * caption of the portrait that #27 removed.
 */
describe("the resident's door belongs to the plate it opens (#35)", () => {
  it("stands inside the plate, under its caption", async () => {
    await mountLanding();
    const plate = host.querySelector(".start-plate");
    const open = host.querySelector(".start-plate .start-ephe-open");
    expect(open, "the 3D line left the plate — it is a door, not a footer").not.toBeNull();
    const caption = plate?.querySelector("figcaption");
    const nodes = Array.from(plate?.children ?? []);
    expect(
      caption && open
        ? nodes.indexOf(caption as HTMLElement) < nodes.indexOf(open as HTMLElement)
        : false,
      "the door sits above the caption it is supposed to follow",
    ).toBe(true);
  });

  it("names itself with the word alone, not with the glyph", async () => {
    await mountLanding();
    const open = host.querySelector<HTMLButtonElement>(".start-plate .start-ephe-open");
    expect(open).not.toBeNull();
    // A CSS `content` glyph lands in the accessible name (measured in Chrome:
    // "▸See the resident in 3D"), so the mark is a real node and hidden.
    const marks = open?.querySelectorAll("[aria-hidden='true']") ?? [];
    expect(marks.length, "the glyph is not a hideable node").toBe(1);
    const name =
      Array.from(open?.childNodes ?? [])
        .filter((n) => !(n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true"))
        .map((n) => n.textContent ?? "")
        .join("")
        .trim() ?? "";
    expect(name).toBe(t("en", "landing.previewOpen"));
  });
});

/**
 * #36 — the ground speaks for itself. The plate explained itself in eight
 * text lines (50 words EN); the longest, the street note, restated in 17
 * words what the moving picture already shows — and it did so at the one
 * spot on the screen whose background is not the plate's own: measured on
 * the delivered frame, 5 % of the pixels behind it fell to ≤2,8:1 against
 * its ink (worst 1,0:1), so it could not hold AA. The line and its copy are
 * gone in both languages; the guard below says so if either returns.
 */
describe("the ground behind the start picture carries no caption (#36)", () => {
  it("renders no street note over the moving ground", async () => {
    await mountLanding();
    expect(host.querySelector(".start-street-note")).toBeNull();
    expect(host.textContent).not.toContain("plots and streets");
  });

  it("keeps the sentence out of the bridge in both languages", () => {
    const src = readFileSync(join(import.meta.dirname, "../src/components/startCopy.ts"), "utf-8");
    expect(src).not.toContain("landing.streetNote");
    expect(src).not.toContain("Grundstücke und Straßen");
  });
});

describe("the step bar is one shape, and the last entry names the real next action (#30)", () => {
  function bar(lang: Lang): HTMLDivElement {
    const el = document.createElement("div");
    document.body.append(el);
    const r = createRoot(el);
    act(() => {
      r.render(<ArrivalProgress lang={lang} stage="welcome" />);
    });
    const holder = el.firstChild as HTMLDivElement;
    afterEachBar.push(() => {
      act(() => r.unmount());
      el.remove();
    });
    return holder;
  }
  const afterEachBar: Array<() => void> = [];
  afterEach(() => {
    while (afterEachBar.length > 0) (afterEachBar.shift() as () => void)();
  });

  for (const lang of ["en", "de"] as const) {
    it(`gives every entry a dot in ${lang}`, () => {
      const el = bar(lang);
      const lis = [...el.querySelectorAll("li")];
      expect(lis).toHaveLength(3);
      for (const li of lis) {
        expect(
          li.querySelector(".start-progress-dot"),
          `${li.textContent}: kein Punkt`,
        ).not.toBeNull();
      }
      // no bare sentence hangs beside the rings any more
      expect(el.querySelector(".start-progress-next")).toBeNull();
    });

    it(`names the folder action in the button's own words (${lang})`, () => {
      const el = bar(lang);
      const lis = [...el.querySelectorAll("li")];
      const last = lis[2] as HTMLLIElement;
      expect(last.textContent).toContain(t(lang, "landing.primary"));
      expect(last.getAttribute("data-state")).toBe("todo");
      // its state is a word, not only a dot
      expect(last.getAttribute("aria-label")).toContain(t(lang, "landing.arrivalTodo"));
    });
  }
});
