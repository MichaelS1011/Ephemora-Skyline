import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  BANNER_ADDRESS,
  BANNER_BACK,
  BANNER_DROP,
  BANNER_H,
  BANNER_W,
  PASS_REST,
  SPEED,
  airshowScaleFor,
  altitudeFor,
  bankFor,
  lapLength,
  legHalfFor,
  onTrack,
  nearestAlong,
  settledDistance,
  trackAxes,
} from "../city/airshowMotion";
import { PILOT_SCALE, isFlying, notePlanePose, pilotState } from "../city/pilotMotion";
import { AIRSHOW_LIVERY } from "../city/palette";
import { prefersReducedMotion, reducedSettle } from "../city/motion";
import { surfaceQuaternion, surfacePoint } from "../city/worldSurface";
import { useLodFar } from "../hooks/useLodFar";
import { useWorldSurface } from "../render/WorldSurface";
import { t, type Lang } from "../i18n";

/**
 * The airshow: one small aircraft, one banner, one invitation.
 *
 * It exists because the product has something to say about itself and every
 * other surface for saying it is a sentence on a screen someone is trying to
 * read code with. Here it is scenery: no DOM, no focus stop, nothing in the
 * way — and the only text in the world that is not a measurement.
 *
 * The aircraft crosses the picture on a straight and turns outside it, because
 * a towed banner is read across its flight line and not along it; the
 * racetrack's reason for existing is in `city/airshowMotion.ts`. What is not
 * here either: glow (a lit vehicle competes with the alarm beacons, the rule
 * `trafficLivery.test.ts` already holds for the fleet), picking (the plane
 * answers to no click), per-frame allocation, and flying for an audience that
 * is not watching — it stands down while the city is under its crane, while the
 * heat grid owns the view, and between two passes.
 */

const CANVAS_W = 640;
const CANVAS_H = 128;

/** One box, placed by a matrix, into a shared position/normal pool. */
function addBox(
  pos: number[],
  nor: number[],
  w: number,
  h: number,
  d: number,
  m: THREE.Matrix4,
): void {
  const g = new THREE.BoxGeometry(w, h, d).applyMatrix4(m);
  const p = g.attributes.position?.array as ArrayLike<number> | undefined;
  const n = g.attributes.normal?.array as ArrayLike<number> | undefined;
  if (p) for (let i = 0; i < p.length; i += 1) pos.push(p[i]!);
  if (n) for (let i = 0; i < n.length; i += 1) nor.push(n[i]!);
  g.dispose();
}

/** Move, then lean — the order matters, or the lean drags the position with it. */
const at = (x: number, y: number, z: number, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4()
    .makeTranslation(new THREE.Vector3(x, y, z))
    .multiply(new THREE.Matrix4().makeRotationZ(rz));

/** The hull, nose along +z: fuselage, cockpit, wing, tailplane, fin — five boxes, one draw. */
function hullGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  addBox(pos, nor, 0.7, 0.7, 3.6, at(0, 0, 0));
  addBox(pos, nor, 0.55, 0.45, 1.1, at(0, 0.5, 0.5));
  addBox(pos, nor, 4.6, 0.12, 0.9, at(0, -0.05, 0.1));
  addBox(pos, nor, 1.7, 0.1, 0.5, at(0, 0.15, -1.6));
  addBox(pos, nor, 0.1, 0.85, 0.55, at(0, 0.6, -1.55));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

/** The tow spar: a short bar from the banner's middle out to the aircraft. */
function barGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  addBox(pos, nor, 1, 0.06, 0.06, at(0.5, 0, 0));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

/**
 * The cloth: a dark plate with the invitation on it, drawn once per language.
 *
 * The plate is not decoration — the same ink reaches 1,05:1 against the haze
 * and 2,45:1 against the zenith, so a banner without its ground is a sentence
 * written on weather. Both lines are sized to the canvas before they are drawn,
 * and `tests/airspaceLivery.test.ts` holds the copy to that width: an address
 * that runs off the edge of a banner stops being an address.
 */
function drawBanner(lang: Lang): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas; // jsdom: no 2D context, and no frame loop either
  ctx.fillStyle = AIRSHOW_LIVERY.plate;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = AIRSHOW_LIVERY.ink;
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.fillText(t(lang, "airshow.bannerLine"), CANVAS_W / 2, 42);
  ctx.font = '400 28px "JetBrains Mono", monospace';
  ctx.fillText(BANNER_ADDRESS, CANVAS_W / 2, 94);
  return canvas;
}

export interface BannerPlaneProps {
  centre: { x: number; z: number };
  /** Half-extent of the level, so the straights can run outside its skyline. */
  bounds: number;
  /** Tallest building on screen; 0 over the empty world, where nothing needs clearing. */
  tallest: number;
  lang: Lang;
  /** False while the city is under its crane — the sky belongs to the builders then. */
  active: boolean;
}

export function BannerPlane({ centre, bounds, tallest, lang, active }: BannerPlaneProps) {
  void bounds;
  const liftRef = useRef<THREE.Group>(null);
  const shipRef = useRef<THREE.Group>(null);
  const bannerRef = useRef<THREE.Group>(null);
  const barRef = useRef<THREE.Mesh>(null);
  const propRef = useRef<THREE.Mesh>(null);
  const surface = useWorldSurface();
  const far = useLodFar(Math.max(60, tallest * 2));

  const travelled = useRef(0);
  const settled = useRef(false);
  /** The frame before this one was a flight: the show has to resume from the
   *  spot the reader landed on, not from where its own clock had got to. */
  const wasFlying = useRef(false);
  // The track is sized and turned to the reader: how far the camera stands off
  // decides how long a straight is worth, and which way it stands decides which
  // way the cloth faces. Both ease instead of snapping, so zooming reads as
  // distance rather than as a tether.
  const live = useRef({
    legHalf: legHalfFor(96, bounds),
    nx: 0,
    nz: 1,
    altitude: altitudeFor(tallest, 10, 40, false),
    scale: 1,
  });

  const hullGeo = useMemo(() => hullGeometry(), []);
  const barGeo = useMemo(() => barGeometry(), []);
  const clothGeo = useMemo(() => new THREE.PlaneGeometry(BANNER_W, BANNER_H), []);
  const propGeo = useMemo(
    () => new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8, 1).rotateX(Math.PI / 2),
    [],
  );
  const hullMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: AIRSHOW_LIVERY.hull, roughness: 0.72 }),
    [],
  );
  const barMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: AIRSHOW_LIVERY.hull, toneMapped: false }),
    [],
  );
  const clothMat = useMemo(() => {
    const texture = new THREE.CanvasTexture(drawBanner(lang));
    texture.colorSpace = THREE.SRGBColorSpace;
    // @fontsource ships `font-display: swap`, so the first draw can land on a
    // fallback face: one redraw when the real font arrives, never one per frame.
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(() => {
        const ctx = (texture.image as HTMLCanvasElement | undefined)?.getContext?.("2d");
        if (!ctx) return;
        ctx.drawImage(drawBanner(lang), 0, 0);
        texture.needsUpdate = true;
      });
    }
    // Opaque, and one face only: from inside the circuit a reader sees nothing
    // rather than a mirrored address.
    return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  }, [lang]);

  useEffect(
    () => () => {
      hullGeo.dispose();
      barGeo.dispose();
      clothGeo.dispose();
      propGeo.dispose();
      hullMat.dispose();
      barMat.dispose();
      clothMat.map?.dispose();
      clothMat.dispose();
    },
    [hullGeo, barGeo, clothGeo, propGeo, hullMat, barMat, clothMat],
  );

  const pos = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const yaw = useMemo(() => new THREE.Quaternion(), []);
  const roll = useMemo(() => new THREE.Quaternion(), []);
  const Y_AXIS = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const Z_AXIS = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const eyeFlat = useMemo(() => new THREE.Vector2(), []);

  const place = (along: number): void => {
    const { legHalf, nx, nz, altitude } = live.current;
    const tx = -nz;
    const tz = nx;
    const p = onTrack(along, legHalf);
    const wx = centre.x + tx * p.t + nx * p.n;
    const wz = centre.z + tz * p.t + nz * p.n;
    const vx = tx * p.vt + nx * p.vn;
    const vz = tz * p.vt + nz * p.vn;

    surfacePoint(surface, wx, altitude, wz, pos);
    surfaceQuaternion(surface, wx, wz, quat);
    const lift = liftRef.current;
    if (lift) {
      lift.position.copy(pos);
      lift.quaternion.copy(quat);
      // One scale for the whole show, so the banner keeps its share of the
      // frame when the reader zooms instead of becoming a wall or a speck.
      lift.scale.setScalar(live.current.scale);
    }
    // Publish where the show has the aircraft, so taking the controls is a
    // handover at this spot — same yaw convention the law uses.
    notePlanePose(pos.x, pos.y, pos.z, Math.atan2(vx, vz));
    const ship = shipRef.current;
    if (ship) {
      yaw.setFromAxisAngle(Y_AXIS, Math.atan2(vx, vz));
      roll.setFromAxisAngle(Z_AXIS, bankFor(SPEED, p.curvature));
      ship.quaternion.copy(yaw).multiply(roll);
    }
    const banner = bannerRef.current;
    if (banner) {
      // The cloth trails the aircraft along the flight line and hangs below it,
      // turned to face the audience it is written for.
      banner.position.set(-vx * BANNER_BACK, -BANNER_DROP, -vz * BANNER_BACK);
      banner.rotation.set(0, Math.atan2(nx, nz), 0);
    }
    const bar = barRef.current;
    if (bar) {
      // Which side of the cloth the hull sits on follows the direction of
      // travel, and only the spar knows it — the cloth itself never turns.
      bar.position.set(p.vt > 0 ? BANNER_BACK : -BANNER_BACK, BANNER_DROP, 0);
      bar.rotation.set(0, 0, p.vt > 0 ? 0 : Math.PI);
    }
  };

  /**
   * The same meshes, flown by a person. The state comes from `pilotMotion` —
   * this component never integrates anything itself — and the aircraft sits on
   * the real ground with one fixed scale, because the show's scale is derived
   * from the camera's distance and the camera now sits on the aircraft.
   */
  const placePilot = () => {
    const st = pilotState();
    const lift = liftRef.current;
    if (!lift) return;
    surfacePoint(surface, st.x, st.agl, st.z, pos);
    surfaceQuaternion(surface, st.x, st.z, quat);
    lift.position.copy(pos);
    lift.quaternion.copy(quat);
    lift.scale.setScalar(PILOT_SCALE);
    if (shipRef.current) {
      yaw.setFromAxisAngle(Y_AXIS, st.heading);
      roll.setFromAxisAngle(Z_AXIS, st.bank);
      shipRef.current.quaternion.copy(yaw).multiply(roll);
    }
    if (bannerRef.current) {
      bannerRef.current.position.set(
        -Math.sin(st.heading) * BANNER_BACK,
        -BANNER_DROP,
        -Math.cos(st.heading) * BANNER_BACK,
      );
      // Written for the reader behind the aircraft: the cloth's face (+z in its
      // own frame) has to point BACK at the chase camera, so it turns with the
      // heading plus a half — the opposite of the show, whose audience is ahead.
      bannerRef.current.rotation.set(0, st.heading + Math.PI, 0);
    }
    if (barRef.current) {
      barRef.current.position.set(BANNER_BACK, BANNER_DROP, 0);
      barRef.current.rotation.set(0, 0, 0);
    }
    notePlanePose(pos.x, pos.y, pos.z, st.heading);
  };

  useFrame((state, delta) => {
    const lift = liftRef.current;
    // A person in the seat flies the aircraft; the show's clock stops where it
    // is and resumes there when the seat is empty again.
    if (isFlying()) {
      if (lift) lift.visible = true;
      placePilot();
      const dt = Math.min(delta, 0.1);
      if (propRef.current) propRef.current.rotation.z += dt * 30;
      wasFlying.current = true;
      return;
    }
    if (wasFlying.current) {
      // Hand back without a teleport: the show resumes at the nearest point of
      // its own track, and its easings close the rest.
      wasFlying.current = false;
      const st = pilotState();
      travelled.current = nearestAlong(
        st.x,
        st.z,
        live.current.legHalf,
        centre.x,
        centre.z,
        live.current.nx,
        live.current.nz,
      );
    }
    const cam = state.camera as THREE.PerspectiveCamera;
    eyeFlat.set(cam.position.x - centre.x, cam.position.z - centre.z);
    const eye = Math.max(24, eyeFlat.length());
    const want = trackAxes(cam.position.x, cam.position.z, centre.x, centre.z);
    const lap = lapLength(live.current.legHalf);
    live.current.legHalf += (legHalfFor(eye) - live.current.legHalf) * 0.05;
    live.current.nx += (want.nx - live.current.nx) * 0.05;
    live.current.nz += (want.nz - live.current.nz) * 0.05;
    live.current.altitude +=
      (altitudeFor(tallest, cam.position.y, eye, eye > bounds * 2) - live.current.altitude) * 0.05;
    live.current.scale += (airshowScaleFor(eye) - live.current.scale) * 0.05;

    // A pass, then a rest: the aircraft leaves the picture and comes back, which
    // is what a fly-past is. `motion.ts` is right that a pulse running forever
    // is decoration, so this one ends — the next begins beyond the edge.
    const cycle = lap + PASS_REST;
    const along = travelled.current % cycle;
    const visible = active && !far && along <= lap;
    if (lift) lift.visible = visible;
    if (!visible) {
      if (along > lap) travelled.current = Math.floor(travelled.current / cycle + 1) * cycle;
      return;
    }
    if (reducedSettle(settled, () => place(settledDistance(live.current.legHalf)))) return;
    // The same clamp the crowd uses: a tab that slept must not teleport the
    // aircraft half a lap on the frame it wakes on.
    const dt = prefersReducedMotion() ? 0 : Math.min(delta, 0.1);
    if (dt === 0) return;
    travelled.current += SPEED * dt;
    place(along);
    if (propRef.current) propRef.current.rotation.z += dt * 30;
  });

  return (
    <group ref={liftRef} frustumCulled={false}>
      <group ref={shipRef}>
        <mesh geometry={hullGeo} material={hullMat} raycast={() => null} />
        <mesh
          ref={propRef}
          geometry={propGeo}
          material={hullMat}
          position={[0, 0, 1.9]}
          raycast={() => null}
        />
      </group>
      <group ref={bannerRef}>
        <mesh geometry={clothGeo} material={clothMat} raycast={() => null} />
        <mesh ref={barRef} geometry={barGeo} material={barMat} raycast={() => null} />
      </group>
    </group>
  );
}
