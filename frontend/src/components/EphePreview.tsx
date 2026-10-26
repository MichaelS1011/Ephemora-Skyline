import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { t, type Lang } from "../i18n";
import { EpheLookControls } from "./EpheLookControls";
import { NAME_MAX, normaliseName } from "../epheNames";
import {
  EPHE_PALETTE,
  EPHE_VARIANTS,
  epheOutfit,
  type EpheMark,
  type EpheOutfit,
} from "../city/palette";
import { useStore } from "../stores/useStore";
import { LIGHT_RIG, SUN_POSITION } from "../render/sky";
import { prefersReducedMotion } from "../city/motion";
import {
  CONTACT_PATCH_Y,
  FIGURE,
  writeEpheLimbPose,
  type EpheGesture,
  type EpheLimbPose,
} from "./Pedestrians";

/**
 * MASTER-2027 §04.02 — an isolated 3D preview area for the shipped figure.
 *
 * This is the same body, not a look-alike: every dimension is read from
 * `FIGURE`, the stance from the crowd's own `writeEpheLimbPose`, every colour
 * from `EPHE_PALETTE`, and the key light is the city's own `SUN_POSITION`. The
 * limb radii are the crowd's numbers, and `tests/ephe-preview.test.tsx` fails if
 * one of them stops appearing in `Pedestrians.tsx` — a preview that quietly
 * drifts from the figure is the second architecture §22 forbids, wearing a
 * different costume.
 *
 * It is one figure drawn as eleven plain meshes, not an instanced twelfth pass:
 * the crowd's eleven draws are its budget for seventy-two bodies, and this file
 * adds nothing to them. `ephe-readability.test.ts` counts `Pedestrians.tsx` and
 * is untouched here.
 *
 * Why a second canvas and not a second camera: the preview has to be openable
 * without moving the world the reader is looking at, and the only way to do that
 * inside the city's canvas is to take its camera — which is the thing §04.02 is
 * explicitly not for. The cost is one WebGL context, and it is paid only while
 * the panel is open.
 */

/** The crowd's own limb sizes for a canonical figure (`fat` 1, `tall` 1). */
export const EPHE_PREVIEW_LIMBS = {
  boot: [0.1, 0.075, 0.17],
  thigh: 0.075,
  shin: 0.07,
  sleeve: 0.075,
  hand: 0.075,
  eye: 0.5,
  ground: 0.95,
} as const;

/** What a resident wears before anyone chooses: the crowd's first family. */
export const EPHE_PREVIEW_OUTFIT = epheOutfit(EPHE_VARIANTS[0]);

/**
 * MASTER-2027 §04.07 — where the mark goes and what it is made of. The three
 * states themselves live in `city/palette.ts` (`EPHE_MARKS`), because the storage
 * module has to validate a mark without importing this file.
 *
 * It is drawn ON the body, not over the picture: a flat disc placed in front of
 * the coat's own surface, inside the turning group, single-sided and depth
 * tested. So it goes edge-on and disappears when the resident is turned around —
 * which is the difference between a mark and a sticker, and the thing the probe
 * measures rather than what this comment claims.
 *
 * The tone is `EPHE_PALETTE.helmet`, measured against the three offered coats:
 * 3,03:1 / 2,50:1 / 2,55:1, and 15,91 ΔE00 from the skin it would otherwise be
 * mistaken for. Skin tones were the stronger candidate (3,89…4,71:1) and are
 * exactly why they were refused — a face-coloured disc on a chest reads as a
 * hole. Gold was stronger still (2,55…3,09:1, ΔE00 32…48 to the coats) and
 * stayed out of it: `EPHE_PALETTE.selection` is the one selection mark of this
 * app, and a personal emblem wearing it would dilute the only thing that says
 * "the reader picked this".
 */
/** Above the torso centre, between the coat's own profile points at 0,04 and 0,115. */
export const EPHE_MARK_Y = 0.075;
export const EPHE_MARK_COLOUR = EPHE_PALETTE.helmet;
/** Radii in world units: 16 px and 21 px across in the vitrine's 230 px per unit. */
export const EPHE_MARK_RADIUS: Record<Exclude<EpheMark, "none">, number> = {
  dot: 0.035,
  diamond: 0.045,
};
/**
 * How far in front of the coat surface the mark hangs. Not a guess: the coat is
 * a lathe, so a flat disc wide enough to be seen has to clear the body's own
 * curvature at its LOW edge, where the coat is widest. The diamond's 0,045 units
 * need 0,0063 of that; 0,002 is added so the surface never touches the patch.
 */
export const EPHE_MARK_LIFT =
  coatRadiusAt(EPHE_MARK_Y - EPHE_MARK_RADIUS.diamond) - coatRadiusAt(EPHE_MARK_Y) + 0.002;

/**
 * The coat's surface radius at a height, read off `FIGURE.coat` — the lathe is a
 * surface of revolution, so this IS the front of the body at that height. The
 * profile is monotone between its points, which is what makes the straight
 * interpolation exact enough to place a 0,035 unit disc by.
 */
export function coatRadiusAt(y: number): number {
  const profile = FIGURE.coat;
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r, ry] = profile[i]!;
    const [pr, pry] = profile[i - 1]!;
    if (y <= ry) return pr + ((y - pry) / (ry - pry)) * (r - pr);
  }
  return profile[profile.length - 1]![0];
}

/** Where the mark sits, and why that is in front of the coat at every point. */
export function epheMarkPosition(mark: EpheMark): [number, number, number] | null {
  if (mark === "none") return null;
  return [0, FIGURE.bodyY + EPHE_MARK_Y, coatRadiusAt(EPHE_MARK_Y) + EPHE_MARK_LIFT];
}

interface Bone {
  readonly key: string;
  readonly position: [number, number, number];
  readonly quaternion: [number, number, number, number];
  readonly scale: [number, number, number];
  readonly colour: string;
}

const UP = new THREE.Vector3(0, 1, 0);

/** `writeBone` from the crowd loop, for a figure that stands and faces +z. */
function bone(
  key: string,
  a: [number, number, number],
  b: [number, number, number],
  radius: number,
  colour: string,
): Bone {
  const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = direction.length();
  direction.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, direction);
  return {
    key,
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    quaternion: [q.x, q.y, q.z, q.w],
    scale: [radius, length / 2, radius],
    colour,
  };
}

/**
 * The figure, assembled from the shipped plan. A point is in world units; the
 * camera looks down +z at a body whose feet are at y 0 and whose crown is
 * `FIGURE.crown`.
 */
export function buildEphePreview(
  gesture: EpheGesture = "idle",
  outfit: EpheOutfit = EPHE_PREVIEW_OUTFIT,
) {
  const bones: Bone[] = [];
  for (const side of [-1, 1] as const) {
    const pose: EpheLimbPose = {
      footX: 0,
      footY: 0,
      footZ: 0,
      handX: 0,
      handY: 0,
      handZ: 0,
      kneeForward: 0,
    };
    writeEpheLimbPose(pose, 0, side, gesture, 0);
    const foot: [number, number, number] = [pose.footX, pose.footY, pose.footZ];
    const hip: [number, number, number] = [side * FIGURE.hipWidth, FIGURE.hipY, 0];
    const knee: [number, number, number] = [
      (hip[0] + foot[0]) / 2,
      FIGURE.kneeY,
      (hip[2] + foot[2]) / 2 + pose.kneeForward,
    ];
    const ankle: [number, number, number] = [foot[0], pose.footY + 0.055, foot[2]];
    const shoulder: [number, number, number] = [
      side * FIGURE.shoulderWidth,
      FIGURE.bodyY + FIGURE.shoulderY,
      0,
    ];
    const hand: [number, number, number] = [pose.handX, pose.handY, pose.handZ];
    bones.push(
      bone(`thigh-${side}`, hip, knee, EPHE_PREVIEW_LIMBS.thigh, outfit.trouser),
      bone(`shin-${side}`, knee, ankle, EPHE_PREVIEW_LIMBS.shin, outfit.trouser),
      bone(`sleeve-${side}`, shoulder, hand, EPHE_PREVIEW_LIMBS.sleeve, outfit.sleeve),
    );
    // Hands and boots are scaled spheres rather than bones — as in the crowd.
    bones.push({
      key: `hand-${side}`,
      position: hand,
      quaternion: [0, 0, 0, 1],
      scale: [EPHE_PREVIEW_LIMBS.hand, EPHE_PREVIEW_LIMBS.hand, EPHE_PREVIEW_LIMBS.hand],
      colour: outfit.skin,
    });
    bones.push({
      key: `boot-${side}`,
      position: foot,
      quaternion: [0, 0, 0, 1],
      scale: [EPHE_PREVIEW_LIMBS.boot[0], EPHE_PREVIEW_LIMBS.boot[1], EPHE_PREVIEW_LIMBS.boot[2]],
      colour: outfit.boot,
    });
  }
  return bones;
}

/**
 * Framing, derived rather than guessed.
 *
 * R3F's default camera looks at the world origin, so the body has to hang around
 * that origin: it is lowered by half its height and the camera keeps a distance
 * that fills `EPHE_PREVIEW_FILL` of the stage with the shipped 1.35 units. Both
 * numbers are checkable arithmetic — `tests/ephe-preview.test.tsx` fails if the
 * crown leaves the frame or the figure shrinks below two thirds of the stage —
 * which is the difference between a preview and a small dark thing in a corner.
 */
export const EPHE_PREVIEW_FOV = 32;
export const EPHE_PREVIEW_FILL = 0.74;
export const EPHE_PREVIEW_DISTANCE =
  FIGURE.crown / (EPHE_PREVIEW_FILL * 2 * Math.tan(((EPHE_PREVIEW_FOV / 2) * Math.PI) / 180));
/** What fraction of the stage height the figure's own height covers. */
export const ephePreviewFill = (distance = EPHE_PREVIEW_DISTANCE, fov = EPHE_PREVIEW_FOV): number =>
  FIGURE.crown / (2 * distance * Math.tan(((fov / 2) * Math.PI) / 180));

/**
 * The turn, and who is allowed to drive it.
 *
 * A preview you only watch is a screensaver: the first build spun at its own
 * pace and stopped there. Dragging and the arrow keys now set the angle, and the
 * idle turntable is what runs until a hand takes over — so the figure answers
 * the reader rather than performing. Under reduced motion the idle turn is off
 * and the hand still works: motion someone asked for is not the motion the
 * query is about.
 */
export const EPHE_PREVIEW_SPIN = 0.5;
export const EPHE_PREVIEW_TURN_PER_PX = 0.01;
export const EPHE_PREVIEW_TURN_PER_KEY = 0.35;

export function epheTurnFromDrag(angle: number, dxPx: number): number {
  return angle + dxPx * EPHE_PREVIEW_TURN_PER_PX;
}

/** The keyboard's turn: the same control for someone not using a mouse. */
export function epheTurnFromKey(angle: number, key: string): number {
  if (key === "ArrowLeft") return angle - EPHE_PREVIEW_TURN_PER_KEY;
  if (key === "ArrowRight") return angle + EPHE_PREVIEW_TURN_PER_KEY;
  return angle;
}

/** The shared handle between the DOM stage and the WebGL group. */
export interface EpheTurn {
  angle: number;
  dragging: boolean;
}

function Figure({
  gesture,
  turn,
  name,
  outfit,
  mark,
}: {
  gesture: EpheGesture;
  turn: EpheTurn;
  name: string;
  outfit: EpheOutfit;
  mark: EpheMark;
}) {
  const group = useRef<THREE.Group>(null);
  const bones = useMemo(() => buildEphePreview(gesture, outfit), [gesture, outfit]);
  const geos = useMemo(
    () => ({
      coat: new THREE.LatheGeometry(
        FIGURE.coat.map(([r, y]) => new THREE.Vector2(r, y)),
        12,
      ),
      head: new THREE.SphereGeometry(FIGURE.headR, 12, 8),
      face: new THREE.SphereGeometry(1, 10, 6),
      eye: new THREE.SphereGeometry(0.032, 6, 4),
      limb: new THREE.SphereGeometry(1, 8, 6),
      ground: new THREE.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2),
      // The plate the case is built on: without it the body hangs in a black
      // void, and a void reads as "broken render" at this size.
      plate: new THREE.CircleGeometry(0.62, 40).rotateX(-Math.PI / 2),
      // The two marks of §04.07. A circle and a four-segment circle: the latter
      // already has its vertices at 0°, 90°, 180° and 270°, so it IS the diamond
      // — turning it a quarter round would make a square, which the first build
      // measured at fill 1,00 in its bounding box instead of the 0,50 a diamond
      // has. Same primitive, so the diamond is exactly as round as the dot.
      dot: new THREE.CircleGeometry(EPHE_MARK_RADIUS.dot, 16),
      diamond: new THREE.CircleGeometry(EPHE_MARK_RADIUS.diamond, 4),
    }),
    [],
  );
  const turntable = !prefersReducedMotion();
  const markAt = epheMarkPosition(mark);
  useFrame((_, delta) => {
    if (!group.current) return;
    // The idle turn is what runs until a hand takes over; the group eases to the
    // angle either one set, so a drag release never snaps.
    if (!turn.dragging && turntable) turn.angle += delta * EPHE_PREVIEW_SPIN;
    const k = Math.min(1, delta * 12);
    group.current.rotation.y += (turn.angle - group.current.rotation.y) * k;
  });

  return (
    <group ref={group} position={[0, -FIGURE.crown / 2, 0]}>
      <mesh geometry={geos.coat} position={[0, FIGURE.bodyY, 0]} renderOrder={1}>
        <meshStandardMaterial color={outfit.coat} roughness={0.85} metalness={0.02} />
      </mesh>
      {markAt && (
        // §04.07 — lit by the same rig as the coat it sits on, so it reads as a
        // patch of the garment rather than a bright sticker over the picture.
        <mesh geometry={mark === "dot" ? geos.dot : geos.diamond} position={markAt} renderOrder={2}>
          <meshStandardMaterial color={EPHE_MARK_COLOUR} roughness={0.85} metalness={0.02} />
        </mesh>
      )}
      {bones.map((b) => (
        <mesh
          key={b.key}
          geometry={geos.limb}
          position={b.position}
          quaternion={b.quaternion}
          scale={b.scale}
        >
          <meshStandardMaterial color={b.colour} roughness={0.9} />
        </mesh>
      ))}
      <mesh geometry={geos.head} position={[0, FIGURE.headY, 0]}>
        <meshStandardMaterial color={outfit.hair} roughness={0.78} />
      </mesh>
      <mesh
        geometry={geos.face}
        position={[0, FIGURE.headY + FIGURE.faceY, FIGURE.faceAt]}
        scale={[FIGURE.faceR, FIGURE.faceUp, FIGURE.faceDip]}
      >
        <meshStandardMaterial color={outfit.skin} roughness={0.72} />
      </mesh>
      <mesh
        geometry={geos.limb}
        position={[0, FIGURE.headY + FIGURE.capY, FIGURE.capAt]}
        scale={[FIGURE.capR, FIGURE.capUp, FIGURE.capDip]}
      >
        <meshStandardMaterial color={outfit.hair} roughness={0.9} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`eye-${side}`}
          geometry={geos.eye}
          position={[side * FIGURE.eyeSide, FIGURE.headY + FIGURE.eyeY, FIGURE.eyeAt]}
          scale={EPHE_PREVIEW_LIMBS.eye}
        >
          <meshBasicMaterial color={outfit.eye} />
        </mesh>
      ))}
      <mesh geometry={geos.plate} position={[0, 0.004, 0]}>
        <meshStandardMaterial color={outfit.ground} roughness={0.95} transparent opacity={0.55} />
      </mesh>
      <mesh
        geometry={geos.ground}
        position={[0, CONTACT_PATCH_Y, 0]}
        scale={EPHE_PREVIEW_LIMBS.ground}
      >
        <meshBasicMaterial color={outfit.ground} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {name !== "" && (
        // §04.04 — the name at the figure, on the same carrier the city uses for
        // a role mark: a DOM label over a group that sits on the turn axis, so it
        // holds its place while the resident turns. Text, never HTML.
        <group position={[0, FIGURE.crown + 0.14, 0]}>
          <Html center zIndexRange={[9, 0]}>
            <div className="ephe-name-tag">{name}</div>
          </Html>
        </group>
      )}
    </group>
  );
}

/**
 * The panel. Mounted only when a reader asks for it, so the start screen keeps
 * its one WebGL context until someone wants to see the real figure.
 */
export function EphePreview({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  // §04.10 — the look lives in the store, which is the crowd's read path as well
  // as this panel's. A local copy here is how a choice would stop reaching the
  // city the moment the panel closed, and the store merges per call, so two
  // choices in one batch cannot overwrite each other (the bug a test caught when
  // this was local state).
  const look = useStore((s) => s.epheLook);
  // Stable identity per index, so turning the figure never rebuilds the ten bones.
  const outfit = useMemo(() => epheOutfit(look.jacket), [look.jacket]);
  const turn = useRef<EpheTurn>({ angle: 0, dragging: false });
  const drag = useRef<{ x: number; angle: number } | null>(null);
  useEffect(() => {
    // The keyboard lands inside the dialog it just opened.
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // `aria-modal` is a promise a screen reader holds you to: with the page
      // behind still tabbable it is a lie. Two controls live here, so the wrap
      // is written rather than a library imported.
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("[tabindex], button, a[href]")].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = e.shiftKey ? -1 : 1;
      items[(at + step + items.length) % items.length]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    drag.current = { x: e.clientX, angle: turn.current.angle };
    turn.current.dragging = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    turn.current.angle = epheTurnFromDrag(drag.current.angle, e.clientX - drag.current.x);
  };
  const endDrag = (): void => {
    drag.current = null;
    turn.current.dragging = false;
  };
  const onStageKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const next = epheTurnFromKey(turn.current.angle, e.key);
    if (next === turn.current.angle) return;
    turn.current.angle = next;
    e.preventDefault();
  };

  return (
    <div
      className="ephe-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t(lang, "landing.previewAria")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ephe-preview-panel" ref={panelRef}>
        <header className="ephe-preview-head">
          <p className="ephe-preview-title">{t(lang, "landing.previewTitle")}</p>
          <button
            ref={closeRef}
            type="button"
            className="ephe-preview-close"
            onClick={onClose}
            aria-label={t(lang, "landing.previewCloseAria")}
          >
            ✕
          </button>
        </header>
        <div
          className="ephe-preview-stage"
          tabIndex={0}
          role="group"
          aria-label={t(lang, "landing.previewStageAria")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onStageKey}
        >
          <Canvas
            camera={{ position: [0, 0, EPHE_PREVIEW_DISTANCE], fov: EPHE_PREVIEW_FOV }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
          >
            <hemisphereLight
              args={[LIGHT_RIG.hemiSky, LIGHT_RIG.hemiGround, LIGHT_RIG.hemiIntensity]}
            />
            <directionalLight
              position={SUN_POSITION}
              intensity={LIGHT_RIG.sunIntensity}
              color={LIGHT_RIG.sunColor}
            />
            <directionalLight
              position={LIGHT_RIG.fillPosition}
              intensity={LIGHT_RIG.fillIntensity}
              color={LIGHT_RIG.fillColor}
            />
            <ambientLight intensity={LIGHT_RIG.ambientIntensity} />
            <Figure
              gesture="idle"
              turn={turn.current}
              name={name}
              outfit={outfit}
              mark={look.mark}
            />
          </Canvas>
        </div>
        {/* §04.05–§04.07, placed for §04.11: the two choices that dress the
            figure. They live in `EpheLookControls` so the resident card offers
            the same ones to a resident that already exists — one store field,
            one browser key, no second copy of the choice. */}
        <EpheLookControls lang={lang} />

        {/* §04.04 — the field commits as it is typed, like the card's: the name
            on the figure is the answer, so there is no second button to press.
            `normaliseName` is the same rule the resident card runs through, so
            what the tag shows is what §04.09 will be able to keep. The question
            is the label — a "Name" over a field that asks "what shall this one be
            called?" says the same thing twice, and the i18n guard is right that
            the word is not a translation. */}
        <input
          className="ephe-preview-name-input"
          type="text"
          maxLength={NAME_MAX * 2}
          value={name}
          aria-label={t(lang, "landing.previewNameHint")}
          placeholder={t(lang, "landing.previewNameHint")}
          onChange={(e) => setName(normaliseName(e.target.value))}
        />
        <p className="ephe-preview-note">{t(lang, "landing.previewNote")}</p>
      </div>
    </div>
  );
}
