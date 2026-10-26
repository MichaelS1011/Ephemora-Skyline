// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 6 — the X-ray state: „Ich sehe einen Turm an und will ohne Umweg die
 * Rohzahlen, die ihn formen." What this file pins:
 *
 * (a) ONE NUMBER, ONE ORIGIN — the plate reads the same `CityFile` through
 *     the same `findFileById` lookup and the same formatting steps the
 *     dossier uses; a value equal to the panel's is the positive check, and
 *     the source-level cross-read of the same field names is the drift guard.
 * (b) NOT-DELIVERED ≠ 0 — a field the payload does not carry renders no row
 *     at all (positive control 2026-10-26: replacing the null branch with
 *     `?? 0` turns exactly these cases red; see the round report), while a
 *     DELIVERED zero — `importCount: 0` means "looked, found nothing" —
 *     still prints.
 * (c) KEY-BOUND ONLY, BUDGET HOLDS — the plate exists only between keydown
 *     and keyup; at rest it paints nothing, so the arrival budget's four
 *     standing surfaces (`arrival-budget.test.tsx`) are untouched.
 * (d) LISTED AND HANDLED — the row names `components/HudOverlay.tsx`, the
 *     HUD handles `KeyX`, and the registry's HANDLER_FILES now scans the HUD
 *     too, so both directions of the keyboard sentinel cover this binding.
 */

vi.mock("@react-three/fiber", async () => {
  const { createElement: h } = await import("react");
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) =>
      h("div", { "data-canvas": "true" }, children),
    useFrame: () => {},
    useThree: () => ({
      camera: { position: { set() {} }, rotation: {} },
      gl: { domElement: null },
    }),
  };
});
vi.mock("@react-three/postprocessing", () => ({
  EffectComposer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Bloom: () => null,
  ToneMapping: () => null,
}));
vi.mock("postprocessing", () => ({ ToneMappingMode: { ACES_FILMIC: 1 } }));
vi.mock("../src/components/CityScene", () => ({ CityScene: () => null }));

import { city, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import { HudOverlay } from "../src/components/HudOverlay";
import { XrayRaw, xrayFacts, XRAY_GRADES } from "../src/components/XrayRaw";
import { DICT, formatCount, formatDecimal, t, type DictKey } from "../src/i18n";
import { ROWS } from "../src/interaction/shortcuts";

/** A tower whose payload carries everything X-ray reads. */
const RICH = file(
  "src/api/routes.ts",
  "TypeScript",
  [
    finding({ severity: "P0" }),
    finding({ severity: "P1" }),
    finding({ severity: "P1" }),
    finding({ severity: "P2" }),
  ],
  undefined,
  {
    linesOfCode: 1234,
    cyclomaticComplexity: 17,
    importCount: 21,
    churnScore: 0.62,
    coveragePct: 88,
  },
);
/** A payload from before churn, imports and coverage existed: silent fields. */
const SPARSE = file("src/quiet.ts", "TypeScript", [], undefined, {
  linesOfCode: 40,
  cyclomaticComplexity: 1,
});
/** A reader looked and found nothing: a delivered zero, not a missing field. */
const NO_IMPORTS = file("src/entry.ts", "TypeScript", [], undefined, {
  linesOfCode: 12,
  cyclomaticComplexity: 1,
  importCount: 0,
});
const CITY = city({ files: [RICH, SPARSE, NO_IMPORTS] });

let host: HTMLDivElement | undefined;
let root: Root | undefined;

function mount(lang: "en" | "de" = "en", over: Record<string, unknown> = {}): void {
  const init = useStore.getInitialState();
  useStore.setState(
    {
      ...init,
      prefs: { ...init.prefs, lang },
      cityData: CITY,
      buildPhase: "built",
      ...over,
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(HudOverlay, { apiStatus: "live" })));
}

const plate = (): Element | null => host!.querySelector(".xray-raw");

const pressX = (type: "keydown" | "keyup"): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { code: "KeyX", key: "x", bubbles: true }));
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("(c) the X-ray is a key, not a surface", () => {
  it("paints nothing at rest — arrival keeps its four standing surfaces", () => {
    mount("en", { hoveredId: RICH.id });
    expect(plate(), "no key was held, so nothing may stand on the screen").toBeNull();
    // Landing: HudOverlay itself is unmounted, so the key has no listener.
    const init = useStore.getInitialState();
    useStore.setState({ ...init, cityData: null }, true);
    const bare = document.createElement("div");
    document.body.append(bare);
    const bareRoot = createRoot(bare);
    act(() => bareRoot.render(createElement(HudOverlay, { apiStatus: "live" })));
    expect(bare.querySelector(".xray-raw")).toBeNull();
    act(() => bareRoot.unmount());
    bare.remove();
  });

  it("exists only between keydown and keyup, on the hovered tower", () => {
    mount("en", { hoveredId: RICH.id });
    pressX("keydown");
    const p = plate();
    expect(p, "held: the plate stands").not.toBeNull();
    const text = (p!.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("routes.ts");
    expect(text).toContain(`lines ${formatCount("en", 1234)}`); // 1,234 — the panel's own step
    expect(text).toContain(`branches ${formatCount("en", 17)}`);
    expect(text).toContain(`imports ${formatCount("en", 21)}`);
    expect(text).toContain(`findings 1 Critical · 2 High · 1 Medium`);
    expect(text).toContain(`churn ${formatDecimal("en", 0.62, 2)}`); // 0.62
    expect(text).toContain(t("en", "xray.coverageValue", { pct: formatCount("en", 88) })); // 88 %
    pressX("keyup");
    expect(plate(), "released: the plate is gone — no standing panel").toBeNull();
    pressX("keydown");
    expect(plate(), "the binding holds a second time").not.toBeNull();
    pressX("keyup");
  });

  it("falls back to the keyboard's selection when no pointer hovers", () => {
    mount("en", { hoveredId: null, selectedUnit: { kind: "file", id: SPARSE.id } });
    pressX("keydown");
    expect(plate()!.textContent).toContain("quiet.ts");
    pressX("keyup");
  });

  it("is a letter, not a chord: Ctrl/Meta and typing in fields leave it alone", () => {
    mount("en", { hoveredId: RICH.id });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyX", key: "x", metaKey: true, bubbles: true }),
      );
    });
    expect(plate()).toBeNull();
    const input = document.createElement("input");
    document.body.append(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyX", key: "x", bubbles: true }));
    });
    expect(plate(), "an X written into a field is not a command").toBeNull();
    input.remove();
  });
});

describe("(b) not delivered is not zero", () => {
  it("shows no row and no digit for fields the payload never carried", () => {
    const rows = xrayFacts(SPARSE, "en");
    for (const field of ["importCount", "churnScore", "coveragePct"]) {
      expect(rows.find((r) => r.field === field)!.value, field).toBeNull();
    }
    mount("en", { hoveredId: SPARSE.id });
    pressX("keydown");
    const p = plate()!;
    expect(p.querySelector('[data-xray-row="churnScore"]')).toBeNull();
    expect(p.querySelector('[data-xray-row="coveragePct"]')).toBeNull();
    expect(p.querySelector('[data-xray-row="importCount"]')).toBeNull();
    const text = p.textContent ?? "";
    expect(text).not.toMatch(/churn/i);
    expect(text).not.toMatch(/coverage/i);
    expect(text).not.toMatch(/imports/i);
    // …and the fields that WERE delivered still print their numbers.
    expect(text).toContain("lines");
    expect(text).toContain("branches");
    pressX("keyup");
  });

  it("keeps a delivered zero — looked-and-found-nothing is an answer", () => {
    const row = xrayFacts(NO_IMPORTS, "en").find((r) => r.field === "importCount")!;
    expect(row.value).toBe(formatCount("en", 0));
    mount("en", { hoveredId: NO_IMPORTS.id });
    pressX("keydown");
    expect(plate()!.querySelector('[data-xray-row="importCount"]')).not.toBeNull();
    pressX("keyup");
  });

  it("counts findings from the file's own list, never from a second census", () => {
    // The grades worst-first, only those present — 0 findings is the computed
    // truth of an empty list, not an invented field.
    expect(xrayFacts(RICH, "en").find((r) => r.field === "findings")!.value).toBe(
      "1 Critical · 2 High · 1 Medium",
    );
    expect(xrayFacts(SPARSE, "en").find((r) => r.field === "findings")!.value).toBe("0");
    expect(xrayFacts(SPARSE, "de").find((r) => r.field === "findings")!.value).toBe("0");
  });
});

describe("(a) one number, one origin", () => {
  const xray = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/XrayRaw.tsx"),
    "utf8",
  );
  const panel = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/InfoPanel.tsx"),
    "utf8",
  );

  it("reads the same lookup the dossier opens", () => {
    expect(xray).toContain("findFileById(cityData");
    expect(panel).toContain("findFileById(cityData");
    expect(xray).not.toMatch(/\bfetch\(|XMLHttpRequest/);
  });

  it("names the same payload fields the panel prints", () => {
    for (const field of [
      "file.linesOfCode",
      "file.cyclomaticComplexity",
      "file.churnScore",
      "file.coveragePct",
      "file.findings",
    ] as const) {
      expect(xray, `X-ray reads ${field}`).toContain(field);
      expect(panel, `the panel reads ${field} too — same origin`).toContain(field);
    }
  });

  it("formats with the same steps, in both languages", () => {
    for (const lang of ["en", "de"] as const) {
      const rows = xrayFacts(RICH, lang);
      expect(rows.find((r) => r.field === "linesOfCode")!.value).toBe(
        formatCount(lang, RICH.linesOfCode),
      );
      expect(rows.find((r) => r.field === "churnScore")!.value).toBe(
        formatDecimal(lang, RICH.churnScore!, 2),
      );
    }
    mount("de", { hoveredId: RICH.id });
    pressX("keydown");
    const text = plate()!.textContent ?? "";
    expect(text).toContain("1.234"); // the German thousands dot, the panel's own formatCount
    expect(text).toContain("0,62"); // the German decimal comma
    expect(text).toContain("1 Kritisch · 2 Hoch · 1 Mittel");
    pressX("keyup");
  });
});

describe("(d) listed and handled — the sentinel sees the whole pair", () => {
  const registry = readFileSync(
    path.resolve(import.meta.dirname, "../tests/keyboardRegistry.test.ts"),
    "utf8",
  );

  it("the plan lists X and names the HUD as its owner", () => {
    const row = ROWS.find((r) => r.id === "xrayRaw");
    expect(row, "a bound key without a row is the defect the registry exists for").toBeDefined();
    expect(row!.codes).toContain("X");
    expect(row!.owner).toBe("components/HudOverlay.tsx");
    expect(row!.text.en.length).toBeGreaterThan(0);
    expect(/[A-Za-zÄÖÜäöüß]/.test(row!.text.de)).toBe(true);
    expect(DICT[row!.text.key as DictKey]?.en).toBeTruthy();
    expect(DICT[row!.text.key as DictKey]?.de).toBeTruthy();
  });

  it("the HUD actually handles KeyX, and the registry scans the HUD", () => {
    const hud = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/HudOverlay.tsx"),
      "utf8",
    );
    const handled = hud
      .split("\n")
      .filter((line) => /\.code\b/.test(line))
      .some((line) => /"KeyX"/.test(line));
    expect(handled, "the row claims an owner that does not answer the key").toBe(true);
    expect(registry, "without this the handled-but-unlisted direction stays blind").toContain(
      '"components/HudOverlay.tsx"',
    );
  });
});

describe("the plate is ladder, floor and words", () => {
  /** The house rule: WCAG relative luminance over the plate's own paint. */
  const lin = (c: number): number =>
    c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4);
  const lum = (rgb: number[]): number =>
    0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
  const contrast = (a: number[], b: number[]): number => {
    const la = lum(a);
    const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  it("keeps 4.5:1 for both inks over the brightest ground the city can put under it", () => {
    const globals = readFileSync(
      path.resolve(import.meta.dirname, "../src/design/globals.css"),
      "utf8",
    );
    const metaStrong = hex(globals.match(/--meta-strong:\s*(#[0-9a-fA-F]{6})/)![1]!);
    const colorText = hex(globals.match(/--color-text:\s*(#[0-9a-fA-F]{6})/)![1]!);
    const rgba = globals
      .match(/--material-read-bg:\s*rgba\(([^)]+)\)/)![1]!
      .split(",")
      .map((s) => Number(s.trim()));
    // glas-chrome's own worst case: the plaza at #e6e1d4 seen THROUGH the plate.
    const ground = hex("#e6e1d4");
    const a = rgba[3]!;
    const plateRgb = [0, 1, 2].map((i) => rgba[i]! * a + ground[i]! * (1 - a));
    expect(contrast(metaStrong, plateRgb), "labels over the plate").toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorText, plateRgb), "numbers over the plate").toBeGreaterThanOrEqual(4.5);
  });

  it("stands on the type floor, not below it", () => {
    const xray = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/XrayRaw.tsx"),
      "utf8",
    );
    expect(xray).toContain("text-[length:var(--fs-meta)]");
    expect(xray).not.toMatch(/text-\[\d+px\]/);
    // Token hygiene: no hand-typed hex outside the documented WebGL layer.
    expect(xray).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("never moves — no transition, no keyframe, reduced-motion trivially held", () => {
    const code = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/XrayRaw.tsx"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/transition|animation|keyframes/);
  });

  it("says in its name what appears, in both languages", () => {
    for (const lang of ["en", "de"] as const) {
      mount(lang, { hoveredId: RICH.id });
      pressX("keydown");
      const label = plate()!.getAttribute("aria-label") ?? "";
      expect(label).toContain("routes.ts");
      expect(label).toContain(t(lang, "xray.lines"));
      pressX("keyup");
    }
    mount("en", { hoveredId: null, selectedUnit: null });
    pressX("keydown");
    const p = plate()!;
    expect(p.getAttribute("data-xray-state")).toBe("no-target");
    expect(p.textContent).toContain(t("en", "xray.holdHint"));
    pressX("keyup");
    mount("de", { hoveredId: null, selectedUnit: null });
    pressX("keydown");
    expect(plate()!.textContent).toContain(t("de", "xray.holdHint"));
    pressX("keyup");
  });

  it("X-ray is a tower instrument: a marked district shows the hint, not a fake row", () => {
    mount("en", { hoveredId: "block:src" });
    pressX("keydown");
    expect(plate()!.getAttribute("data-xray-state")).toBe("no-target");
    pressX("keyup");
  });

  it("every label the plate prints carries EN and DE", () => {
    const keys: DictKey[] = [
      ...XRAY_GRADES.map((g) => g.labelKey),
      "xray.lines",
      "xray.branches",
      "xray.imports",
      "xray.findings",
      "xray.churn",
      "xray.coverage",
      "xray.coverageValue",
      "xray.aria",
      "xray.holdHint",
      "hints.xrayRaw",
    ];
    for (const key of keys) {
      expect(DICT[key]?.en.trim(), key).not.toBe("");
      expect(DICT[key]?.de.trim(), key).not.toBe("");
    }
  });
});

/** The component is only ever mounted while the key is held; exported for
 *  the source-level guards above reading its file and for direct smoke use. */
describe("XrayRaw smoke (held state = mounted)", () => {
  it("renders nothing without a city", () => {
    const init = useStore.getInitialState();
    useStore.setState({ ...init, cityData: null }, true);
    const bare = document.createElement("div");
    document.body.append(bare);
    const r = createRoot(bare);
    act(() => r.render(createElement(XrayRaw)));
    expect(bare.querySelector(".xray-raw")).toBeNull();
    act(() => r.unmount());
    bare.remove();
  });
});
