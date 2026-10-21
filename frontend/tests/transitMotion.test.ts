// @vitest-environment node
/**
 * The two named vehicles, as a motion contract: the cab keeps to the right
 * kerb of its own direction and turns around on a half circle at the lane end;
 * the bus aligns, yields and turns on a curve. The source guards are here
 * because the renderer does not expose its simulation to a DOM test, and the
 * failures they catch are exact ones this pass repaired.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { standOnLane } from "../src/city/openWorldStreets";

const SRC = path.resolve(import.meta.dirname, "../src");
const pedestrians = readFileSync(path.join(SRC, "components/Pedestrians.tsx"), "utf-8");
const road = readFileSync(path.join(SRC, "components/RoadSystem.tsx"), "utf-8");

describe("the cab and the bus keep to the street", () => {
  it("puts a stand on the right-hand kerb of the direction it is driving", () => {
    const lane = { x1: 0, z1: 0, x2: 10, z2: 0 };
    // facing +x, right is -z; the positive normal is the left kerb
    expect(standOnLane(lane, 0.5, -1.7)).toEqual({ x: 5, z: -1.7 });
    expect(standOnLane(lane, 0.5, 1.7)).toEqual({ x: 5, z: 1.7 });
    // and the same in the opposite direction, once the sign follows dir
    expect(standOnLane(lane, 0.5, -1.7 * -1)).toEqual({ x: 5, z: 1.7 });
  });

  it("turns the cab around on a half circle instead of reversing in place", () => {
    expect(pedestrians).toContain("TAXI_STAND_OFFSET * taxi.dir");
    expect(pedestrians).toContain("TAXI_TURN_SPEED");
    expect(pedestrians).toContain("taxi.turn");
    // the old code walked the stand list modulo 3 and let the cab swap ends
    expect(pedestrians).not.toContain("taxi.stand + 1) % TAXI_STANDS.length");
    // wheels spin forward in the vehicle's own frame, not by world direction
    expect(pedestrians).toContain("wheelRoll(odometer, 1, wheel.r)");
    expect(pedestrians).not.toContain('wheel.vehicle === "taxi" ? 1 : S.bus.dir');
  });

  it("brakes the bus for the stop and for anyone on the asphalt", () => {
    expect(pedestrians).toContain("STOP_ALIGN");
    expect(pedestrians).toContain("pedestrianOnRoadAhead");
    expect(pedestrians).toContain("bus.turn");
    // a stop is projected onto the lane, never guessed as a t value
    expect(pedestrians).toContain("stopT");
  });

  it("keeps background cars off the two transit streets", () => {
    // derive from the UNSORTED list: `find` inside deriveTransit is order-bound
    expect(road).toContain("deriveTransit(layout.streets)");
    expect(road).not.toContain("deriveTransit(lanes)");
    expect(road).toContain("withoutTransit");
  });
});
