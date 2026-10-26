// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EPHE_MARK_COLOUR,
  EPHE_MARK_LIFT,
  EPHE_MARK_RADIUS,
  EPHE_MARK_Y,
  EPHE_PREVIEW_FOV,
  EPHE_PREVIEW_LIMBS,
  EPHE_PREVIEW_OUTFIT,
  EPHE_PREVIEW_SPIN,
  buildEphePreview,
  coatRadiusAt,
  epheMarkPosition,
  ephePreviewFill,
  epheTurnFromDrag,
  epheTurnFromKey,
} from "../src/components/EphePreview";
import {
  FIGURE,
  LIMB_SLOTS,
  writeEpheLimbPose,
  type EpheLimbPose,
} from "../src/components/Pedestrians";
import { NAME_MAX } from "../src/epheNames";
import { EPHE_MARKS, EPHE_PALETTE, ENV, epheOutfit } from "../src/city/palette";
import { contrast, dE } from "./colourMath";
import { t } from "../src/i18n";
import { EPHE_LOOK_VARIANTS } from "../src/components/EpheLookControls";
import { useStore } from "../src/stores/useStore";
import { Landing } from "../src/components/Landing";

/**
 * MASTER-2027 §04.02 — the isolated 3D preview must show the SHIPPED figure.
 *
 * A second drawing of a resident is the "second architecture" §22 forbids, and
 * the only defence is arithmetic: every number the preview places a body with
 * has to be the crowd's number, read from `FIGURE`/`writeEpheLimbPose`, and every
 * colour has to be a member of `EPHE_PALETTE`. The limb radii are the one place
 * the crowd's loop still carries literals — so they are pinned against that
 * loop's own source, which is the same discipline `footprintPanel.test.ts` uses.
 *
 * The renderer itself is stubbed here (jsdom has no WebGL); what the stub cannot
 * prove — that two live contexts hold their frame pacing — is measured against
 * the running app, not claimed by this file.
 */

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-stub-canvas>{children}</div>,
  useFrame: () => undefined,
}));

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children?: React.ReactNode }) => <div data-stub-html>{children}</div>,
}));

const pose = (side: -1 | 1): EpheLimbPose => {
  const p: EpheLimbPose = {
    footX: 0,
    footY: 0,
    footZ: 0,
    handX: 0,
    handY: 0,
    handZ: 0,
    kneeForward: 0,
  };
  writeEpheLimbPose(p, 0, side, "idle", 0);
  return p;
};

const bone = (key: string) => buildEphePreview().find((b) => b.key === key);

describe("the preview body is the crowd body", () => {
  it("hangs the sleeve from the shipped shoulder", () => {
    const b = bone("sleeve-1");
    expect(b).toBeDefined();
    // the bone's far end is the hand; its near end is the shoulder, and the
    // midpoint plus the direction has to reproduce both
    const p = pose(1);
    const shoulder: [number, number, number] = [
      FIGURE.shoulderWidth,
      FIGURE.bodyY + FIGURE.shoulderY,
      0,
    ];
    const hand: [number, number, number] = [p.handX, p.handY, p.handZ];
    expect(b?.position).toEqual([
      (shoulder[0] + hand[0]) / 2,
      (shoulder[1] + hand[1]) / 2,
      (shoulder[2] + hand[2]) / 2,
    ]);
    expect(b?.scale[1]).toBeCloseTo(
      Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]) / 2,
      6,
    );
  });

  it("stands the boots where the idle pose puts the feet", () => {
    for (const side of [-1, 1] as const) {
      const b = bone(`boot-${side}`);
      const p = pose(side);
      expect(b?.position).toEqual([p.footX, p.footY, p.footZ]);
    }
  });

  it("bends the knee forward by the pose's own lead", () => {
    const p = pose(1);
    const thigh = bone("thigh-1");
    const hip: [number, number, number] = [FIGURE.hipWidth, FIGURE.hipY, 0];
    const foot: [number, number, number] = [p.footX, p.footY, p.footZ];
    const knee: [number, number, number] = [
      (hip[0] + foot[0]) / 2,
      FIGURE.kneeY,
      (hip[2] + foot[2]) / 2 + p.kneeForward,
    ];
    expect(thigh?.position).toEqual([
      (hip[0] + knee[0]) / 2,
      (hip[1] + knee[1]) / 2,
      (hip[2] + knee[2]) / 2,
    ]);
    expect(p.kneeForward).toBeGreaterThan(0);
  });

  it("draws ten limbs and a cap's worth of parts, the crowd's eleven slots", () => {
    // 2 boots, 2 sleeves, 2 hands, 2 thighs, 2 shins = 10 bones; the cap is the
    // crowd's eleventh slot and is placed by FIGURE in the component itself.
    expect(buildEphePreview()).toHaveLength(LIMB_SLOTS - 1);
  });

  it("uses no colour the palette does not carry", () => {
    const family = [
      ...EPHE_PALETTE.jackets,
      ...EPHE_PALETTE.sleeves,
      ...EPHE_PALETTE.trousers,
      ...EPHE_PALETTE.shells,
      ...EPHE_PALETTE.hair,
      EPHE_PALETTE.eyes,
      EPHE_PALETTE.boots,
      EPHE_PALETTE.contact,
    ];
    for (const c of Object.values(EPHE_PREVIEW_OUTFIT)) {
      expect(family, `${c} is not a shipped Ephe colour`).toContain(c);
    }
  });

  it("keeps the outfit index-aligned, as the crowd does", () => {
    // The sleeve is the one mass that overlaps the coat, so index 0 of `sleeves`
    // belongs with index 0 of `jackets` — a preview that mixed them would show a
    // contrast no resident ever wears.
    const j = EPHE_PALETTE.jackets.findIndex((c) => c === EPHE_PREVIEW_OUTFIT.coat);
    const s = EPHE_PALETTE.sleeves.findIndex((c) => c === EPHE_PREVIEW_OUTFIT.sleeve);
    expect(j).toBe(s);
    expect(j).toBe(0);
  });

  it("carries no limb size the crowd's loop does not use", () => {
    const crowd = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
      "utf-8",
    );
    const literals = [
      ...EPHE_PREVIEW_LIMBS.boot,
      EPHE_PREVIEW_LIMBS.thigh,
      EPHE_PREVIEW_LIMBS.shin,
      EPHE_PREVIEW_LIMBS.sleeve,
      EPHE_PREVIEW_LIMBS.hand,
    ];
    for (const n of new Set(literals)) {
      expect(crowd, `${n} is not a number the crowd places limbs with`).toContain(String(n));
    }
  });

  it("frames the whole body, not a cropped piece of it", () => {
    // The first build aimed the camera at the world origin while the body stood
    // above it: the head left the frame and the figure filled a fifth of the
    // stage (measured: 74 px of 340). Framing is arithmetic now, so it is
    // checked as arithmetic.
    const fill = ephePreviewFill();
    expect(fill, `${fill} of the stage height is not a preview`).toBeGreaterThanOrEqual(0.68);
    expect(fill).toBeLessThanOrEqual(0.9);
    const halfView = FIGURE.crown / 2 / fill;
    expect(FIGURE.crown / 2).toBeLessThan(halfView);
    expect(EPHE_PREVIEW_FOV).toBeLessThan(60);
  });
});

/**
 * §04.02, second pass — a preview you can turn.
 *
 * The first build only spun by itself, which makes it a screensaver with a
 * dialog around it. The hand owns the angle now; these are the two arithmetic
 * rules that decide by how much.
 */
describe("the turn answers a hand", () => {
  it("turns a degree per six pixels of drag", () => {
    // 386 px is the stage's own width: one sweep across it is most of a turn.
    expect(epheTurnFromDrag(0, 100)).toBeCloseTo(1, 6);
    expect(epheTurnFromDrag(0, 386)).toBeCloseTo(3.86, 6);
    expect(epheTurnFromDrag(2, -50)).toBeCloseTo(1.5, 6);
    expect(epheTurnFromDrag(1.25, 0)).toBe(1.25);
  });

  it("turns the same way on the arrow keys, and leaves other keys alone", () => {
    const right = epheTurnFromKey(0, "ArrowRight");
    expect(right).toBeGreaterThan(0);
    expect(epheTurnFromKey(right, "ArrowLeft")).toBeCloseTo(0, 10);
    expect(epheTurnFromKey(0.5, "Enter")).toBe(0.5);
    expect(epheTurnFromKey(0.5, "Escape")).toBe(0.5);
  });

  it("keeps the idle turn slow enough to look at", () => {
    // 0,5 rad/s is one turn in ~12 s: enough to read the third dimension, not
    // enough to make the figure a spinning top.
    expect(EPHE_PREVIEW_SPIN).toBeGreaterThanOrEqual(0.3);
    expect(EPHE_PREVIEW_SPIN).toBeLessThanOrEqual(0.8);
    expect((2 * Math.PI) / EPHE_PREVIEW_SPIN).toBeGreaterThan(7);
  });
});

/* ── the panel, with the renderer stubbed ─────────────────────────────────── */

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
  useStore.setState({ ...useStore.getInitialState(), firstRun: false });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
});

describe("the preview opens on ask and closes again", () => {
  it("mounts no second surface until someone asks", async () => {
    await mountLanding();
    expect(host.querySelector("[data-stub-canvas]")).toBeNull();
    expect(host.querySelector(".start-ephe-open")).not.toBeNull();
  });

  it("opens a dialog that holds the figure, and names itself", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    const panel = host.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(panel?.querySelector("[data-stub-canvas]")).not.toBeNull();
    // seven controls: close, the three jackets (§04.05/§04.06), the three marks
    // of §04.07 — one of which is "no mark", and that is a choice, not a gap
    expect(panel?.querySelectorAll("button")).toHaveLength(7);
  });

  it("gives the stage to the keyboard as well as the mouse", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    const stage = host.querySelector<HTMLElement>(".ephe-preview-stage");
    expect(stage).not.toBeNull();
    expect(stage?.getAttribute("tabindex")).toBe("0");
    expect(stage?.getAttribute("role")).toBe("group");
    expect((stage?.getAttribute("aria-label") ?? "").length).toBeGreaterThan(8);
    // a key the stage does not use must not be swallowed
    await act(async () => {
      stage?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("keeps the Tab inside the dialog", async () => {
    // `aria-modal` promises the page behind is not next. Two controls live here,
    // so the wrap is written rather than trusted to the browser.
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(host.contains(document.activeElement)).toBe(false);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    });
    expect(host.contains(document.activeElement)).toBe(true);
    const first = document.activeElement;
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    });
    expect(document.activeElement).not.toBe(first);
    expect(host.contains(document.activeElement)).toBe(true);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    });
    expect(document.activeElement).toBe(first);
    outside.remove();
  });

  it("closes on its own button, on the backdrop, and on Escape", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".ephe-preview-close")?.click();
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    await act(async () => {
      (host.querySelector(".ephe-preview-backdrop") as HTMLElement).click();
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("leaves the arrival sequence alone while the preview owns Escape", async () => {
    // A first visit with the panel open: Escape closes the panel, it does not
    // end the introduction behind it.
    useStore.setState({ ...useStore.getInitialState(), firstRun: true });
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector(".landing-welcome")).not.toBeNull();
  });

  it("speaks both languages on every line it shows", () => {
    for (const key of [
      "landing.previewOpen",
      "landing.previewAria",
      "landing.previewTitle",
      "landing.previewCloseAria",
      "landing.previewNote",
      "landing.previewStageAria",
      "landing.previewNameHint",
      "landing.previewVariantAria",
      "landing.previewVariantSlate",
      "landing.previewVariantSerpentine",
      "landing.previewVariantSandstone",
    ] as const) {
      const en = t("en", key);
      const de = t("de", key);
      expect(en.length, `${key} has no English`).toBeGreaterThan(3);
      expect(de.length, `${key} has no German`).toBeGreaterThan(3);
      expect(de, `${key} is copied, not translated`).not.toBe(en);
    }
  });
});

/**
 * MASTER-2027 §04.04 — the name at the figure.
 *
 * The card has always shown the name in its own field; this puts the same word
 * above the resident, on the carrier the city already uses for a role mark. Two
 * claims matter: the tag holds exactly what the rule keeps (so the vitrine cannot
 * show a name the storage would refuse), and it is text — never markup.
 */
describe("the name appears at the resident (§04.04)", () => {
  async function openVitrine(): Promise<void> {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
  }

  const field = () => host.querySelector<HTMLInputElement>(".ephe-preview-name-input");
  const tag = () => host.querySelector(".ephe-name-tag");

  /** React tracks the input's own value, so a plain assignment can be ignored. */
  async function type(value: string): Promise<void> {
    const input = field();
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("shows no tag while nothing is named", async () => {
    await openVitrine();
    expect(field()).not.toBeNull();
    expect(tag()).toBeNull();
  });

  it("puts the typed name above the figure, as text", async () => {
    await openVitrine();
    await type("Atlas");
    expect(tag()?.textContent).toBe("Atlas");
    // a text node, not markup: the tag has no children of its own
    expect(tag()?.children).toHaveLength(0);
    expect(field()?.value).toBe("Atlas");
  });

  it("runs the same rule the resident card runs", async () => {
    await openVitrine();
    await type("a\u0000\u200bb\tline");
    expect(field()?.value).toBe("ab line");
    expect(tag()?.textContent).toBe("ab line");
  });

  it("knows which half of a newline is whose", async () => {
    // The field, not the rule, is the one that cannot hold a line break: HTML's
    // value sanitization for text inputs removes `\n` and `\r` before any script
    // sees them. So the rule's newline→space case is proven on the function
    // (`normaliseName("line1\nline2")` → "line1 line2", in ephe-names.test.ts)
    // and what the field can actually deliver is measured here — no claim that
    // the app did something the browser already did.
    await openVitrine();
    await type("x\ny");
    expect(field()?.value).toBe("xy");
    expect(tag()?.textContent).toBe("xy");
  });

  it("keeps a full-length name whole on the figure", async () => {
    await openVitrine();
    const long = "M".repeat(NAME_MAX);
    await type(long);
    expect([...(tag()?.textContent ?? "")]).toHaveLength(NAME_MAX);
  });

  it("drops the tag again when the name is taken back", async () => {
    await openVitrine();
    await type("Rex");
    expect(tag()).not.toBeNull();
    await type("\u200b");
    expect(tag()).toBeNull();
  });
});

/**
 * MASTER-2027 §04.05/§04.06 — jackets chosen by measurement.
 *
 * The vitrine may only offer a variant while the pair it comes from holds the
 * bands `EPHE_PALETTE` documents: a switch that could dress the resident in a
 * lost edge would be a control for un-making the figure. The floors below are not
 * round numbers, they are the measured minima of the eight shipped columns
 * (`kontraste.json`: arm against its own coat 1,79–2,09 · hem 1,44 · leg against
 * boot 1,40 · arm against the ground 1,78–2,08), reproduced by a probe that first
 * calibrated itself at 21,00 black-on-white and 4,54 for #767676.
 *
 * §04.06 added the rule that decides how many chips fit: distance is measured
 * between every PAIR on offer, not only against the shipped jacket.
 */
describe("the jacket switch (§04.05, §04.06)", () => {
  const BANDS = { arm: 1.79, hem: 1.44, boot: 1.4, ground: 1.78, pair: 10 } as const;

  it("offers the shipped family first, then the two that clear the line", () => {
    expect(EPHE_LOOK_VARIANTS.map((v) => v.index)).toEqual([0, 1, 7]);
    expect(EPHE_LOOK_VARIANTS[0]?.outfit).toEqual(EPHE_PREVIEW_OUTFIT);
  });

  it("holds every documented band, in every variant it offers", () => {
    for (const v of EPHE_LOOK_VARIANTS) {
      const o = v.outfit;
      expect(
        contrast(o.sleeve, o.coat),
        `index ${v.index}: arm against its own coat`,
      ).toBeGreaterThanOrEqual(BANDS.arm);
      expect(contrast(o.coat, o.trouser), `index ${v.index}: the hem`).toBeGreaterThanOrEqual(
        BANDS.hem,
      );
      expect(
        contrast(o.trouser, o.boot),
        `index ${v.index}: leg against boot`,
      ).toBeGreaterThanOrEqual(BANDS.boot);
      expect(
        contrast(o.sleeve, ENV.ground),
        `index ${v.index}: arm against the ground`,
      ).toBeGreaterThanOrEqual(BANDS.ground);
    }
  });

  it("takes the whole outfit from one column, never from several", () => {
    for (const v of EPHE_LOOK_VARIANTS) {
      const j = EPHE_PALETTE.jackets.findIndex((c) => c === v.outfit.coat);
      expect(j, `index ${v.index}: its coat is not a shipped jacket`).toBeGreaterThanOrEqual(0);
      expect(EPHE_PALETTE.sleeves.findIndex((c) => c === v.outfit.sleeve)).toBe(j);
      // and the pairing is not decoration: mixing across columns was measured at
      // 1,53:1 arm against coat, under the 1,78:1 the same arm holds on the floor.
      expect(v.outfit).toEqual(epheOutfit(j));
    }
  });

  it("keeps every pair of offered jackets a variant apart", () => {
    // Contrast cannot make this choice — all eight columns hold every band — so
    // the switch is decided on distance. §04.05 measured it against the shipped
    // jacket only; §04.06 has to measure it between the chips, because two chips
    // that are one jacket to each other are one chip too many. Measured pairwise
    // over the eight columns with the guard's own arithmetic: 3↔7 = 6,21 and
    // 2↔5 = 6,48 (rejected), 0↔6 = 2,94 and 0↔4 = 6,64 (rejected), while the
    // offered set sits at 12,86 · 20,58 · 21,20. The rejected pairs are pinned
    // below the line so 10 stays a boundary between two measured groups.
    const coats = EPHE_LOOK_VARIANTS.map((v) => v.outfit.coat);
    for (const [a, x] of coats.entries())
      for (const [b, y] of coats.entries())
        if (b > a)
          expect(dE(x!, y!), `chip ${a} against chip ${b}`).toBeGreaterThanOrEqual(BANDS.pair);
    expect(dE(EPHE_PALETTE.jackets[3]!, EPHE_PALETTE.jackets[7]!)).toBeLessThan(BANDS.pair);
    expect(dE(EPHE_PALETTE.jackets[2]!, EPHE_PALETTE.jackets[5]!)).toBeLessThan(BANDS.pair);
    expect(dE(EPHE_PALETTE.jackets[6]!, EPHE_PALETTE.jackets[0]!)).toBeLessThan(BANDS.pair);
    expect(dE(EPHE_PALETTE.jackets[4]!, EPHE_PALETTE.jackets[0]!)).toBeLessThan(BANDS.pair);
  });

  it("leaves a fourth chip on a band foot, and keeps that reason testable", () => {
    // Four chips ARE reachable by distance (0↔2 = 14,17 · 1↔2 = 21,93), but each
    // remaining candidate stands on a documented minimum: index 2 and index 5 put
    // leg against boot at exactly 1,40 and index 3 sits on the arm's 1,79 — and
    // index 3 is 6,21 from the offered 7 besides. §04.05 chose 7 over 3 for that
    // reason; the row keeps the same rule rather than inventing a new one.
    const legAgainstBoot = (i: number): number =>
      contrast(EPHE_PALETTE.trousers[i % EPHE_PALETTE.trousers.length]!, EPHE_PALETTE.boots);
    expect(legAgainstBoot(2)).toBeLessThan(1.42);
    expect(legAgainstBoot(5)).toBeLessThan(1.42);
    expect(contrast(EPHE_PALETTE.sleeves[3]!, EPHE_PALETTE.jackets[3]!)).toBeLessThan(1.8);
    expect(legAgainstBoot(1)).toBeGreaterThanOrEqual(1.42);
  });

  it("names every chip, in both languages", () => {
    for (const v of EPHE_LOOK_VARIANTS) {
      const en = t("en", v.label);
      expect(en.length, `index ${v.index} has no English name`).toBeGreaterThan(4);
      expect(t("de", v.label)).not.toBe(en);
    }
  });

  async function openSwitch(): Promise<HTMLButtonElement[]> {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    return [...host.querySelectorAll<HTMLButtonElement>(".ephe-variant")];
  }

  /** The coat is the first material the figure draws, and its colour is on it. */
  const wornCoat = (): string | null =>
    host.querySelector("meshStandardMaterial")?.getAttribute("color") ?? null;

  it("shows one chip per variant and presses the worn one", async () => {
    const chips = await openSwitch();
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    for (const c of chips) expect((c.getAttribute("aria-label") ?? "").length).toBeGreaterThan(4);
    expect(wornCoat()).toBe(EPHE_PALETTE.jackets[0]);
  });

  it("dresses the figure in whichever chip is pressed", async () => {
    const chips = await openSwitch();
    for (const [i, v] of EPHE_LOOK_VARIANTS.entries()) {
      await act(async () => {
        chips[i]?.click();
      });
      expect(
        chips.map((c) => c.getAttribute("aria-pressed")),
        `chip ${i}`,
      ).toEqual(EPHE_LOOK_VARIANTS.map((_, j) => (j === i ? "true" : "false")));
      expect(wornCoat(), `chip ${i}`).toBe(EPHE_PALETTE.jackets[v.index]);
    }
    // the sleeve moves with its own coat — the pair, not the coat alone
    expect(buildEphePreview("idle", epheOutfit(1)).find((b) => b.key === "sleeve-1")?.colour).toBe(
      EPHE_PALETTE.sleeves[1],
    );
  });

  it("keeps the name while the jacket changes", async () => {
    const chips = await openSwitch();
    const input = host.querySelector<HTMLInputElement>(".ephe-preview-name-input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      if (input && setter) {
        setter.call(input, "Rex");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(host.querySelector(".ephe-name-tag")?.textContent).toBe("Rex");
    await act(async () => {
      chips[2]?.click();
    });
    expect(host.querySelector(".ephe-name-tag")?.textContent).toBe("Rex");
    expect(wornCoat()).toBe(EPHE_PALETTE.jackets[7]);
  });

  it("wears the same jacket after closing and reopening", async () => {
    const chips = await openSwitch();
    await act(async () => {
      chips[2]?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".ephe-preview-close")?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    // §04.09 turned this promise around: the jacket and the mark come back, the
    // name still does not, and the note under the panel says which is which.
    expect(wornCoat()).toBe(EPHE_PALETTE.jackets[7]);
    expect(
      [...host.querySelectorAll<HTMLButtonElement>(".ephe-variant")].map((c) =>
        c.getAttribute("aria-pressed"),
      ),
    ).toEqual(["false", "false", "true"]);
  });
});

/**
 * MASTER-2027 §04.07 — a small optional mark.
 *
 * The brief asks for an *optional* Erkennungszeichen on a figure that stays
 * "klein, geometrisch, low-poly-treu", so the step is three states — none, dot,
 * diamond — and a patch that belongs to the body: placed off the coat's own
 * profile, inside the turning group, lit by the same rig. What would have been
 * easy to fake is the part that is tested: that the patch cannot sink into the
 * coat, and that the tone it wears is measured against every jacket on offer.
 */
describe("the optional mark (§04.07)", () => {
  it("ships without one, and counts none as a choice", () => {
    expect([...EPHE_MARKS]).toEqual(["none", "dot", "diamond"]);
    expect(epheMarkPosition("none")).toBeNull();
    expect(epheMarkPosition("dot")).not.toBeNull();
  });

  it("reads the coat's own surface instead of guessing a radius", () => {
    // `FIGURE.coat` is the body as (radius, height) pairs, so at a profile point
    // the interpolation has to return that point's radius exactly.
    const [r, y] = FIGURE.coat[4]!;
    expect(coatRadiusAt(y)).toBeCloseTo(r, 10);
    expect(coatRadiusAt(0)).toBeGreaterThan(coatRadiusAt(0.1));
    expect(coatRadiusAt(EPHE_MARK_Y)).toBeGreaterThan(0);
  });

  it("hangs the whole patch in front of the coat, at its lowest edge", () => {
    // The coat narrows as it rises, so the bottom of a flat patch is the point
    // where it could sink in — and a buried mark is half a mark.
    for (const kind of ["dot", "diamond"] as const) {
      const plane = coatRadiusAt(EPHE_MARK_Y) + EPHE_MARK_LIFT;
      const rim = coatRadiusAt(EPHE_MARK_Y - EPHE_MARK_RADIUS[kind]);
      expect(plane - rim, `${kind}: the patch would sink into the coat`).toBeGreaterThanOrEqual(
        0.0015,
      );
    }
  });

  it("wears a tone measured against every jacket on offer", () => {
    for (const v of EPHE_LOOK_VARIANTS) {
      expect(contrast(EPHE_MARK_COLOUR, v.outfit.coat), `index ${v.index}`).toBeGreaterThanOrEqual(
        2.4,
      );
    }
    // The nearest thing it could be mistaken for is the figure's own skin.
    expect(dE(EPHE_MARK_COLOUR, EPHE_PALETTE.shells[0]!)).toBeGreaterThanOrEqual(12);
    // And the one gold mark of this app stays what it is: the selection.
    expect(EPHE_MARK_COLOUR).not.toBe(EPHE_PALETTE.selection);
  });

  async function openVitrineWithMarks(): Promise<void> {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
  }

  /** The mark is the only thing in the vitrine wearing the helmet sand. */
  const wornMarks = (): number =>
    [...host.querySelectorAll("meshStandardMaterial")].filter(
      (m) => m.getAttribute("color") === EPHE_MARK_COLOUR,
    ).length;

  const markChips = (): HTMLButtonElement[] => [
    ...host.querySelectorAll<HTMLButtonElement>(".ephe-mark"),
  ];

  /** The coat is the first material the figure draws, and its colour is on it. */
  const wornCoat = (): string | null =>
    host.querySelector("meshStandardMaterial")?.getAttribute("color") ?? null;

  it("offers three marks and wears none of them at first", async () => {
    await openVitrineWithMarks();
    expect(markChips().map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(wornMarks()).toBe(0);
    // "Dot" is a whole name, so the floor is short — but no chip may be unnamed,
    // and three chips that answer to one name are three buttons too many
    const labels = markChips().map((c) => c.getAttribute("aria-label") ?? "");
    for (const l of labels) expect(l.length, "ein Feld ohne Namen").toBeGreaterThan(2);
    expect(new Set(labels).size).toBe(3);
  });

  it("puts the patch on the body when a mark is chosen, and takes it off again", async () => {
    await openVitrineWithMarks();
    const before = host.querySelectorAll("mesh").length;
    await act(async () => {
      markChips()[1]?.click();
    });
    expect(wornMarks()).toBe(1);
    expect(host.querySelectorAll("mesh").length).toBe(before + 1);
    expect(markChips().map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    await act(async () => {
      markChips()[2]?.click();
    });
    expect(wornMarks()).toBe(1);
    await act(async () => {
      markChips()[0]?.click();
    });
    expect(wornMarks()).toBe(0);
    expect(host.querySelectorAll("mesh").length).toBe(before);
  });

  it("keeps the jacket decision and the mark decision apart", async () => {
    await openVitrineWithMarks();
    await act(async () => {
      host.querySelectorAll<HTMLButtonElement>(".ephe-variant")[2]?.click();
      markChips()[1]?.click();
    });
    expect(wornCoat()).toBe(EPHE_PALETTE.jackets[7]);
    expect(wornMarks()).toBe(1);
    expect(markChips().map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("keeps the mark through a reopen, and the name through none", async () => {
    await openVitrineWithMarks();
    const chips = markChips();
    await act(async () => {
      chips[2]?.click();
    });
    expect(wornMarks()).toBe(1);
    const input = host.querySelector<HTMLInputElement>(".ephe-preview-name-input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      if (input && setter) {
        setter.call(input, "Rex");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".ephe-preview-close")?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-ephe-open")?.click();
    });
    // §04.09 — the look is on disk; the name never was.
    expect(wornMarks()).toBe(1);
    expect(markChips().map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(host.querySelector<HTMLInputElement>(".ephe-preview-name-input")?.value).toBe("");
    expect(host.querySelector(".ephe-name-tag")).toBeNull();
  });
});

/**
 * MASTER-2027 §04.10/§04.11 — one component, two homes, one choice.
 *
 * The vitrine and the resident card both mount `EpheLookControls`. The claim
 * worth testing is not that they look alike but that they cannot disagree: a
 * click in one has to show in the other, and both have to land in the same
 * browser key the crowd reads from.
 */
describe("the look controls stay one choice", () => {
  it("keeps two mounted copies in step, on disk and in state", async () => {
    const { EpheLookControls } = await import("../src/components/EpheLookControls");
    const a = document.createElement("div");
    const b = document.createElement("div");
    document.body.append(a, b);
    const ra = createRoot(a);
    const rb = createRoot(b);
    await act(async () => {
      ra.render(<EpheLookControls lang="en" />);
      rb.render(<EpheLookControls lang="de" />);
    });
    const jackets = (host: HTMLElement): HTMLButtonElement[] => [
      ...host.querySelectorAll<HTMLButtonElement>(".ephe-variant"),
    ];
    const marks = (host: HTMLElement): HTMLButtonElement[] => [
      ...host.querySelectorAll<HTMLButtonElement>(".ephe-mark"),
    ];
    expect(jackets(a)).toHaveLength(3);
    expect(marks(b)).toHaveLength(3);
    await act(async () => {
      jackets(a)[1]?.click();
      marks(b)[2]?.click();
    });
    // both copies, both languages, one state
    expect(useStore.getState().epheLook).toEqual({ jacket: 1, mark: "diamond" });
    for (const host of [a, b]) {
      expect(jackets(host).map((el) => el.getAttribute("aria-pressed"))).toEqual([
        "false",
        "true",
        "false",
      ]);
      expect(marks(host).map((el) => el.getAttribute("aria-pressed"))).toEqual([
        "false",
        "false",
        "true",
      ]);
    }
    expect(localStorage.getItem("codecity-ephe-look:v1")).toBe('{"jacket":1,"mark":"diamond"}');
    await act(async () => {
      ra.unmount();
      rb.unmount();
    });
    a.remove();
    b.remove();
  });
});

/**
 * MASTER-2027 §04.11 — the vitrine opened from inside a city is the same modal,
 * so it has to answer the same clicks.
 *
 * Measured, not assumed: with the resident card standing, the jacket chip's own
 * centre answered `document.elementsFromPoint` with the card's text — the panel
 * had inherited the overlay layer's `pointer-events: none`, so it opened over
 * the city and could not be used (and its click-outside dismissal never
 * fired). jsdom cannot hit-test, so this pins the declaration that fixes it.
 */
describe("the vitrine answers clicks inside the city (§04.11)", () => {
  const css = readFileSync(path.resolve(import.meta.dirname, "../src/design/start.css"), "utf-8");
  const regel = css.slice(
    css.indexOf(".ephe-preview-backdrop {"),
    css.indexOf("}", css.indexOf(".ephe-preview-backdrop {")),
  );

  it("takes pointer events on its own", () => {
    expect(regel).toContain("pointer-events: auto");
  });

  it("is still the layer above the city's chrome", () => {
    const z = Number(/z-index:\s*(\d+)/.exec(regel)?.[1] ?? 0);
    const karte = readFileSync(
      path.resolve(import.meta.dirname, "../src/design/globals.css"),
      "utf-8",
    );
    const kartenZ = Number(
      /z-index:\s*(\d+)/.exec(karte.slice(karte.indexOf(".resident-card {")))?.[1] ?? 0,
    );
    expect(kartenZ).toBeGreaterThan(0);
    expect(z, `backdrop ${z} must outrank the resident card ${kartenZ}`).toBeGreaterThan(kartenZ);
  });
});
