// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EphePortrait, SC, CX, GROUND_Y } from "../src/components/EphePortrait";
import { FIGURE, writeEpheLimbPose, type EpheLimbPose } from "../src/components/Pedestrians";
import { EPHE_PALETTE } from "../src/city/palette";

/**
 * MASTER-2027 §03.04 — the start-screen resident IS the shipped resident.
 *
 * The portrait is drawn at the centre of the landing, so the claim that has to
 * hold is not "it looks friendly" but "it is the same figure": every landmark
 * read out of `FIGURE`, every colour out of `EPHE_PALETTE`, the stance out of the
 * real idle pose. This file recomputes those from the shipped source and checks
 * the rendered SVG against them — if the crowd's body plan moves and the
 * portrait does not follow, the numbers stop matching.
 */

let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

function renderPortrait(): SVGSVGElement {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<EphePortrait lang="en" />);
  });
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("portrait rendered no svg");
  return svg as SVGSVGElement;
}

afterEach(() => {
  host?.remove();
  vi.unstubAllGlobals();
});

describe("the head is placed by the figure's own skull", () => {
  it("puts the skull where FIGURE.headY and FIGURE.headR say", () => {
    const svg = renderPortrait();
    const head = svg.querySelector(`circle[fill="${EPHE_PALETTE.hair[0]}"]`);
    expect(head, "the dark skull circle").not.toBeNull();
    expect(Number(head!.getAttribute("cy"))).toBeCloseTo(GROUND_Y - FIGURE.headY * SC, 1);
    expect(Number(head!.getAttribute("r"))).toBeCloseTo(FIGURE.headR * SC, 1);
  });

  it("carries the skin band as the figure's own face band", () => {
    const svg = renderPortrait();
    const face = svg.querySelector(`ellipse[fill="${EPHE_PALETTE.shells[0]}"]`);
    expect(face).not.toBeNull();
    expect(Number(face!.getAttribute("rx"))).toBeCloseTo(FIGURE.faceR * SC, 1);
    expect(Number(face!.getAttribute("cy"))).toBeCloseTo(
      GROUND_Y - (FIGURE.headY + FIGURE.faceY) * SC,
      1,
    );
  });
});

describe("the coat is the shipped lathe, not a rectangle", () => {
  it("widens to the figure's own hem radius", () => {
    const svg = renderPortrait();
    const coat = svg.querySelector(`path[fill="${EPHE_PALETTE.jackets[0]}"]`);
    expect(coat, "the coat lathe path").not.toBeNull();
    const d = coat!.getAttribute("d") ?? "";
    // The hem is the coat's widest point: FIGURE.bodyR either side of the axis.
    expect(d).toContain((CX + FIGURE.bodyR * SC).toFixed(1));
    expect(d).toContain((CX - FIGURE.bodyR * SC).toFixed(1));
  });
});

describe("the stance is the real idle pose", () => {
  it("separates the legs by the pose's own foot offset", () => {
    const svg = renderPortrait();
    const pose: EpheLimbPose = {
      footX: 0,
      footY: 0,
      footZ: 0,
      handX: 0,
      handY: 0,
      handZ: 0,
      kneeForward: 0,
    };
    writeEpheLimbPose(pose, 0, 1, "idle");
    const leg = svg.querySelector(`rect[fill="${EPHE_PALETTE.trousers[0]}"]`);
    expect(leg).not.toBeNull();
    // The left leg's outer edge sits at CX - footX*SC - shinR; the pose decides it.
    const x = Number(leg!.getAttribute("x"));
    const shinR = 0.07 * SC;
    expect(x).toBeCloseTo(CX - pose.footX * SC - shinR, 1);
  });
});

describe("every colour is the crowd's own palette", () => {
  it("draws only from EPHE_PALETTE", () => {
    const svg = renderPortrait();
    // The arms are capsules (a stroked line), the rest are filled shapes — the
    // colour can ride either attribute, so both are collected.
    const colours = new Set<string>();
    for (const el of svg.querySelectorAll("[fill],[stroke]")) {
      const f = el.getAttribute("fill");
      const s = el.getAttribute("stroke");
      if (f && f !== "none") colours.add(f);
      if (s && s !== "none") colours.add(s);
    }
    for (const expected of [
      EPHE_PALETTE.jackets[0],
      EPHE_PALETTE.sleeves[0],
      EPHE_PALETTE.trousers[0],
      EPHE_PALETTE.shells[0],
      EPHE_PALETTE.hair[0],
      EPHE_PALETTE.boots,
      EPHE_PALETTE.eyes,
      EPHE_PALETTE.contact,
    ]) {
      expect(colours.has(expected), `portrait uses ${expected}`).toBe(true);
    }
    // No invented colour: every colour on the figure is a palette member.
    const palette = new Set<string>([
      ...EPHE_PALETTE.jackets,
      ...EPHE_PALETTE.sleeves,
      ...EPHE_PALETTE.trousers,
      ...EPHE_PALETTE.shells,
      ...EPHE_PALETTE.hair,
      EPHE_PALETTE.boots,
      EPHE_PALETTE.eyes,
      EPHE_PALETTE.contact,
      EPHE_PALETTE.selection,
      EPHE_PALETTE.helmet,
    ]);
    for (const c of colours) expect(palette.has(c), `non-palette colour ${c}`).toBe(true);
  });
});
