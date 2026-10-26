import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  buildOpenWorld,
  deriveTransit,
  distanceToNetwork,
  distanceToSegment,
  distanceToSidewalk,
  insideParcel,
  crossesStreetOffCrosswalk,
  standOnLane,
  openWorldStreets,
  openWorldParcels,
  OPEN_WORLD_REACH,
  OPEN_WORLD_DIRECT_STEP,
  CROSSWALK_TOLERANCE,
  VEHICLE_BOXES,
  VEHICLE_WHEELS,
  STOP_BOARD,
  STOP_POST,
} from "../src/city/openWorldStreets";
import { CURB_OFFSET, graphPath } from "../src/city/sidewalks";
import { ENV, SEVERITY_COLOR } from "../src/city/palette";
import type { BuildSite, StreetLine } from "../src/city/layout";

/**
 * The open world — the world before the first scan — gets its own street
 * network so the crowd has kerbs to walk a graph along and traffic has a road.
 * These are the guards for that geometry. They are stated as geometry, not as
 * pixels, because the two rules the built city already keeps have to hold on
 * bare ground too: an Ephe crosses the street only at a zebra, and never cuts
 * through a block.
 *
 * Every assertion here is the same predicate the browser measurement runs
 * against the live position tape, so what passes in this file is what was
 * measured on screen.
 */

const world = buildOpenWorld();
const HALF_ASPHALT = 1.9; // the carriageway is 3.8 wide, half of it is 1.9

describe("the open world's street grid", () => {
  it("is a real grid: three lines per axis, evenly pitched, closed by a beltway", () => {
    // 6 inner + 4 ring. The ring is what stops any carriageway from ending free
    // on bare ground — trafficLivery.test.ts holds that rule as geometry.
    expect(world.streets).toHaveLength(10);
    const isRing = (s: StreetLine): boolean =>
      Math.abs(s.z1 - s.z2) < 0.01
        ? Math.abs(s.z1) === OPEN_WORLD_REACH
        : Math.abs(s.x1) === OPEN_WORLD_REACH;
    const inner = world.streets.filter((s) => !isRing(s));
    expect(inner).toHaveLength(6);
    const h = inner.filter((s) => Math.abs(s.z1 - s.z2) < 0.01);
    const v = inner.filter((s) => Math.abs(s.x1 - s.x2) < 0.01);
    expect(h).toHaveLength(3);
    expect(v).toHaveLength(3);
    const zs = h.map((s) => s.z1).sort((a, b) => a - b);
    const xs = v.map((s) => s.x1).sort((a, b) => a - b);
    expect(zs).toEqual(xs);
    expect(zs[1]! - zs[0]!).toBeCloseTo(zs[2]! - zs[1]!, 6);
    for (const s of world.streets) {
      expect(Math.abs(s.x2 - s.x1) + Math.abs(s.z2 - s.z1)).toBeCloseTo(2 * OPEN_WORLD_REACH, 6);
    }
  });

  it("builds a graph the whole crowd can move around on", () => {
    // connected: a walker put down at any node can reach every other node
    const start = 0;
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length) {
      for (const nb of world.network.nodes[queue.shift()!]!.adj) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
    expect(seen.size).toBe(world.network.nodes.length);
    // and routing works, not just wandering: a path exists across the grid
    const path = graphPath(world.network, 0, world.network.nodes.length - 1);
    expect(path.length).toBeGreaterThan(2);
    expect(world.network.nodes.length).toBeGreaterThan(100);
  });

  it("puts every node on a kerb and never inside a block", () => {
    for (const n of world.network.nodes) {
      // exactly one kerb line away from the nearest street
      expect(distanceToSidewalk({ streets: world.streets }, n.x, n.z)).toBeLessThan(0.02);
      expect(insideParcel(world, n.x, n.z)).toBeNull();
      // and the node is actually ON the graph the crowd walks, not a dot
      // standing somewhere near it — the browser measurement judges the tape
      // with this same distance
      expect(distanceToNetwork(world, n.x, n.z), `${n.x},${n.z} off the graph`).toBeLessThan(0.001);
      // a node that stands on the carriageway is standing in a crossroads —
      // the intersection square, where the two streets' kerb bands overlap —
      // and never in the middle of a lane between crossings
      const onAsphalt = world.streets.filter((s) => distanceToSegment(n.x, n.z, s) < HALF_ASPHALT);
      if (onAsphalt.length > 0) {
        expect(onAsphalt.length, `${n.x},${n.z} inside one street's lane`).toBeGreaterThan(1);
      }
    }
  });

  it("is deterministic: two builds of the open world are the same city", () => {
    const a = buildOpenWorld();
    expect(a.network.nodes.length).toBe(world.network.nodes.length);
    expect(a.plates.length).toBe(world.plates.length);
    expect(a.transit.stopPoint).toEqual(world.transit.stopPoint);
    // and the pieces the world is assembled from are the exported geometry,
    // so a caller that builds its own streets and blocks gets the same ground
    expect(openWorldStreets()).toEqual(world.streets);
    expect(openWorldParcels()).toEqual(world.parcels);
  });
});

describe("the two rules the crowd lives by, on the grid itself", () => {
  const rules = { streets: world.streets, crosswalks: world.network.crosswalks };

  it("never crosses a street outside a crosswalk, edge by edge", () => {
    const nodes = world.network.nodes;
    const offenders: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (const j of nodes[i]!.adj) {
        if (j <= i) continue;
        const a = nodes[i]!;
        const b = nodes[j]!;
        const bad = crossesStreetOffCrosswalk(rules, a.x, a.z, b.x, b.z);
        if (bad) offenders.push(`${i}->${j} at ${bad.x.toFixed(2)},${bad.z.toFixed(2)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does cross streets, at the zebras it draws", () => {
    // Without this, the guard above would be true because nobody ever crosses
    // anything: every crosswalk has to be an edge the graph can actually take.
    let crossed = 0;
    const nodes = world.network.nodes;
    for (const cw of world.network.crosswalks) {
      for (let i = 0; i < nodes.length; i++) {
        for (const j of nodes[i]!.adj) {
          if (j <= i) continue;
          const mid = { x: (nodes[i]!.x + nodes[j]!.x) / 2, z: (nodes[i]!.z + nodes[j]!.z) / 2 };
          if (Math.hypot(mid.x - cw.x, mid.z - cw.z) <= 0.35) crossed++;
        }
      }
    }
    expect(crossed).toBeGreaterThanOrEqual(world.network.crosswalks.length);
  });

  it("keeps every graph edge out of a block and on the kerb band", () => {
    const nodes = world.network.nodes;
    for (let i = 0; i < nodes.length; i++) {
      for (const j of nodes[i]!.adj) {
        if (j <= i) continue;
        const a = nodes[i]!;
        const b = nodes[j]!;
        for (let k = 1; k < 20; k++) {
          const t = k / 20;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          expect(insideParcel(world, x, z), `edge ${i}->${j} cuts a block`).toBeNull();
          // a zebra edge is allowed over the asphalt; everything else stays on
          // the walking band
          const isZebra = world.network.crosswalks.some(
            (cw) => Math.hypot(cw.x - x, cw.z - z) <= CROSSWALK_TOLERANCE,
          );
          if (!isZebra) {
            expect(
              distanceToSidewalk({ streets: world.streets }, x, z),
              `edge ${i}->${j} leaves the kerb band at ${x.toFixed(1)},${z.toFixed(1)}`,
            ).toBeLessThan(1.4);
          }
        }
      }
    }
  });

  it("never lets a legal off-graph goal be reached by an illegal straight hop", () => {
    // The component may walk a straight step when the goal is within
    // OPEN_WORLD_DIRECT_STEP. Every goal the open world can hand out has to be
    // reachable that way without cutting a street or a block, or the step is
    // not a shortcut but a rule break.
    const goals: Array<{ x: number; z: number }> = [
      world.transit.stopPoint,
      { x: world.transit.stopPoint.x + 0.9, z: world.transit.stopPoint.z + 0.5 },
      { x: world.transit.stopPoint.x - 0.9, z: world.transit.stopPoint.z - 0.4 },
      standOnLane(world.transit.taxiLane, 0.18),
      standOnLane(world.transit.taxiLane, 0.5),
      standOnLane(world.transit.taxiLane, 0.82),
    ];
    for (const g of goals) {
      expect(insideParcel(world, g.x, g.z), `goal ${g.x},${g.z} stands in a block`).toBeNull();
      for (const n of world.network.nodes) {
        if (Math.hypot(n.x - g.x, n.z - g.z) > OPEN_WORLD_DIRECT_STEP) continue;
        const bad = crossesStreetOffCrosswalk(rules, n.x, n.z, g.x, g.z);
        expect(bad, `hop from ${n.x.toFixed(1)},${n.z.toFixed(1)} to ${g.x},${g.z}`).toBeNull();
      }
    }
    // and the budget really is smaller than a street: that is *why* the shortcut
    // cannot reach across the carriageway
    expect(OPEN_WORLD_DIRECT_STEP).toBeLessThan(2 * CURB_OFFSET);
  });
});

describe("the transit points of the open world", () => {
  it("stands the bus stop on a kerb, not in a block and not on the asphalt", () => {
    const stop = world.transit.stopPoint;
    expect(insideParcel(world, stop.x, stop.z)).toBeNull();
    expect(distanceToSidewalk({ streets: world.streets }, stop.x, stop.z)).toBeLessThan(0.2);
  });

  it("works taxi stands along one lane, each on the same kerb", () => {
    const lane = world.transit.taxiLane;
    for (const t of [0.18, 0.5, 0.82]) {
      const p = standOnLane(lane, t);
      expect(insideParcel(world, p.x, p.z)).toBeNull();
      expect(distanceToSidewalk({ streets: world.streets }, p.x, p.z)).toBeLessThan(0.6);
      // the derived curb is the middle stand, so both worlds agree on it
      if (t === 0.5) expect(p).toEqual(world.transit.taxiCurb);
    }
  });

  it("sends the bus along the street its own stop is on", () => {
    const lane = world.transit.busLane;
    const d = distanceToSegment(world.transit.stopPoint.x, world.transit.stopPoint.z, lane);
    expect(d).toBeLessThan(3);
  });
});

describe("the street plates and the traffic they carry", () => {
  it("paints the street network with the environment palette, not with alarm", () => {
    const colors = new Set(world.plates.map((p) => p.color));
    for (const c of colors) {
      expect(Object.values(ENV), `plate colour ${c} is not an ENV tone`).toContain(c);
    }
    for (const sev of Object.values(SEVERITY_COLOR)) {
      expect(colors.has(sev), `street paint in the alarm colour ${sev}`).toBe(false);
    }
    // nothing in the street paint stands up off the ground: it is all paint
    for (const p of world.plates) {
      expect(p.y).toBeLessThan(0.1);
      expect(p.h).toBeLessThan(0.1);
    }
  });

  it("draws traffic outside the alarm red, in its own livery", () => {
    for (const part of [...VEHICLE_BOXES, ...VEHICLE_WHEELS, STOP_BOARD]) {
      for (const sev of Object.values(SEVERITY_COLOR)) {
        expect(part.color, `traffic part in alarm colour ${sev}`).not.toBe(sev);
      }
      expect(part.color).not.toBe(ENV.windowAlarm);
      // The stronger rule — no alarm-band colour at ANY distance, and no
      // collision with the selection colour — is the ΔE guard in
      // trafficLivery.test.ts.
      expect(part.color, "traffic back in the brand red").not.toBe(ENV.selection);
    }
    expect(STOP_POST.color).toBe("#8f8b82");
  });

  it("keeps the whole street network and both vehicles inside two meshes", () => {
    // one scaled unit box for everything flat, one unit cylinder for the rest
    const boxParts = VEHICLE_BOXES.length + 1; // + the sign board
    const cylParts = VEHICLE_WHEELS.length + 1; // + the sign post
    expect(boxParts).toBeLessThanOrEqual(6);
    // Four wheels per vehicle: the pair on the near side used to be missing, so
    // a cab seen from the kerb drove on two discs. The ceiling grew by exactly
    // those four wheels; anything beyond ten round parts is a new draw surface.
    expect(cylParts).toBeLessThanOrEqual(10);
    expect(world.plates.length).toBeGreaterThan(150);
    // This ceiling bounds the two instance buffers, not the draw calls: closing
    // the grid with a beltway grew the painted network and the browser still
    // measures the same 27 draws per frame with these two meshes inside it.
    // What may not happen is a third mesh for street paint.
    expect(world.plates.length + boxParts).toBeLessThanOrEqual(400);
  });

  it("gives each vehicle four wheels, one on every corner", () => {
    for (const vehicle of ["taxi", "bus"] as const) {
      const wheels = VEHICLE_WHEELS.filter((w) => w.vehicle === vehicle);
      expect(wheels, `${vehicle} wheel count`).toHaveLength(4);
      expect(wheels.filter((w) => w.x > 0)).toHaveLength(2);
      expect(wheels.filter((w) => w.x < 0)).toHaveLength(2);
      expect(new Set(wheels.map((w) => w.z)).size).toBe(2);
      for (const w of wheels) {
        // wheels sit below the body and under its edge, not on the centreline
        expect(w.y).toBeGreaterThan(0);
        expect(Math.abs(w.x)).toBeGreaterThan(0.3);
      }
    }
  });

  it("has block interiors that are actually enclosed by kerbs", () => {
    expect(world.parcels.length).toBe(4);
    for (const p of world.parcels) {
      expect(p.x2 - p.x1).toBeGreaterThan(4);
      expect(p.z2 - p.z1).toBeGreaterThan(4);
      expect(insideParcel(world, (p.x1 + p.x2) / 2, (p.z1 + p.z2) / 2)).toEqual(p);
      // every block gets one pale pad drawn on it, and the pad covers exactly
      // the ground a walker may not enter — the paint and the rule agree
      const pads = world.plates.filter(
        (s) =>
          s.color === ENV.plot &&
          Math.abs((p.x1 + p.x2) / 2 - s.x) < 0.01 &&
          Math.abs((p.z1 + p.z2) / 2 - s.z) < 0.01,
      );
      expect(pads).toHaveLength(1);
      expect(pads[0]!.w).toBeCloseTo(p.x2 - p.x1, 5);
      expect(pads[0]!.d).toBeCloseTo(p.z2 - p.z1, 5);
    }
  });
});

/**
 * Source guards, in the style of the other component guards in this suite: the
 * empty world has to be wired to the network, and the cheap drawing must stay
 * cheap.
 */
const scene = readFileSync(
  path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
  "utf-8",
);
const crowd = readFileSync(
  path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
  "utf-8",
);

describe("the empty world is wired to its streets", () => {
  it("hands the crowd streets, a graph and the street paint", () => {
    expect(scene).not.toContain("streets={null}");
    expect(scene).toMatch(/<Pedestrians[\s\S]*streets=\{openWorld\.streets\}/);
    expect(scene).toMatch(/network=\{openWorld\.network\}/);
    expect(scene).toMatch(/streetPlates=\{openWorld\.plates\}/);
    // and the built city still comes from the scan, not from this grid
    expect(scene).toMatch("!cityData &&");
  });

  it("derives transit from the street list alone, not from having homes", () => {
    expect(crowd).toMatch(/const transitReady = onGraph && hasStreets/);
    expect(crowd).toMatch(/stopPoint[\s\S]{0,900}waitBus/);
    for (const m of crowd.matchAll(/if \((\w+) && vehiclesActive && st[?]/g)) {
      expect(m[1], `transit block still gated on ${m[1]}`).toBe("transitReady");
    }
  });

  it("keeps going in and out of buildings a city-only affair", () => {
    expect(crowd).toMatch(/const cityLife = homes\.length > 0 && onGraph/);
    expect(crowd).toMatch(/if \(cityLife && homes\.length > 0\)/);
  });

  it("draws the street and the traffic instanced, with no mesh of its own", () => {
    // not one plain <mesh> left in the crowd component: every part of the street
    // and both vehicles live in the two instanced meshes. The single exception
    // is §07.06's route stripe — one mesh for a whole walk, and only while an
    // errand is open. That is the same rule this guard defends (one draw for the
    // city, never one mesh per figure or per stripe), not an exemption from it.
    expect(crowd.match(/<mesh[\s/>]/g) ?? []).toHaveLength(1);
    expect(crowd).toMatch(/<mesh\s+ref=\{routeMeshRef\}/);
    expect(crowd).not.toContain("taxiRef");
    expect(crowd).not.toContain("busRef");
    expect(crowd).not.toContain("stopRef");
    // 9 before the figures got a contact patch; the tenth is that disc, and the
    // eleventh is the single selection ring. All three are instanced for the
    // same reason: one draw for the whole city, never one mesh per figure.
    expect((crowd.match(/<instancedMesh/g) ?? []).length).toBe(11);
  });

  it("honours reduced motion for the traffic too", () => {
    expect(crowd).toContain("reducedSettle(trafficSettledRef, settleTraffic)");
    expect(crowd).toContain("const dt = prefersReducedMotion() ? 0");
  });

  it("gives a stroll an actual plan instead of a target", () => {
    // the bug this guard keeps out: `graphWander` used to set only tx/tz, so
    // planStep reported the plan exhausted on the next frame and the whole
    // population stood on the kerb without moving
    const wander = crowd.slice(
      crowd.indexOf("const graphWander"),
      crowd.indexOf("// Route a walker"),
    );
    expect(wander).toContain("e.path = [next]");
  });

  it("needs no new label in either language", () => {
    const i18n = readFileSync(path.resolve(import.meta.dirname, "../src/i18n.ts"), "utf-8");
    expect(i18n).not.toMatch(/bus stop|Haltestelle/);
  });
});

/** The city's own streets must satisfy the same transit contract the open world
 *  does, because both now run through one derivation. */
describe("deriveTransit on a built city's street list", () => {
  const cityStreets: StreetLine[] = [
    { x1: -40, z1: -40, x2: 40, z2: -40 },
    { x1: 40, z1: -40, x2: 40, z2: 40 },
    { x1: 40, z1: 40, x2: -40, z2: 40 },
    { x1: -40, z1: 40, x2: -40, z2: -40 },
    { x1: -20, z1: -20, x2: 20, z2: -20 },
  ];

  it("picks the central segment for the stop and a different one for the cab", () => {
    const t = deriveTransit(cityStreets);
    expect(t).not.toBeNull();
    // the segment whose midpoint is nearest the centre is the inner street
    expect(t!.busLane).toBe(cityStreets[4]!);
    expect(t!.stopPoint).toEqual({ x: 0, z: -17.9 });
    expect(t!.stopSegment).toEqual({ x1: 0, z1: -17.9, x2: 20, z2: -20 });
    // the cab works a different street than the bus
    expect(t!.taxiLane).not.toBe(t!.busLane);
    expect(t!.taxiCurb).toEqual({ x: 38.3, z: 0 });
  });

  it("hands back nothing when there is no street to put it on", () => {
    expect(deriveTransit([])).toBeNull();
  });
});

/** The build sites the city hands the crowd stay off-limits for the open world. */
describe("the open world is not a fake city", () => {
  it("has no homes, no build sites and no plots to read data from", () => {
    expect(world.parcels.every((p) => typeof p.x1 === "number")).toBe(true);
    const sites: Array<BuildSite & { at: number }> = [];
    expect(sites).toHaveLength(0);
    expect(crowd).toMatch("if (hasSites)");
  });
});
