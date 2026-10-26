import { describe, it, expect } from "vitest";
import { planBlastRadius, blastVisibility } from "../src/city/blastRadius";
import type { BlastEdge, BlastNode } from "../src/city/blastRadius";

/**
 * 005 Teil A — the direction rule, measured on a hand-built graph.
 *
 * A blast radius that reads the arrow the wrong way is not a weaker tool, it is
 * a wrong one: it would tell a developer that the files a module reads are the
 * files its change endangers. So the whole set below is built from one small
 * chain and each case asks the same question from the other end.
 *
 *   src/login.ts   →  src/auth.ts        (login imports auth)
 *   src/session.ts →  src/auth.ts
 *   src/auth.ts    →  src/util.ts        (auth imports util)
 */

const FILES: Array<[string, string]> = [
  ["id-login", "src/login.ts"],
  ["id-session", "src/session.ts"],
  ["id-auth", "src/auth.ts"],
  ["id-util", "src/util.ts"],
];

const NODES = new Map<string, BlastNode>(
  FILES.map(([id, path]) => [id, { id, name: path.split("/").pop() ?? path, path }]),
);

const CHAIN: BlastEdge[] = [
  { from: "id-login", to: "id-auth", weight: 2 },
  { from: "id-session", to: "id-auth", weight: 1 },
  { from: "id-auth", to: "id-util", weight: 1 },
];

const ALL_DRAWN = new Set(NODES.keys());
const paths = (ids: { id: string }[]) => ids.map((f) => NODES.get(f.id)!.path);

describe("the arrow points away from the file that changes", () => {
  it("selecting an imported file names its importers", () => {
    const b = planBlastRadius(CHAIN, NODES, ALL_DRAWN, "id-auth");
    expect(paths(b.files)).toEqual(["src/login.ts", "src/session.ts"]);
  });

  it("selecting an importing file does NOT name what it imports", () => {
    // `auth.ts` reads `util.ts`; changing `auth.ts` does not make `util.ts`
    // need a re-read. This is the case a symmetric graph would get wrong.
    const b = planBlastRadius(CHAIN, NODES, ALL_DRAWN, "id-util");
    expect(paths(b.files)).toEqual(["src/auth.ts"]);
    const a = planBlastRadius(CHAIN, NODES, ALL_DRAWN, "id-auth");
    expect(a.files.map((f) => f.id)).not.toContain("id-util");
  });

  it("a file with nothing importing it has an empty answer, not a guessed one", () => {
    const b = planBlastRadius(CHAIN, NODES, ALL_DRAWN, "id-login");
    expect(b.files).toEqual([]);
    expect(blastVisibility(b)).toEqual({ total: 0, drawn: 0 });
  });
});

describe("the count says files", () => {
  it("two importers are two", () => {
    expect(planBlastRadius(CHAIN, NODES, ALL_DRAWN, "id-auth").files).toHaveLength(2);
  });

  it("one file importing twice is one file", () => {
    // The city already folds repeated imports of the same pair into one edge
    // with a weight; the panel must not turn that weight back into a count.
    const edges: BlastEdge[] = [
      { from: "id-login", to: "id-auth", weight: 3 },
      { from: "id-login", to: "id-auth", weight: 1 }, // a second edge for the same pair
    ];
    const b = planBlastRadius(edges, NODES, ALL_DRAWN, "id-auth");
    expect(b.files).toHaveLength(1);
    expect(b.files[0]!.weight).toBe(4); // the imports, kept apart from the files
  });

  it("an edge to a file the city does not know names nobody", () => {
    const edges: BlastEdge[] = [{ from: "id-ghost", to: "id-auth", weight: 1 }];
    expect(planBlastRadius(edges, NODES, ALL_DRAWN, "id-auth").files).toEqual([]);
  });
});

describe("the graph is walked without assumptions", () => {
  it("a cycle terminates and answers one level only", () => {
    const cyclic: BlastEdge[] = [
      { from: "id-login", to: "id-auth", weight: 1 },
      { from: "id-auth", to: "id-login", weight: 1 },
      { from: "id-auth", to: "id-auth", weight: 1 }, // self-import
    ];
    const b = planBlastRadius(cyclic, NODES, ALL_DRAWN, "id-auth");
    expect(paths(b.files)).toEqual(["src/login.ts"]);
  });

  it("no selection means no answer", () => {
    expect(planBlastRadius(CHAIN, NODES, ALL_DRAWN, null).files).toEqual([]);
  });

  it("the same city produces the same list twice", () => {
    const first = planBlastRadius(CHAIN, NODES, ALL_DRAWN, "id-auth");
    const shuffled = [...CHAIN].reverse();
    const second = planBlastRadius(shuffled, NODES, ALL_DRAWN, "id-auth");
    expect(paths(second.files)).toEqual(paths(first.files));
  });

  it("sorts by path, not by payload order or weight", () => {
    const edges: BlastEdge[] = [
      { from: "id-session", to: "id-auth", weight: 9 },
      { from: "id-login", to: "id-auth", weight: 1 },
    ];
    expect(paths(planBlastRadius(edges, NODES, ALL_DRAWN, "id-auth").files)).toEqual([
      "src/login.ts",
      "src/session.ts",
    ]);
  });
});

describe("the draw limit is not a missing dependency", () => {
  it("keeps files the city does not draw in the list and counts them apart", () => {
    const drawn = new Set(["id-auth", "id-util", "id-session"]); // login is summarised
    const b = planBlastRadius(CHAIN, NODES, drawn, "id-auth");
    expect(b.files).toHaveLength(2);
    expect(b.summarised.map((f) => f.path)).toEqual(["src/login.ts"]);
    expect(b.drawn.map((f) => f.path)).toEqual(["src/session.ts"]);
    expect(blastVisibility(b)).toEqual({ total: 2, drawn: 1 });
  });

  it("names the district of a file it cannot show, from the path it holds", () => {
    const b = planBlastRadius(CHAIN, NODES, new Set(["id-auth"]), "id-auth");
    expect(b.summarised[0]!.path.startsWith("src/")).toBe(true);
    expect(b.summarised[0]!.name).toBe("login.ts");
  });
});
