import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  explorerIndex,
  frontageTowards,
  FRONTAGE_GAP,
  guideClaimFor,
  maintenanceClaimFor,
  onDuty,
  pickCallable,
  maintenanceIndex,
  ROLE_GLYPH,
  securityClaimFor,
  securityIndex,
  securityBearerFromWork,
  roleBearers,
} from "../src/city/epheRoles";
import { COMPLEXITY_WEIGHTS, NORM_REFERENCE } from "../src/city/mapping";
import { file } from "./helpers/cityFixture";

/**
 * 005-B — the two decisions a guide is allowed to make on its own.
 *
 * Which resident is the Explorer, and what it may say about two files. Both are
 * pure: the walk belongs to the renderer, the claim belongs to the data, and a
 * sentence the payload does not support is the failure this file guards against.
 */

const PATHS = new Map<string, string>([
  ["a", "src/auth.ts"],
  ["b", "src/login.ts"],
  ["c", "src/util.ts"],
]);

const EDGES = [
  { from: "b", to: "a", weight: 2 }, // login imports auth
  { from: "a", to: "c", weight: 1 }, // auth imports util
];

describe("one resident carries the role", () => {
  it("is the same resident for the same crowd", () => {
    expect(explorerIndex(72)).toBe(explorerIndex(72));
    expect(explorerIndex(7)).toBe(explorerIndex(7));
  });

  it("never picks the first figure, and always a real one", () => {
    for (const count of [3, 4, 7, 24, 72, 200]) {
      const i = explorerIndex(count)!;
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(count);
    }
  });

  it("refuses a crowd too small to spare one", () => {
    expect(explorerIndex(2)).toBeNull();
    expect(explorerIndex(0)).toBeNull();
  });

  it("gives every role a different shape, not just a colour", () => {
    const glyphs = Object.values(ROLE_GLYPH);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe("the claim comes from the edge", () => {
  it("names who imports whom when the imported file is selected", () => {
    const claim = guideClaimFor(EDGES, PATHS, "a", "b");
    expect(claim).toEqual({ importerPath: "src/login.ts", importedPath: "src/auth.ts", weight: 2 });
  });

  it("says the same thing when the importer is the selection", () => {
    // The sentence is about the relation, not about who was clicked: asking
    // from `login.ts` must not flip it into "auth imports login".
    const claim = guideClaimFor(EDGES, PATHS, "b", "a");
    expect(claim).toEqual({ importerPath: "src/login.ts", importedPath: "src/auth.ts", weight: 2 });
  });

  it("returns nothing when the two files are not joined", () => {
    expect(guideClaimFor(EDGES, PATHS, "b", "c")).toBeNull();
  });

  it("returns nothing for a file asked about itself", () => {
    expect(guideClaimFor(EDGES, PATHS, "a", "a")).toBeNull();
  });

  it("returns nothing when an endpoint is a file the city does not name", () => {
    const edges = [...EDGES, { from: "ghost", to: "a", weight: 1 }];
    expect(guideClaimFor(edges, PATHS, "a", "ghost")).toBeNull();
  });

  it("keeps the weight the payload states, without rounding it into files", () => {
    expect(guideClaimFor(EDGES, PATHS, "a", "b")!.weight).toBe(2);
  });
});

describe("the second role is a second resident", () => {
  it("never puts two jobs on one figure", () => {
    for (const count of [6, 7, 24, 72, 200]) {
      expect(securityIndex(count)).not.toBe(explorerIndex(count));
      expect(securityIndex(count)!).toBeGreaterThanOrEqual(0);
      expect(securityIndex(count)!).toBeLessThan(count);
    }
  });

  it("is stable for a crowd and refuses a too-small one", () => {
    expect(securityIndex(72)).toBe(securityIndex(72));
    expect(securityIndex(5)).toBeNull();
  });
});

describe("the security claim counts what the payload carries", () => {
  const findings = [
    { severity: "P2" as const, ruleId: "regex:CONSOLE_USAGE", line: 8, provenance: "regex" },
    { severity: "P0" as const, ruleId: "regex:SQL_INJECTION", line: 21, provenance: "semgrep" },
  ];

  it("names the worst finding, its rule, its line and who reported it", () => {
    expect(securityClaimFor({ path: "src/db.ts", name: "db.ts", findings })).toEqual({
      path: "src/db.ts",
      name: "db.ts",
      count: 2,
      worst: "P0",
      ruleId: "regex:SQL_INJECTION",
      line: 21,
      provenance: "semgrep",
    });
  });

  it("says nothing when the file carries nothing", () => {
    expect(securityClaimFor({ path: "src/ok.ts", name: "ok.ts", findings: [] })).toBeNull();
  });

  it("does not invent a scanner for a finding that names none", () => {
    const claim = securityClaimFor({
      path: "src/a.ts",
      name: "a.ts",
      findings: [{ severity: "P1", line: 3 }],
    })!;
    expect(claim.provenance).toBe("built-in");
    expect(claim.ruleId).toBe("P1");
  });
});

describe("who answers the call", () => {
  it("takes the claimed resident before the nearer stranger", () => {
    // The rule the reload measurement forced: `C` picks the closest visible
    // body, and that choice is fixed for a camera pose — without the
    // preference, a named resident can never be reached again.
    expect(
      pickCallable([
        { at: 1, score: 0.02, claimed: false },
        { at: 7, score: 0.9, claimed: true },
      ]),
    ).toBe(7);
  });

  it("falls back to the best-looking candidate when nobody is claimed", () => {
    expect(
      pickCallable([
        { at: 1, score: 0.4, claimed: false },
        { at: 2, score: 0.05, claimed: false },
        { at: 3, score: 0.9, claimed: false },
      ]),
    ).toBe(2);
  });

  it("prefers the better-placed of several claimed residents, and says null for none", () => {
    expect(
      pickCallable([
        { at: 4, score: 0.7, claimed: true },
        { at: 5, score: 0.3, claimed: true },
      ]),
    ).toBe(5);
    expect(pickCallable([])).toBeNull();
  });

  it("is stable for equal scores, so the same pose keeps calling the same figure", () => {
    expect(
      pickCallable([
        { at: 8, score: 0.5, claimed: true },
        { at: 9, score: 0.5, claimed: true },
      ]),
    ).toBe(8);
  });
});

describe("who is spoken for", () => {
  const free = { isExplorer: false, isSecurity: false, isMaintenance: false };
  const explorer = { isExplorer: true, isSecurity: false, isMaintenance: false };

  it("takes a figure out of the city's job picks once it carries a role", () => {
    expect(onDuty(free, false)).toBe(false);
    for (const role of ["isExplorer", "isSecurity", "isMaintenance"] as const) {
      expect(onDuty({ ...free, [role]: true }, false), role).toBe(true);
    }
  });

  it("and once the reader has given it a name", () => {
    // The named resident has to stay findable: it answered `C` before the
    // reload and must answer it after, which means it cannot be allowed to
    // disappear into a doorway, a taxi, a bus or a build site in between.
    expect(onDuty(explorer, true)).toBe(true);
    expect(onDuty(free, true)).toBe(true);
  });
});

describe("B12 — the third role is a third resident", () => {
  /** Every crowd the city can build, not a sample: three seats in a crowd of
   *  six have nowhere to hide. */
  it("sits three roles on three different figures", () => {
    for (let count = 6; count <= 200; count++) {
      const ex = explorerIndex(count);
      const sec = securityIndex(count);
      const maint = maintenanceIndex(count);
      expect(maint, `no maintenance seat at ${count}`).not.toBeNull();
      expect(new Set([ex, sec, maint]).size, `seats collided at ${count}`).toBe(3);
      expect(maint!).toBeGreaterThan(0);
      expect(maint!).toBeLessThan(count);
    }
  });

  it("is the same figure every time, and none below the crowd floor", () => {
    expect(maintenanceIndex(72)).toBe(maintenanceIndex(72));
    expect(maintenanceIndex(20)).toBe(maintenanceIndex(20));
    expect(maintenanceIndex(5)).toBeNull();
  });

  it("is pinned for the crowds the app actually builds", () => {
    // 6 = the floor `crowdFor` gives a small level, 72 = its default capacity.
    expect([explorerIndex(6), securityIndex(6), maintenanceIndex(6)]).toEqual([3, 5, 1]);
    expect([explorerIndex(72), securityIndex(72), maintenanceIndex(72)]).toEqual([25, 40, 42]);
  });
});

describe("B12 — the maintenance claim reads one metric and the mapping", () => {
  const tangled = file("src/db.ts", "TypeScript", [], undefined, { cyclomaticComplexity: 22 });

  it("states the metric, the decision count and the share the mapping gives it", () => {
    expect(maintenanceClaimFor(tangled)).toEqual({
      path: "src/db.ts",
      name: "db.ts",
      cyclomatic: 22,
      decisions: 21,
      // 0.45 × (22 / 40) — the weight table times the renderer's own factor.
      heightSharePercent: 25,
      saturatesAt: 40,
      saturated: false,
    });
  });

  it("takes the two numbers from the mapping, never from a copy of them", () => {
    const claim = maintenanceClaimFor(tangled)!;
    expect(claim.saturatesAt).toBe(NORM_REFERENCE.cyclomatic);
    expect(claim.heightSharePercent).toBe(
      Math.round(100 * COMPLEXITY_WEIGHTS.cyclomatic * (22 / NORM_REFERENCE.cyclomatic)),
    );
  });

  it("caps the share where the metric caps, and says it is reached", () => {
    const over = file("src/big.ts", "TypeScript", [], undefined, { cyclomaticComplexity: 400 });
    const claim = maintenanceClaimFor(over)!;
    expect(claim.saturated).toBe(true);
    // Past the reference the factor is 1, so the share cannot read bigger than
    // the weight table allows — a metric cannot buy more than its own weight.
    expect(claim.heightSharePercent).toBe(Math.round(100 * COMPLEXITY_WEIGHTS.cyclomatic));
    expect(claim.decisions).toBe(399);
  });

  it("says nothing about a file the metric was never measured on", () => {
    // Data files carry cx 1 by construction; the analyzer gives a lockfile no
    // behaviour, so a sentence about its "decision points" would describe a
    // constant. A high cx on a data file is the same trap in the other
    // direction, so role wins over number here.
    const data = file("package-lock.json", "JSON", [], undefined, {
      role: "data",
      cyclomaticComplexity: 30,
    });
    expect(maintenanceClaimFor(data)).toBeNull();
  });

  it("says nothing when the number is a branch-free one", () => {
    expect(maintenanceClaimFor(file("src/plain.ts", "TypeScript"))).toBeNull();
    const oneBranch = file("src/if.ts", "TypeScript", [], undefined, { cyclomaticComplexity: 2 });
    expect(maintenanceClaimFor(oneBranch)!.decisions).toBe(1);
  });

  it("carries no verdict the payload did not state", () => {
    // The claim's shape IS the limit: no field for "too complex", no field for
    // "refactor this", no second metric to blend in.
    expect(Object.keys(maintenanceClaimFor(tangled)!).sort()).toEqual([
      "cyclomatic",
      "decisions",
      "heightSharePercent",
      "name",
      "path",
      "saturated",
      "saturatesAt",
    ]);
  });
});

/**
 * MASTER-2027 §07.11 — the frontage a guide is sent to is the one the reader
 * can see. Found by measurement, not by reading: with the fixed +z side the
 * arriving explorer sat behind its own tower (canvas (319, 401) on the target's
 * facade, 0 changed pixels in the 34 × 42 window around it over 8 s, while the
 * rest of the picture moved by 2 900 … 4 300 — `umsehen-messung.json`).
 */
describe("frontageTowards — the side turned at the camera", () => {
  const plot = { x: 10, z: -4, w: 6, d: 8 };
  const dot = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - plot.x) * (b.x - plot.x) + (a.z - plot.z) * (b.z - plot.z);

  it("sends the guide past the façade on the camera's side, one gap out", () => {
    // Achse für Achse verglichen: die Klammerung von `z + (d/2 + gap)` ist
    // nicht dieselbe wie die von `z + d/2 + gap`, und das darf ein Test nicht
    // als Unterschied melden.
    const seit = (cam: readonly [number, number]): [number, number] => {
      const a = frontageTowards(plot, cam[0], cam[1]);
      return [a.x, a.z];
    };
    for (const [cam, want] of [
      [
        [10, 40],
        [10, 0.8],
      ],
      [
        [10, -60],
        [10, -8.8],
      ],
      [
        [60, -4],
        [13.8, -4],
      ],
      [
        [-60, -4],
        [6.2, -4],
      ],
    ] as const) {
      const [x, z] = seit(cam);
      expect(x, `x von ${cam}`).toBeCloseTo(want[0], 9);
      expect(z, `z von ${cam}`).toBeCloseTo(want[1], 9);
    }
  });

  it("follows the dominant axis, because that is the side actually seen", () => {
    // Camera far to the right and slightly north: the east face is the visible
    // one, and a point on the north face would stand beside the tower.
    const aim = frontageTowards(plot, 40, 1);
    expect(aim.x).toBeGreaterThan(plot.x);
    expect(aim.z).toBe(plot.z);
  });

  it("never puts the guide inside the footprint, and always facing the camera", () => {
    for (const cam of [
      { x: 0, z: 0 },
      { x: 120, z: 90 },
      { x: -80, z: 12 },
      { x: 7, z: -90 },
      { x: 10, z: -4 },
    ]) {
      const aim = frontageTowards(plot, cam.x, cam.z);
      const drin = Math.abs(aim.x - plot.x) <= plot.w / 2 && Math.abs(aim.z - plot.z) <= plot.d / 2;
      expect(drin, `aim ${JSON.stringify(aim)} from ${JSON.stringify(cam)}`).toBe(false);
      if (cam.x !== plot.x || cam.z !== plot.z)
        expect(dot(aim, cam), `facing the camera from ${JSON.stringify(cam)}`).toBeGreaterThan(0);
    }
  });

  it("keeps the historical +z frontage on a head-on tie", () => {
    // Camera exactly at the corner where two faces are equally faced: the
    // ranking is decided by order, not by floating-point noise, and the order
    // is the one the old fixed side used.
    const tie = frontageTowards(plot, plot.x + plot.w / 2, plot.z + plot.d / 2);
    expect(tie.x).toBe(plot.x);
    expect(tie.z).toBeCloseTo(plot.z + plot.d / 2 + FRONTAGE_GAP, 9);
  });

  it("takes the gap as a parameter, because the kerb is the sidewalk's number", () => {
    expect(frontageTowards(plot, 10, 99, 2.18).z).toBeCloseTo(-4 + 4 + 2.18, 6);
  });
});

describe("the guide panel asks the camera, not the calendar", () => {
  const quelle = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/GuideAction.tsx"),
    "utf-8",
  );

  it("aims through frontageTowards and reads the live camera", () => {
    expect(quelle).toContain("frontageTowards(placement, kamera.x, kamera.z)");
    expect(quelle).toContain("useStore.getState().cameraInfo");
  });

  it("has no fixed frontage side left", () => {
    expect(quelle).not.toContain("placement.z + placement.d / 2 + 0.8");
  });
});

/**
 * EPHE task #4 — the village rule: a role is worn where the work is.
 *
 * These cases are the difference between a costume and a statement. The badge
 * says "this one carries the open findings"; it may only say that while the
 * resident is actually seated where the open findings are, and it must say
 * nothing at all when the queue has no open work left.
 */
describe("a role is worn where the work is", () => {
  it("puts the security figure on the heaviest open plot", () => {
    const seats = [3, 0, 4, 1];
    const plots = [{ open: 1 }, { open: 0 }, { open: 0 }, { open: 6 }, { open: 2 }];
    expect(
      securityBearerFromWork(seats, plots),
      "p3 traegt sechs offene — Figur 0 sitzt dort",
    ).toBe(0);
  });

  it("takes the heaviest load first, and the lowest figure above the greeter", () => {
    const seats = [2, 2, 5, 5];
    const plots = [{ open: 0 }, { open: 0 }, { open: 3 }, { open: 0 }, { open: 0 }, { open: 3 }];
    expect(
      securityBearerFromWork(seats, plots),
      "p2 und p5 tragen je drei offen — die erste Figur nach der gruessenden nimmt",
    ).toBe(1);
  });

  it("wears nothing when every finding has a verdict", () => {
    const seats = [0, 1, 2];
    const plots = [
      { open: 0, total: 4 },
      { open: 0, total: 1 },
      { open: 0, total: 9 },
    ];
    expect(securityBearerFromWork(seats, plots), "nichts zu sichern, kein Abzeichen").toBeNull();
    expect(securityBearerFromWork([], plots)).toBeNull();
  });

  it("keeps the three jobs on three different bodies, at every crowd it can build", () => {
    const plots = [{ open: 9 }, { open: 0 }, { open: 4 }, { open: 0 }];
    for (let count = 3; count <= 72; count++) {
      const seats = Array.from({ length: count }, (_, i) => i % plots.length);
      const r = roleBearers(seats, plots, count);
      const getragen = [r.explorer, r.security, r.maintenance].filter(
        (i) => i !== null,
      ) as number[];
      expect(new Set(getragen).size, `crowd ${count}: keine Doppelbelastung`).toBe(getragen.length);
      for (const i of getragen) {
        expect(i, `crowd ${count}: Figur ${i} ist ein Koerper der Crowd`).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(count);
      }
    }
  });

  it("gives the everyday jobs way to the work seat, and keeps its own when the work is real", () => {
    const plots = [{ open: 7 }, { open: 0 }];
    const r = roleBearers([0, 1, 2, 3, 4, 5], plots, 6);
    expect(r.security, "Figur 0 steht auf der einzigen offenen Parzelle").toBe(0);
    const getragen = [r.explorer, r.maintenance].filter((i) => i !== null);
    expect(getragen, "die anderen beiden Jobs sitzen nicht auf Figur 0").not.toContain(0);
  });

  it("is a function of the data, not of the moment", () => {
    const seats = [1, 3, 0, 2];
    const plots = [{ open: 2 }, { open: 5 }, { open: 0 }, { open: 1 }];
    expect(roleBearers(seats, plots, 8)).toEqual(
      roleBearers(
        seats,
        plots.map((p) => ({ ...p })),
        8,
      ),
    );
  });

  /**
   * Der Band between the rule and the crowd: the renderer must actually wear
   * the bearers it is handed. A unit rule nobody reads is a second arithmetic
   * living beside the first, and the badge would still be a costume.
   */
  it("is worn by the renderer, not only computed", () => {
    const crowd = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
      "utf-8",
    );
    expect(crowd, "die Flags kommen aus den Traegern").toContain("i === bearers.security");
    expect(crowd).toContain("i === bearers.explorer");
    expect(crowd).toContain("i === bearers.maintenance");
    expect(crowd, "die alte Index-Setzung darf nicht als zweite Wahrheit weiterleben").not.toMatch(
      /i === (explorerIndex|securityIndex|maintenanceIndex)\(/,
    );
    expect(crowd, "die Traeger werden aus den Sitzen und der Arbeit gerechnet").toContain(
      "roleBearers(seats, plots, crowd)",
    );
  });
});
