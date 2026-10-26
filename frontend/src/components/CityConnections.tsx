"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import { ENV } from "../city/palette";
import { reducedSettle } from "../city/motion";
import { planImportArcs, type ArcAnchor, type ImportArc } from "../city/importArcs";
import { placeLabel, HUD_SURFACES, TOWARD_GLYPH, type Box } from "../city/labelPlacement";
import { useStore } from "../stores/useStore";
import { formatCount, t } from "../i18n";

/**
 * Import relationships as glowing arcs:
 * - file → file arcs between rendered buildings (current level), each one a
 *   dark casing under a direction-coloured core, the heaviest carrying a label
 * - dir → dir arcs between top-level blocks (overview level) — the
 *   architecture map of the repo
 */

interface ConnectionProps {
  layout: DirLayout;
  fileConnections: Array<{ from: string; to: string; weight: number }>;
  dirConnections: Array<{ from: string; to: string; weight: number }>;
  showDirArcs: boolean;
  showFileArcs?: boolean;
  /**
   * When a building is selected, static file arcs collapse to ONLY that
   * building's edges (idle cities show no file arcs at all — the
   * DependencyFlows particles take over).
   */
  selectedFileId?: string | null;
  /**
   * DEPENDENCIES view mode (spec §14): the buildings recede and the arcs
   * take the stage — thicker tubes and a brighter baseline. The hue stays the
   * direction's own; the mode is a lens over the same relationships, not a
   * second colour language.
   */
  highlight?: boolean;
}

const DIR_ARCS_MAX = 26;

/** Core radius. The emphasised arc is the one the reader is meant to read. */
const coreRadius = (arc: ImportArc, highlight: boolean): number =>
  arc.emphasized ? (highlight ? 0.12 : 0.09) : highlight ? 0.08 : 0.055;

/** The core is what carries the meaning; the casing is what carries the line. */
const CASING_SCALE = 2.4;

/**
 * Re-read at 4 Hz, not per frame: seven `getBoundingClientRect` calls per frame
 * is a layout read on every frame of a scene that is trying to hold 60.
 */
const HUD_REFRESH_MS = 250;

/** The plate's own box before the browser has laid it out. */
const PLATE_FALLBACK: { w: number; h: number } = { w: 220, h: 40 };

/** How many neighbours carry a plate. Beyond this the plaza is a wall of
 *  labels and the impact list already names every one of them. */
const NACHBARN_MAX = 6;

/**
 * The gap one plate keeps from every other surface, CSS px.
 *
 * `placeLabel` treats 1 px of contact as no contact (`EPS`), and a plate reads
 * the previous frame of a sibling placed after it — measured, those two leave
 * 9 px² of overlap between two neighbour plates, which is a hairline but not a
 * gap. Reserving each plate inflated by this much makes the distance the rule
 * rather than the outcome.
 */
const PLATE_ABSTAND = 4;

/** Scratch — one per module, not one per frame. */
const _projected = new THREE.Vector3();
const _plattenPunkt = new THREE.Vector3();

function hudBoxes(canvasBox: DOMRect | null): Box[] {
  const out: Box[] = [];
  const ox = canvasBox?.left ?? 0;
  const oy = canvasBox?.top ?? 0;
  for (const selector of HUD_SURFACES) {
    for (const node of document.querySelectorAll(selector)) {
      const el = node as HTMLElement;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.push({ x: r.x - ox, y: r.y - oy, w: r.width, h: r.height });
    }
  }
  return out;
}

function tube(
  start: ArcAnchor,
  apex: { x: number; y: number; z: number },
  end: ArcAnchor,
  radius: number,
): THREE.TubeGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(apex.x, apex.y, apex.z),
    new THREE.Vector3(end.x, end.y, end.z),
  );
  return new THREE.TubeGeometry(curve, 20, radius, 5, false);
}

function arcGeometry(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  radius: number,
): THREE.TubeGeometry {
  const start = new THREE.Vector3(x1, y1, z1);
  const end = new THREE.Vector3(x2, y2, z2);
  const dist = start.distanceTo(end);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  mid.y += Math.min(dist * 0.24 + 3.5, 42);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  return new THREE.TubeGeometry(curve, 20, radius, 5, false);
}

export function CityConnections({
  layout,
  fileConnections,
  dirConnections,
  showDirArcs,
  showFileArcs = true,
  selectedFileId = null,
  highlight = false,
}: ConnectionProps) {
  const lang = useStore((s) => s.prefs.lang);
  const settledRef = useRef(false);
  const buildingPos = useMemo(() => {
    const map = new Map<string, ArcAnchor>();
    for (const b of layout.buildings)
      map.set(b.file.id, { x: b.x, y: b.h + 0.6, z: b.z, name: b.file.name, path: b.file.path });
    return map;
  }, [layout]);

  const blockPos = useMemo(() => {
    const map = new Map<string, { x: number; z: number; w: number }>();
    for (const b of layout.blocks) map.set(b.dir.name, { x: b.x, z: b.z, w: b.w });
    return map;
  }, [layout]);

  // ── File → file arcs ─────────────────────────────────────────────────────
  const arcs = useMemo(
    () => planImportArcs(fileConnections, buildingPos, showFileArcs ? selectedFileId : null),
    [fileConnections, buildingPos, showFileArcs, selectedFileId],
  );
  const labelled = useMemo(() => arcs.find((a) => a.emphasized) ?? null, [arcs]);

  // The plate is placed by the same rule the tests measure: it sits on the
  // arc's apex when the apex is somewhere a reader can look, and as close to it
  // as the HUD allows when it is not — with a glyph pointing back at the apex
  // it had to leave.
  const plateRef = useRef<HTMLDivElement | null>(null);
  const hudCache = useRef<{ at: number; canvas: DOMRect | null; boxes: Box[] }>({
    at: -Infinity,
    canvas: null,
    boxes: [],
  });
  const reserviertRef = useRef(new Map<string, Box>());
  const plattenRef = useRef(new Map<string, HTMLDivElement | null>());
  const anderePlatten = (eigenes: string): Box[] =>
    [...reserviertRef.current.entries()]
      .filter(([k]) => k !== eigenes)
      .map(([, b]): Box => ({
        x: b.x - PLATE_ABSTAND,
        y: b.y - PLATE_ABSTAND,
        w: b.w + PLATE_ABSTAND * 2,
        h: b.h + PLATE_ABSTAND * 2,
      }));

  const calculatePosition = useCallback(
    (
      object: THREE.Object3D,
      camera: THREE.Camera,
      size: { width: number; height: number },
    ): number[] => {
      _projected.setFromMatrixPosition(object.matrixWorld).project(camera);
      const anchor = {
        x: (_projected.x * size.width) / 2 + size.width / 2,
        y: -((_projected.y * size.height) / 2) + size.height / 2,
      };
      const now = Date.now();
      if (now - hudCache.current.at > HUD_REFRESH_MS) {
        const canvas = document.querySelector("canvas")?.getBoundingClientRect() ?? null;
        hudCache.current = { at: now, canvas, boxes: hudBoxes(canvas) };
      }
      const plate = plateRef.current;
      const box = {
        w: plate?.offsetWidth || PLATE_FALLBACK.w,
        h: plate?.offsetHeight || PLATE_FALLBACK.h,
      };
      const placed = placeLabel(anchor, box, { w: size.width, h: size.height }, [
        ...hudCache.current.boxes,
        ...anderePlatten("bogen"),
      ]);
      reserviertRef.current.set("bogen", { x: placed.x, y: placed.y, w: box.w, h: box.h });
      if (plate) {
        const glyph = placed.toward ? TOWARD_GLYPH[placed.toward] : "";
        if (plate.dataset.toward !== glyph) plate.dataset.toward = glyph;
        const detached = placed.clamped ? "1" : null;
        if (detached === null) {
          if ("detached" in plate.dataset) delete plate.dataset.detached;
        } else if (plate.dataset.detached !== detached) plate.dataset.detached = detached;
      }
      // drei centres a `center` Html on the returned point.
      return [placed.x + box.w / 2, placed.y + box.h / 2];
    },
    [],
  );

  /**
   * Z-02 — every neighbour tower carries a plate of its own.
   *
   * The target frame names the relationship at each end of it: the reader who
   * selected a building sees, over every connected tower, what that tower is —
   * its name, its size, how much review is still open on it. The city drew one
   * plate so far, on one arc, and §06.07 measured that in the demo arrival it
   * lay 100 % under the open context card (6 410 px, the same area in two
   * loads): the one sentence the scene had was the one the reader could not
   * read.
   *
   * The plates share the arc plate's rule — `placeLabel` with the HUD as
   * reserved surfaces — and add one thing to it: every other plate is reserved
   * too, so a neighbour's name never sits on a neighbour's name. The map is
   * written as each plate is placed and read by the ones placed after it; a
   * plate therefore sees the previous frame of a later sibling, which is one
   * frame of lag at 4 Hz and invisible.
   */
  const nachbarn = useMemo(() => {
    if (!selectedFileId || !showFileArcs) return [];
    const out: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      z: number;
      loc: number;
      funde: number;
    }> = [];
    const gesehen = new Set<string>();
    for (const a of arcs) {
      const andereId: string = a.from === selectedFileId ? a.to : a.from;
      if (andereId === selectedFileId || gesehen.has(andereId)) continue;
      const gebaeude = layout.buildings.find((b) => b.file.id === andereId);
      if (!gebaeude) continue;
      const anker = a.from === selectedFileId ? a.end : a.start;
      gesehen.add(andereId);
      out.push({
        id: andereId,
        name: gebaeude.file.name,
        x: anker.x,
        y: anker.y,
        z: anker.z,
        loc: gebaeude.file.linesOfCode,
        funde: gebaeude.file.findings.length,
      });
      if (out.length >= NACHBARN_MAX) break;
    }
    return out;
  }, [arcs, selectedFileId, showFileArcs, layout]);

  const plattenPosition = useCallback(
    (id: string) =>
      (
        object: THREE.Object3D,
        camera: THREE.Camera,
        size: { width: number; height: number },
      ): number[] => {
        _plattenPunkt.setFromMatrixPosition(object.matrixWorld).project(camera);
        const anchor = {
          x: (_plattenPunkt.x * size.width) / 2 + size.width / 2,
          y: -((_plattenPunkt.y * size.height) / 2) + size.height / 2,
        };
        const now = Date.now();
        if (now - hudCache.current.at > HUD_REFRESH_MS) {
          const canvas = document.querySelector("canvas")?.getBoundingClientRect() ?? null;
          hudCache.current = { at: now, canvas, boxes: hudBoxes(canvas) };
        }
        const el = plattenRef.current.get(id);
        const box = {
          w: el?.offsetWidth || PLATE_FALLBACK.w,
          h: el?.offsetHeight || PLATE_FALLBACK.h,
        };
        const placed = placeLabel(anchor, box, { w: size.width, h: size.height }, [
          ...hudCache.current.boxes,
          ...anderePlatten(id),
        ]);
        reserviertRef.current.set(id, { x: placed.x, y: placed.y, w: box.w, h: box.h });
        if (el) {
          const glyph = placed.toward ? TOWARD_GLYPH[placed.toward] : "";
          if (el.dataset.toward !== glyph) el.dataset.toward = glyph;
          const detached = placed.clamped ? "1" : null;
          if (detached === null) {
            if ("detached" in el.dataset) delete el.dataset.detached;
          } else if (el.dataset.detached !== detached) el.dataset.detached = detached;
        }
        return [placed.x + box.w / 2, placed.y + box.h / 2];
      },
    [],
  );

  /** One positioner per plate id, so a re-render does not hand drei a new
   *  callback every time the selection changes. */
  const positionerRef = useRef(new Map<string, ReturnType<typeof plattenPosition>>());
  const positionerFuer = (id: string): ReturnType<typeof plattenPosition> => {
    let fn = positionerRef.current.get(id);
    if (!fn) {
      fn = plattenPosition(id);
      positionerRef.current.set(id, fn);
    }
    return fn;
  };

  const fileGeos = useMemo(
    () =>
      arcs.map((arc) => ({
        arc,
        casing: tube(arc.start, arc.apex, arc.end, coreRadius(arc, highlight) * CASING_SCALE),
        core: tube(arc.start, arc.apex, arc.end, coreRadius(arc, highlight)),
      })),
    [arcs, highlight],
  );

  // ── Dir → dir arcs (overview architecture map) ───────────────────────────
  const dirGeos = useMemo(() => {
    if (!showDirArcs) return [];
    const geos: THREE.TubeGeometry[] = [];
    for (const conn of dirConnections) {
      if (geos.length >= DIR_ARCS_MAX) break;
      const a = conn.from === "" ? { x: 0, z: 0 } : blockPos.get(conn.from);
      const b = conn.to === "" ? { x: 0, z: 0 } : blockPos.get(conn.to);
      if (!a || !b) continue;
      geos.push(arcGeometry(a.x, 3.2, a.z, b.x, 3.2, b.z, highlight ? 0.16 : 0.1));
    }
    return geos;
  }, [dirConnections, blockPos, showDirArcs, highlight]);

  const casingMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ENV.arcCasing),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const outMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ENV.importOut),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const inMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ENV.importIn),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const dirMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ENV.connection),
        transparent: true,
        opacity: highlight ? 0.65 : 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [highlight],
  );

  useEffect(() => {
    return () => {
      for (const g of fileGeos) {
        g.casing.dispose();
        g.core.dispose();
      }
      for (const g of dirGeos) g.dispose();
    };
  }, [fileGeos, dirGeos]);

  useEffect(() => {
    return () => {
      casingMat.dispose();
      outMat.dispose();
      inMat.dispose();
      dirMat.dispose();
    };
  }, [casingMat, outMat, inMat, dirMat]);

  // The pulse written onto the shared materials. `t = 0` is the static
  // midpoint of each sine, which is what reduced motion holds.
  const writeOpacity = (t: number): void => {
    // In DEPENDENCIES mode the pulsing baseline rides higher — the mode must
    // never pulse the arcs back down to their idle subtlety.
    // One shared material per arc group: EVERY arc pulses. The old code
    // attached the animated ref to arc #0 only, so the rest stayed frozen at
    // their static mount opacity (#16b).
    // The cores stay within 0.75–1.0 of their own colour: below that the
    // casing starts reading as the line and the direction stops being legible.
    const floor = highlight ? 0.9 : 0.78;
    const swing = highlight ? 0.1 : 0.12;
    outMat.opacity = inMat.opacity = floor + swing * (0.5 + Math.sin(t * 1.6) * 0.5) - swing / 2;
    casingMat.opacity = 0.88 + Math.sin(t * 1.6) * 0.04;
    dirMat.opacity = highlight
      ? 0.65 + Math.sin(t * 1.1 + 1) * 0.1
      : 0.3 + Math.sin(t * 1.1 + 1) * 0.1;
  };

  useFrame(({ clock }) => {
    // Reduced motion: the arcs keep their average brightness — a dependency
    // vein that does not breathe is still a dependency vein.
    if (reducedSettle(settledRef, () => writeOpacity(0))) return;
    writeOpacity(clock.elapsedTime);
  });

  return (
    <group>
      {fileGeos.map(({ arc, casing, core }) => (
        <group key={`${arc.from}|${arc.to}`}>
          {/* The casing is drawn first and the core over it, so the pair reads
              as one stroked line whichever way the camera looks at it. */}
          <mesh geometry={casing} material={casingMat} renderOrder={1} />
          <mesh
            geometry={core}
            material={arc.direction === "out" ? outMat : inMat}
            renderOrder={2}
          />
        </group>
      ))}
      {labelled && (
        <Html
          center
          position={[labelled.apex.x, labelled.apex.y, labelled.apex.z]}
          zIndexRange={[8, 0]}
          calculatePosition={calculatePosition}
        >
          <div
            ref={plateRef}
            className={`cf-plate cf-plate-import ${
              labelled.direction === "out" ? "is-out" : "is-in"
            }`}
          >
            <div className="cf-plate-name">
              {labelled.start.name} → {labelled.end.name}
            </div>
            <div className="cf-plate-under">
              {t(lang, labelled.weight === 1 ? "arc.namedOne" : "arc.namedMany", {
                count: labelled.weight,
              })}
            </div>
          </div>
        </Html>
      )}
      {nachbarn.map((n) => (
        <Html
          key={`np-${n.id}`}
          center
          position={[n.x, n.y, n.z]}
          zIndexRange={[8, 0]}
          calculatePosition={positionerFuer(n.id)}
        >
          <div
            ref={(el) => {
              plattenRef.current.set(n.id, el);
            }}
            className="cf-plate cf-plate-neighbour"
          >
            <div className="cf-plate-name">{n.name}</div>
            <div className="cf-plate-under">
              {t(lang, "plate.lines", { count: formatCount(lang, n.loc) })}
            </div>
            <div className="cf-plate-under">
              {n.funde === 0
                ? t(lang, "plate.findingsNone")
                : t(lang, n.funde === 1 ? "plate.findingsOne" : "plate.findingsMany", {
                    count: formatCount(lang, n.funde),
                  })}
            </div>
          </div>
        </Html>
      ))}
      {dirGeos.map((geo, i) => (
        <mesh key={`da-${i}`} geometry={geo} material={dirMat} />
      ))}
    </group>
  );
}
