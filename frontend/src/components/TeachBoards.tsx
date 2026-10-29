"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { surfaceForLayout } from "../city/worldSurface";
import { ENV } from "../city/palette";
import { reviewKeyFor } from "../reviews";
import {
  BOARD_CANVAS,
  BOARD_FONT,
  BOARD_TYPE,
  CAP_RATIO,
  boardCopy,
  planBoardPlacements,
  wrapPlate,
  type BoardPlacement,
  type BoardText,
} from "../city/teachBoards";
import type { CityFile, CityFinding } from "../city/types";

/**
 * The three teaching boards, drawn.
 *
 * Three planes, three canvas textures, no fourth thing: no DOM, no raycast, no
 * frame loop, no motion. The placement and the copy are decided in
 * `city/teachBoards.ts` — this file only paints what that module measured, so a
 * guard can hold the decisions without a renderer.
 *
 * The plate's ground is `ENV.arcCasing` and its ink `ENV.plot`: the same livery
 * the towed banner wears (`AIRSHOW_LIVERY`), and the pair measured to 13,37:1 —
 * a dark board is not decoration, it is what makes an ink legible on haze.
 */

/** A wrapped line, measured against the plate's own width. The breaking rule
 *  itself is `city/teachBoards.ts:wrapPlate`, so a guard can hold it without a
 *  canvas; this is only the font's metrics. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return wrapPlate(text, maxWidth, (line) => ctx.measureText(line).width);
}

/**
 * One board's plate.
 *
 * Two faces, two jobs: the main line is the UI face at `BOARD_TYPE.title`, the
 * evidence under it is the mono face the rest of the product uses for
 * measurements. Both shrink only when a sentence does not fit — the legibility
 * floor is met by the plate's SIZE, never by a smaller sentence (the operator's
 * rule: make the board bigger, not the writing smaller).
 */
export function drawBoard(text: BoardText): HTMLCanvasElement {
  const { width: W, height: H } = BOARD_CANVAS;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas; // jsdom: no 2D context and no frame either
  ctx.fillStyle = ENV.arcCasing;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ENV.plot;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const inner = W - BOARD_TYPE.pad * 2;

  // ── The main line ────────────────────────────────────────────────────────
  let size = BOARD_TYPE.title;
  ctx.font = `600 ${size}px ${BOARD_FONT.title}`;
  let titleLines = wrap(ctx, text.title, inner);
  while (titleLines.length > 2 && size > BOARD_TYPE.titleMin) {
    size -= 4;
    ctx.font = `600 ${size}px ${BOARD_FONT.title}`;
    titleLines = wrap(ctx, text.title, inner);
  }
  const cap = size * CAP_RATIO;
  const leading = (BOARD_TYPE.titleLead * size) / BOARD_TYPE.title;
  let baseline = BOARD_TYPE.pad + cap;
  for (const line of titleLines) {
    ctx.fillText(line, BOARD_TYPE.pad, baseline);
    baseline += leading;
  }
  const ruleY = BOARD_TYPE.pad + cap + (titleLines.length - 1) * leading + 22;
  ctx.fillRect(BOARD_TYPE.pad, ruleY, 96, BOARD_TYPE.rule);

  // ── The evidence, bottom-aligned ─────────────────────────────────────────
  let bodySize = BOARD_TYPE.body;
  let lead = (BOARD_TYPE.bodyLead * bodySize) / BOARD_TYPE.body;
  let bodyLines = text.lines.flatMap((line) => wrap(ctx, line, inner));
  ctx.font = `400 ${bodySize}px ${BOARD_FONT.body}`;
  while (
    bodySize > BOARD_TYPE.bodyMin &&
    ruleY + 26 + bodyLines.length * lead > H - BOARD_TYPE.pad
  ) {
    bodySize -= 2;
    lead = (BOARD_TYPE.bodyLead * bodySize) / BOARD_TYPE.body;
    ctx.font = `400 ${bodySize}px ${BOARD_FONT.body}`;
    bodyLines = text.lines.flatMap((line) => wrap(ctx, line, inner));
  }
  const lastBaseline = H - BOARD_TYPE.pad;
  for (let i = 0; i < bodyLines.length; i += 1) {
    const y = lastBaseline - (bodyLines.length - 1 - i) * lead;
    if (y - bodySize * CAP_RATIO < ruleY + 8) break; // never overprint the rule
    ctx.fillText(bodyLines[i]!, BOARD_TYPE.pad, y);
  }
  return canvas;
}

/**
 * One plate as a texture, drawn at mount and once more when the real face has
 * arrived (`@fontsource` ships `font-display: swap`, so the first draw can land
 * on a fallback). Two draws per language, never one per frame.
 */
function useBoardTexture(text: BoardText): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const created = new THREE.CanvasTexture(drawBoard(text));
    created.colorSpace = THREE.SRGBColorSpace;
    created.anisotropy = 4;
    return created;
  }, [text]);

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const ctx = (texture.image as HTMLCanvasElement | undefined)?.getContext?.("2d");
      if (!ctx) return;
      ctx.drawImage(drawBoard(text), 0, 0);
      texture.needsUpdate = true;
    });
    return () => {
      cancelled = true;
    };
  }, [texture, text]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** One plate: a plane that looks at the arrival eye and answers to nothing. */
function Board({ placement, text }: { placement: BoardPlacement; text: BoardText }) {
  const { width, height, x, y, z, yaw } = placement;
  const texture = useBoardTexture(text);
  return (
    <mesh position={[x, y + height / 2, z]} rotation={[0, yaw, 0]} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={THREE.FrontSide} />
    </mesh>
  );
}

/**
 * The three boards stand on the empty ground around whatever city is loaded —
 * and only in the state they were measured for: the ROOT level of a BUILT
 * city. Both gates are measured findings from the harvest acceptance
 * (2026-10-29, frames in the harvest lane), not taste:
 *
 *   • During the build window the placement is a picture nobody measured: the
 *     boards face the arrival eye while the camera is still the crane, and at
 *     1440×900 the finding board stood across a third of the frame — over an
 *     EMPTY terrain, so what it covered was nothing, loudly. At 1280×800 the
 *     same three boards were nowhere in the frame. They arrive with the
 *     finished city, which is the only city their copy speaks about.
 *   • Drilled into a district the boards stood INSIDE it carrying the root
 *     city's numbers — "Files read · 74" on the ground of a district of 35
 *     files. A board that lies by position is worse than no board.
 */
export function TeachBoards() {
  const cityData = useStore((s) => s.cityData);
  const lang = useStore((s) => s.prefs.lang);
  const reviews = useStore((s) => s.reviews);
  const buildPhase = useStore((s) => s.buildPhase);
  const focusPath = useStore((s) => s.focusPath);
  /** The picture the plates are drawn into. `size` is the renderer's own notice
   *  that the canvas changed; the measure is taken from the element it speaks
   *  for, so the placement is computed against 964×800 in a 1280×800 window and
   *  1124×900 in a 1440×900 one — the frame the reader actually sees, never the
   *  window around it (the project card's column costs 316 px of that). */
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);

  const plan = useMemo(() => {
    if (!cityData) return null;
    const canvas = {
      width: gl.domElement.clientWidth,
      height: gl.domElement.clientHeight,
    };
    // No measure yet means no picture to place anything in. The module refuses
    // to guess one; this returns nothing rather than a placement for a frame
    // that is never rendered.
    if (canvas.width < 1 || canvas.height < 1) return null;
    const layout = getDirLayout(cityData, []);
    return planBoardPlacements(layout, surfaceForLayout(layout, false), canvas);
  }, [cityData, gl, size]);

  const copy = useMemo(() => {
    if (!cityData) return null;
    const answered = (file: CityFile, index: number, finding: CityFinding): boolean =>
      reviews[reviewKeyFor(file, index, finding)] !== undefined;
    return boardCopy(cityData, lang, answered);
  }, [cityData, lang, reviews]);

  if (!plan || !copy || plan.boards.length === 0) return null;
  if (buildPhase !== "built") return null;
  if (focusPath.length > 0) return null;
  return (
    <group name="teach-boards">
      {plan.boards.map((placement, i) => (
        <Board key={copy[i]?.id ?? i} placement={placement} text={copy[i]!.text} />
      ))}
    </group>
  );
}
