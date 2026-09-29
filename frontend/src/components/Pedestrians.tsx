"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The Ephe's — the citizens of Ephemora Skyline.
 *
 * They live on the EMPTY world already (wandering the ground), and once
 * the city stands they settle into full everyday life, Sims-style:
 * - some leave their buildings, some go inside (grow/shrink at the door)
 * - a taxi stops at the curb: someone walks up and gets in, someone steps
 *   out and walks away
 * - a bus stops at the bus stop: waiting Ephe's board, others step out
 * - pairs stop and chat under tiny speech bubbles full of 0s and 1s
 * - bodies come in all shapes: small, tall, broad, slim
 *
 * Everything is instanced (2 draw calls for all walkers) plus one taxi,
 * one bus, one bus-stop sign and a 3-sprite pool for the chat bubbles.
 */

interface StreetLine {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface HomeSpot {
  x: number;
  z: number;
  doorX: number;
  doorZ: number;
}

type Mode =
  "walk" | "enter" | "inside" | "exit" | "chat" | "waitBus" | "boarding" | "toTaxi" | "inTaxi";

interface Ephe {
  x: number;
  z: number;
  angle: number;
  speed: number;
  // body shape — like people
  fat: number; // 0.8 .. 1.5
  tall: number; // 0.75 .. 1.3
  phase: number;
  color: THREE.Color;
  // walk target
  tx: number;
  tz: number;
  pause: number;
  mode: Mode;
  home: number; // home spot index
  anim: number; // grow/shrink 0..1
  chatPartner: number;
  chatUntil: number;
  hidden: boolean; // inside a building / in a vehicle
  ride: "taxi" | "bus" | null;
}

const WALKER_COLORS = [
  "#f2efe8",
  "#e0d8c8",
  "#c9c4b8",
  "#d8cdb4",
  "#e8503c",
  "#e8b23c",
  "#a8a49a",
  "#9a8f7d",
];
const WALK_SPEED = 2.3;
const TURN_SPEED = 3.4;
const ARRIVE = 0.55;

function makeEphe(
  i: number,
  bounds: number,
  streets: StreetLine[] | null,
  homes: HomeSpot[],
): Ephe {
  const shape = ((i * 61) % 100) / 100;
  const e: Ephe = {
    x: 0,
    z: 0,
    angle: (i * 0.9) % (Math.PI * 2),
    speed: WALK_SPEED * (0.7 + ((i * 37) % 50) / 100),
    fat: 0.82 + shape * 0.68,
    tall: 0.78 + (((i * 29) % 100) / 100) * 0.5,
    phase: (i * 1.7) % (Math.PI * 2),
    color: new THREE.Color(WALKER_COLORS[i % WALKER_COLORS.length]!),
    tx: 0,
    tz: 0,
    pause: 0,
    mode: "walk",
    home: homes.length > 0 ? i % homes.length : -1,
    anim: 1,
    chatPartner: -1,
    chatUntil: 0,
    hidden: false,
    ride: null,
  };
  if (streets && streets.length > 0) {
    const s = streets[(i * 17) % streets.length]!;
    const t = ((i * 29) % 100) / 100;
    e.x = s.x1 + (s.x2 - s.x1) * t;
    e.z = s.z1 + (s.z2 - s.z1) * t;
  } else {
    const r = bounds * 0.5 * (((i * 41) % 100) / 100);
    const a = (i / 7) % (Math.PI * 2);
    e.x = Math.cos(a) * r;
    e.z = Math.sin(a) * r;
  }
  pickTarget(e, bounds, streets);
  return e;
}

function pickTarget(e: Ephe, bounds: number, streets: StreetLine[] | null): void {
  if (streets && streets.length > 0) {
    const near = streets.filter(
      (s) => Math.hypot(s.x1 - e.x, s.z1 - e.z) < 3 || Math.hypot(s.x2 - e.x, s.z2 - e.z) < 3,
    );
    const pool = near.length > 0 ? near : streets;
    const s = pool[(Math.floor(Math.random() * 997) + Math.floor(e.phase * 13)) % pool.length]!;
    const d1 = Math.hypot(s.x1 - e.x, s.z1 - e.z);
    const d2 = Math.hypot(s.x2 - e.x, s.z2 - e.z);
    const toFar = d1 < d2;
    const side = e.phase > Math.PI ? 1 : -1;
    const len = Math.max(Math.hypot(s.x2 - s.x1, s.z2 - s.z1), 0.001);
    const nx = (-(s.z2 - s.z1) / len) * 1.3 * side;
    const nz = ((s.x2 - s.x1) / len) * 1.3 * side;
    e.tx = (toFar ? s.x2 : s.x1) + nx;
    e.tz = (toFar ? s.z2 : s.z1) + nz;
  } else {
    const r = bounds * (0.15 + Math.random() * 0.85);
    const a = Math.random() * Math.PI * 2;
    e.tx = Math.cos(a) * r;
    e.tz = Math.sin(a) * r;
  }
}

/** Draw a tiny binary speech bubble onto a canvas texture. */
function drawBubble(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.clearRect(0, 0, 160, 80);
  ctx.fillStyle = "rgba(18, 18, 16, 0.92)";
  ctx.strokeStyle = "rgba(242, 239, 232, 0.5)";
  ctx.lineWidth = 2;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(4, 4, 152, 52, r);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(70, 55);
  ctx.lineTo(80, 55);
  ctx.lineTo(76, 70);
  ctx.closePath();
  ctx.fillStyle = "rgba(18, 18, 16, 0.92)";
  ctx.fill();
  ctx.font = 'bold 17px "JetBrains Mono", monospace';
  ctx.fillStyle = "#e8503c";
  ctx.textAlign = "center";
  ctx.fillText(text, 80, 38);
}

export function Pedestrians({
  streets = null,
  homes = [],
  count = 72,
  bounds = 42,
}: {
  streets?: StreetLine[] | null;
  homes?: HomeSpot[];
  count?: number;
  bounds?: number;
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const taxiRef = useRef<THREE.Group>(null);
  const busRef = useRef<THREE.Group>(null);
  const stopRef = useRef<THREE.Group>(null);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([null, null, null]);

  const cityLife = homes.length > 0 && !!streets && streets.length > 0;

  const walkers = useMemo<Ephe[]>(
    () => Array.from({ length: count }, (_, i) => makeEphe(i, bounds, streets, homes)),
    [count, bounds, streets, homes],
  );

  // ── Transit infrastructure (only with a city) ────────────────────────────
  const transit = useMemo(() => {
    if (!cityLife || !streets || streets.length === 0) {
      return {
        stopPoint: null,
        stopSegment: null as StreetLine | null,
        taxiCurb: null as { x: number; z: number } | null,
      };
    }
    // Bus stop: midpoint of the street segment nearest to the city centre
    let best = streets[0]!;
    let bestD = Infinity;
    for (const s of streets) {
      const mx = (s.x1 + s.x2) / 2;
      const mz = (s.z1 + s.z2) / 2;
      const d = mx * mx + mz * mz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    const len = Math.max(Math.hypot(best.x2 - best.x1, best.z2 - best.z1), 0.001);
    const nx = -(best.z2 - best.z1) / len;
    const nz = (best.x2 - best.x1) / len;
    const stopPoint = {
      x: (best.x1 + best.x2) / 2 + nx * 2.1,
      z: (best.z1 + best.z2) / 2 + nz * 2.1,
    };
    // Taxi curb: a different, fairly central segment
    const curbSeg = streets[Math.floor(streets.length / 2) % streets.length]!;
    const cl = Math.max(Math.hypot(curbSeg.x2 - curbSeg.x1, curbSeg.z2 - curbSeg.z1), 0.001);
    const cx = -(curbSeg.z2 - curbSeg.z1) / cl;
    const cz = (curbSeg.x2 - curbSeg.x1) / cl;
    const curb = {
      x: (curbSeg.x1 + curbSeg.x2) / 2 + cx * 1.7,
      z: (curbSeg.z1 + curbSeg.z2) / 2 + cz * 1.7,
    };
    return {
      stopPoint,
      stopSegment: { x1: stopPoint.x, z1: stopPoint.z, x2: best.x2, z2: best.z2 },
      taxiCurb: curb,
    };
  }, [cityLife, streets]);

  // Mutable simulation state lives in refs (no React re-renders per frame)
  const sim = useRef({
    walkers,
    transit,
    // scheduler timers
    tEnter: 4,
    tExit: 2.5,
    tChat: 5,
    tStopRefill: 6,
    tTaxi: 8,
    // taxi state: 0 drive, 1 dwell, 2 drive-off pause
    taxi: { mode: 0, timer: 6, phase: 0, passenger: -1 },
    // bus state: 0 drive, 1 dwell
    bus: { mode: 0, timer: 0, seg: 0, t: 0.2, dir: 1, dropped: 0 },
    busSeg: streets && streets.length > 0 ? streets[0]! : null,
    // chats: sprite idx → { a, b, until, textTimer, text }
    chats: [null, null, null] as Array<{
      a: number;
      b: number;
      until: number;
      textTimer: number;
      text: string;
    } | null>,
    textures: null as Array<THREE.CanvasTexture | null> | null,
    time: 0,
  });
  sim.current.walkers = walkers;
  sim.current.transit = transit;

  // Keep walkers array in sync when streets change
  if (sim.current.busSeg === null && streets && streets.length > 0)
    sim.current.busSeg = streets[0]!;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(0.14, 0.34, 3, 8), []);
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.11, 8, 6), []);

  const bubbleTextures = useMemo(() => {
    const make = (): THREE.CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 80;
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };
    return [make(), make(), make()];
  }, []);
  sim.current.textures = bubbleTextures;

  useLayoutEffect(() => {
    const mesh = bodyRef.current;
    if (!mesh) return;
    walkers.forEach((e, i) => mesh.setColorAt(i, e.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [walkers]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const walkToward = (e: Ephe, dt: number): boolean => {
    const dx = e.tx - e.x;
    const dz = e.tz - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE) return true;
    const want = Math.atan2(dx, dz);
    let diff = want - e.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.angle += Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, diff));
    const step = Math.min(e.speed * dt, dist);
    e.x += Math.sin(e.angle) * step;
    e.z += Math.cos(e.angle) * step;
    return false;
  };

  const randomVisibleWalker = (pred: (e: Ephe) => boolean): number => {
    const start = Math.floor(Math.random() * walkers.length);
    for (let k = 0; k < walkers.length; k++) {
      const i = (start + k) % walkers.length;
      if (pred(walkers[i]!)) return i;
    }
    return -1;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = (sim.current.time += dt);
    const bodies = bodyRef.current;
    const heads = headRef.current;
    if (!bodies || !heads) return;
    const S = sim.current;
    const st = S.transit;

    // ── schedulers (city life only) ────────────────────────────────────────
    if (cityLife && homes.length > 0) {
      S.tExit -= dt;
      if (S.tExit <= 0) {
        S.tExit = 2.5 + Math.random() * 3;
        const i = randomVisibleWalker((e) => e.mode === "inside");
        if (i >= 0) {
          const e = walkers[i]!;
          const h = homes[e.home % homes.length]!;
          e.mode = "exit";
          e.x = h.doorX;
          e.z = h.doorZ;
          e.anim = 0;
          e.hidden = false;
        }
      }
      S.tEnter -= dt;
      if (S.tEnter <= 0) {
        S.tEnter = 4.5 + Math.random() * 4;
        const i = randomVisibleWalker((e) => e.mode === "walk" && e.pause <= 0);
        if (i >= 0) {
          const e = walkers[i]!;
          const h = homes[e.home % homes.length]!;
          e.tx = h.doorX;
          e.tz = h.doorZ;
          e.mode = "enter";
        }
      }
    }

    // chat pairing
    S.tChat -= dt;
    if (S.tChat <= 0) {
      S.tChat = 5 + Math.random() * 4;
      const freeSprite = S.chats.findIndex((c) => c === null);
      if (freeSprite >= 0) {
        const a = randomVisibleWalker(
          (e) => e.mode === "walk" && e.pause <= 0 && e.hidden === false && e.chatPartner < 0,
        );
        if (a >= 0) {
          const ea = walkers[a]!;
          const b = randomVisibleWalker((e) => {
            if (e === ea || e.mode !== "walk" || e.hidden || e.chatPartner >= 0) return false;
            return Math.hypot(e.x - ea.x, e.z - ea.z) < 6;
          });
          if (b >= 0) {
            const eb = walkers[b]!;
            ea.mode = eb.mode = "chat";
            ea.chatPartner = b;
            eb.chatPartner = a;
            ea.chatUntil = eb.chatUntil = now + 4 + Math.random() * 3;
            let bits = "";
            for (let k = 0; k < 8; k++) bits += Math.random() < 0.5 ? "0" : "1";
            S.chats[freeSprite] = { a, b, until: ea.chatUntil, textTimer: 0, text: bits };
          }
        }
      }
    }
    for (let k = 0; k < S.chats.length; k++) {
      const c = S.chats[k];
      if (!c) continue;
      const ea = walkers[c.a]!;
      const eb = walkers[c.b]!;
      if (now > c.until || ea.mode !== "chat" || eb.mode !== "chat") {
        if (ea.mode === "chat") {
          ea.mode = "walk";
          ea.chatPartner = -1;
          pickTarget(ea, bounds, streets);
        }
        if (eb.mode === "chat") {
          eb.mode = "walk";
          eb.chatPartner = -1;
          pickTarget(eb, bounds, streets);
        }
        S.chats[k] = null;
        continue;
      }
      c.textTimer -= dt;
      if (c.textTimer <= 0) {
        c.textTimer = 0.9;
        c.text = c.text.slice(1) + (Math.random() < 0.5 ? "0" : "1");
        const tex = bubbleTextures[k];
        const ctx2d = (tex?.image as HTMLCanvasElement | undefined)?.getContext("2d");
        if (tex && ctx2d) {
          drawBubble(ctx2d, c.text);
          tex.needsUpdate = true;
        }
      }
      const sprite = spriteRefs.current[k];
      if (sprite) {
        sprite.visible = true;
        sprite.position.set(
          (ea.x + eb.x) / 2,
          2.05 + Math.sin(now * 2 + k) * 0.05,
          (ea.z + eb.z) / 2,
        );
      }
    }
    // hide unused sprites
    for (let k = 0; k < S.chats.length; k++) {
      if (!S.chats[k] && spriteRefs.current[k]) spriteRefs.current[k]!.visible = false;
    }

    // ── taxi ───────────────────────────────────────────────────────────────
    const taxiG = taxiRef.current;
    if (cityLife && st.taxiCurb && taxiG) {
      taxiG.visible = true;
      const taxi = S.taxi;
      taxi.timer -= dt;
      if (taxi.mode === 0) {
        // driving toward the curb
        const dx = st.taxiCurb.x - taxiG.position.x;
        const dz = st.taxiCurb.z - taxiG.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4 || taxi.timer <= 0) {
          taxi.mode = 1;
          taxi.timer = 6.5;
          taxi.phase = taxi.phase === 0 ? 1 : 0; // alternate pickup / dropoff
          if (taxi.phase === 1) {
            const i = randomVisibleWalker(
              (e) => e.mode === "walk" && e.pause <= 0 && e.chatPartner < 0,
            );
            if (i >= 0) {
              const e = walkers[i]!;
              e.mode = "toTaxi";
              e.ride = "taxi";
              e.tx = st.taxiCurb.x;
              e.tz = st.taxiCurb.z;
              taxi.passenger = i;
            }
          } else {
            // step-out: a hidden passenger appears at the curb
            const i = randomVisibleWalker((e) => e.mode === "inTaxi" && e.ride === "taxi");
            if (i >= 0) {
              const e = walkers[i]!;
              e.mode = "exit";
              e.ride = null;
              e.x = st.taxiCurb.x;
              e.z = st.taxiCurb.z;
              e.anim = 0;
              e.hidden = false;
            }
            taxi.passenger = -1;
          }
        } else {
          const ang = Math.atan2(dx, dz);
          taxiG.position.x += Math.sin(ang) * Math.min(6 * dt, d);
          taxiG.position.z += Math.cos(ang) * Math.min(6 * dt, d);
          taxiG.rotation.y = ang;
        }
      } else if (taxi.mode === 1 && taxi.timer <= 0) {
        taxi.mode = 2;
        taxi.timer = 7 + Math.random() * 5;
        taxiG.visible = true;
      } else if (taxi.mode === 2 && taxi.timer <= 0) {
        taxi.mode = 0;
        taxi.timer = 12;
        // drive toward a fresh curb next round
      }
      // passengers walk to the taxi during dwell
      if (taxi.passenger >= 0) {
        const e = walkers[taxi.passenger]!;
        if (e.mode === "toTaxi" && Math.hypot(e.x - st.taxiCurb.x, e.z - st.taxiCurb.z) < 0.8) {
          e.mode = "inTaxi";
          e.hidden = true;
        }
      }
    }

    // ── bus ────────────────────────────────────────────────────────────────
    const busG = busRef.current;
    const stopG = stopRef.current;
    if (cityLife && st.stopPoint && busG && stopG) {
      busG.visible = true;
      stopG.visible = true;
      const bus = S.bus;
      if (bus.mode === 0) {
        const seg = S.busSeg;
        if (seg) {
          const len = Math.max(Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1), 0.001);
          bus.t += ((dt * 5.5) / len) * bus.dir;
          if (bus.t > 1 || bus.t < 0) {
            // pick a connected segment
            const endX = bus.dir > 0 ? seg.x2 : seg.x1;
            const endZ = bus.dir > 0 ? seg.z2 : seg.z1;
            const nexts = (streets ?? []).filter(
              (s) =>
                (Math.hypot(s.x1 - endX, s.z1 - endZ) < 2 && s !== seg) ||
                (Math.hypot(s.x2 - endX, s.z2 - endZ) < 2 && s !== seg),
            );
            if (nexts.length > 0) {
              const n = nexts[Math.floor(Math.random() * nexts.length)]!;
              const fromStart = Math.hypot(n.x1 - endX, n.z1 - endZ) < 2;
              S.busSeg = n;
              bus.t = fromStart ? 0 : 1;
              bus.dir = fromStart ? 1 : -1;
            } else {
              bus.dir *= -1;
              bus.t = THREE.MathUtils.clamp(bus.t, 0, 1);
            }
          }
          const x = seg.x1 + (seg.x2 - seg.x1) * bus.t;
          const z = seg.z1 + (seg.z2 - seg.z1) * bus.t;
          busG.position.set(x, 0, z);
          busG.rotation.y =
            Math.atan2(seg.x2 - seg.x1, seg.z2 - seg.z1) + (bus.dir > 0 ? 0 : Math.PI);
          // arrive at the stop?
          const dStop = Math.hypot(x - st.stopPoint.x, z - st.stopPoint.z);
          const waiting = walkers.filter((e) => e.mode === "waitBus").length;
          if (dStop < 3 && (waiting > 0 || bus.dropped <= 0)) {
            bus.mode = 1;
            bus.timer = 5.5;
            bus.dropped = (bus.dropped + 1) % 3;
          }
        }
      } else {
        bus.timer -= dt;
        // boarding: waiting Ephe's walk in and vanish
        for (const e of walkers) {
          if (
            e.mode === "waitBus" &&
            Math.hypot(e.x - st.stopPoint.x, e.z - st.stopPoint.z) < 1.4
          ) {
            e.mode = "boarding";
            e.anim = 1;
          } else if (e.mode === "boarding") {
            e.anim -= dt * 1.6;
            if (e.anim <= 0) {
              e.mode = "inTaxi"; // hidden, riding the bus
              e.ride = "bus";
              e.hidden = true;
            }
          }
        }
        // after a moment, someone steps off
        if (bus.timer < 2.5) {
          const hidden = randomVisibleWalker((e) => e.mode === "inTaxi" && e.ride === "bus");
          if (hidden >= 0) {
            const e = walkers[hidden]!;
            e.mode = "exit";
            e.ride = null;
            e.x = st.stopPoint.x + (Math.random() - 0.5);
            e.z = st.stopPoint.z + (Math.random() - 0.5);
            e.anim = 0;
            e.hidden = false;
          }
        }
        if (bus.timer <= 0) {
          bus.mode = 0; // riders without a stop stay on board until the next pass
        }
      }
    }

    // ── stop refill: send walkers to wait at the bus stop ──────────────────
    if (cityLife && st.stopPoint) {
      S.tStopRefill -= dt;
      const waiting = walkers.filter((e) => e.mode === "waitBus").length;
      if (S.tStopRefill <= 0 && waiting < 3) {
        S.tStopRefill = 6 + Math.random() * 6;
        const i = randomVisibleWalker(
          (e) => e.mode === "walk" && e.pause <= 0 && e.chatPartner < 0,
        );
        if (i >= 0) {
          const e = walkers[i]!;
          const slot = waiting % 3;
          e.mode = "waitBus";
          e.tx = st.stopPoint.x + [0, 0.9, -0.9][slot]!;
          e.tz = st.stopPoint.z + [0.5, -0.4, -0.4][slot]!;
        }
      }
    }

    // ── walkers ────────────────────────────────────────────────────────────
    walkers.forEach((e, i) => {
      let visibleScale = 1;
      if (
        e.hidden ||
        ((e.mode === "enter" || e.mode === "exit" || e.mode === "boarding") && e.anim <= 0)
      ) {
        visibleScale = 0;
      }

      if (e.mode === "walk" || e.mode === "waitBus" || e.mode === "toTaxi") {
        if (e.pause > 0) {
          e.pause -= dt;
        } else {
          const arrived = walkToward(e, dt);
          if (arrived) {
            if (e.mode === "waitBus") {
              // stand and wait
              e.pause = 1 + Math.random();
            } else if (Math.random() < 0.22) {
              e.pause = 0.7 + Math.random() * 2.2;
            }
            if (e.mode === "walk") pickTarget(e, bounds, streets);
          }
        }
      } else if (e.mode === "enter") {
        const arrived = walkToward(e, dt);
        if (arrived) {
          e.anim -= dt * 1.5;
          if (e.anim <= 0) {
            e.mode = "inside";
            e.hidden = true;
          }
        }
      } else if (e.mode === "exit") {
        e.anim = Math.min(1, e.anim + dt * 1.6);
        if (e.anim >= 1) {
          e.mode = "walk";
          pickTarget(e, bounds, streets);
        }
      } else if (e.mode === "chat") {
        // face the partner, gentle bob only
        const p = walkers[e.chatPartner];
        if (p) {
          const want = Math.atan2(p.x - e.x, p.z - e.z);
          let diff = want - e.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          e.angle += Math.max(-2 * dt, Math.min(2 * dt, diff));
        }
      } else if (e.mode === "boarding") {
        // handled in the bus block (shrink)
        e.anim = Math.max(0, e.anim - dt * 1.6);
      }

      // ── render transform ─────────────────────────────────────────────────
      const moving = (e.mode === "walk" || e.mode === "toTaxi") && e.pause <= 0;
      const grow =
        e.mode === "exit" || e.mode === "enter"
          ? Math.max(e.anim, 0)
          : e.mode === "boarding"
            ? Math.max(e.anim, 0)
            : 1;
      const bob = moving ? Math.abs(Math.sin(now * 7 * e.tall + e.phase)) * 0.05 : 0;
      const y = (0.36 + bob) * e.tall * grow;

      dummy.position.set(e.x, y, e.z);
      dummy.rotation.set(
        moving ? Math.sin(now * 7 + e.phase) * 0.06 : Math.sin(now * 1.6 + e.phase) * 0.02,
        e.angle,
        0,
      );
      dummy.scale.set(
        e.fat * grow * visibleScale,
        e.tall * grow * visibleScale,
        e.fat * grow * visibleScale,
      );
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);

      dummy.position.set(e.x, y + 0.34 * e.tall * grow, e.z);
      dummy.scale.set(
        e.fat * grow * visibleScale,
        e.tall * grow * visibleScale,
        e.fat * grow * visibleScale,
      );
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  });

  return (
    <group frustumCulled={false}>
      <instancedMesh ref={bodyRef} args={[bodyGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[headGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#e8d8b0" roughness={0.7} />
      </instancedMesh>

      {/* Taxi — brand red, stops at the curb */}
      <group ref={taxiRef} position={[0, 0, -60]} visible={false}>
        <mesh position={[0, 0.34, 0]}>
          <boxGeometry args={[1.05, 0.42, 2.1]} />
          <meshStandardMaterial color="#e8503c" roughness={0.35} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.66, -0.15]}>
          <boxGeometry args={[0.9, 0.3, 1.1]} />
          <meshStandardMaterial color="#1c1c1a" roughness={0.2} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.16, 1.0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.12, 10]} />
          <meshStandardMaterial color="#0c0c0b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.16, -1.0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.12, 10]} />
          <meshStandardMaterial color="#0c0c0b" roughness={0.9} />
        </mesh>
      </group>

      {/* Bus — brand red with a cream window strip */}
      <group ref={busRef} position={[0, 0, -80]} visible={false}>
        <mesh position={[0, 0.75, 0]}>
          <boxGeometry args={[1.5, 1.15, 4.6]} />
          <meshStandardMaterial color="#e8503c" roughness={0.4} metalness={0.25} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[1.52, 0.4, 4.2]} />
          <meshStandardMaterial color="#f2efe8" roughness={0.15} metalness={0.3} />
        </mesh>
        {[-1.6, 1.6].map((z) => (
          <mesh key={z} position={[0, 0.22, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.14, 10]} />
            <meshStandardMaterial color="#0c0c0b" roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Bus stop sign */}
      <group ref={stopRef} visible={false}>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 1.8, 6]} />
          <meshStandardMaterial color="#8f8b82" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.5, 0.32, 0.05]} />
          <meshStandardMaterial
            color="#e8503c"
            emissive="#e8503c"
            emissiveIntensity={0.35}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* Chat bubbles — binary small talk */}
      {bubbleTextures.map((tex, i) => (
        <sprite
          key={`bubble-${i}`}
          ref={(s) => {
            spriteRefs.current[i] = s;
          }}
          visible={false}
          scale={[2.3, 1.15, 1]}
        >
          <spriteMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}
