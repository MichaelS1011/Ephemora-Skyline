import { describe, expect, it } from "vitest";
import { approachNode, nearestNode, type SidewalkNetwork } from "../src/city/sidewalks";

/**
 * One street running east–west along z = 5. A door sits just north of it, at
 * z = 5.6 — and the kerb node closest to that door in a straight line is the one
 * on the SOUTH side, 0.7 away, while the kerb the door actually opens onto is
 * 30 further along the block. Routing the last step from the near node is the
 * diagonal across the carriageway a reader instantly calls senseless.
 */
const net = {
  nodes: [
    { x: 0, z: 4.9, adj: [1] }, // south kerb, straight-line nearest to the door
    { x: 30, z: 6, adj: [0] }, // north kerb, the side the door is on
  ],
  crosswalks: [],
  kerbs: [],
} as unknown as SidewalkNetwork;

const street = { x1: -100, z1: 5, x2: 100, z2: 5 };

describe("a route finishes on the kerb on the goal's own side", () => {
  it("refuses the last step that crosses the carriageway", () => {
    expect(nearestNode(net, 0.2, 5.6)).toBe(0); // the defect: the far kerb is nearer
    expect(approachNode(net, [street], 0.2, 5.6)).toBe(1); // the kerb the door opens on
  });

  it("keeps the near kerb when the goal is on that same side", () => {
    expect(approachNode(net, [street], 0.2, 4)).toBe(0);
  });

  it("walks the crossing when no kerb is left on this side", () => {
    // Both nodes south, door north: standing on the kerb forever is the worse
    // failure, so the plain nearest node answers.
    const southOnly = {
      nodes: [
        { x: 0, z: 0, adj: [1] },
        { x: 10, z: 0, adj: [0] },
      ],
      crosswalks: [],
      kerbs: [],
    } as unknown as SidewalkNetwork;
    expect(approachNode(southOnly, [street], 0, 9)).toBe(nearestNode(southOnly, 0, 9));
  });

  it("is the plain nearest node where no streets are drawn", () => {
    expect(approachNode(net, [], 28, 6.2)).toBe(nearestNode(net, 28, 6.2));
  });
});
