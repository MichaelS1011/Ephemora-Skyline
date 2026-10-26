// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideAction } from "../src/components/GuideAction";
import { MaintenanceAction } from "../src/components/MaintenanceAction";
import { refreshReducedMotion } from "../src/city/motion";
import { useStore } from "../src/stores/useStore";
import { city, dir, file, finding } from "./helpers/cityFixture";
import type { CityData, CityFile } from "../src/city/types";

/**
 * 005-B — the errand as a reader meets it: a button that appears only where a
 * real edge exists, a guide state the panel can report, and three ways for it
 * to end (second click, new selection, Escape).
 *
 * The walk itself runs on the sidewalk graph and cannot be judged in jsdom; it
 * is verified in the running app, and `ephe-roles.test.ts` holds the two rules
 * the renderer is not allowed to break on its own.
 */

const plaza = (path: string, id: string): CityFile =>
  file(path, "TypeScript", [], undefined, { id, linesOfCode: 40 });

const AUTH = plaza("auth.ts", "auth");
const LOGIN = plaza("login.ts", "login");
const SESSION = plaza("session.ts", "session");
const UTIL = plaza("util.ts", "util");
/** Joined to auth by a real edge, but standing in another district. */
const DEEP = plaza("deep/other.ts", "other");
/** No edge at all — the case where the panel has nothing to offer. */
const ISOLATED = plaza("isolated.ts", "iso");

function probeCity(): CityData {
  return city({
    repo: { owner: "local", name: "guide", branch: "main" },
    files: [AUTH, LOGIN, SESSION, UTIL, ISOLATED],
    tree: dir({
      path: "",
      detailFiles: [AUTH, LOGIN, SESSION, UTIL, ISOLATED],
      children: [dir({ path: "deep", name: "deep", detailFiles: [DEEP], districtFiles: [DEEP] })],
    }),
    fileConnections: [
      { from: "login", to: "auth", weight: 2 },
      { from: "session", to: "auth", weight: 1 },
      { from: "auth", to: "util", weight: 1 },
      { from: "other", to: "auth", weight: 1 },
    ],
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: probeCity(),
      focusPath: [],
      selectedUnit: { kind: "file", id: "auth" },
      buildPhase: "built",
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

async function show(element: ReactElement) {
  await act(async () => root.render(element));
}

const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];

async function press(part: string) {
  const b = buttons().find((x) => (x.textContent || "").includes(part));
  expect(b, `no button reading "${part}"`).toBeTruthy();
  await act(async () => b!.click());
}

const text = () => (host.textContent || "").replace(/\s+/g, " ").trim();
const guide = () => useStore.getState().guide;

describe("the ask appears only on real ground", () => {
  it("offers the files the selection is joined to", async () => {
    await show(<GuideAction />);
    expect(text()).toContain("Ask the Explorer to walk you to a connected file.");
    const asks = buttons().filter((b) => (b.textContent || "").includes("Ask Ephe to guide me"));
    // Three, not four: `deep/other.ts` is a real neighbour but no building on
    // this level, so it is named below instead of offered as a walk.
    expect(asks.map((b) => b.textContent)).toEqual([
      "Ask Ephe to guide me login.ts",
      "Ask Ephe to guide me session.ts",
      "Ask Ephe to guide me util.ts",
    ]);
  });

  it("says nothing at all when no edge touches the file", async () => {
    await act(async () => useStore.setState({ selectedUnit: { kind: "file", id: "iso" } }, false));
    await show(<GuideAction />);
    expect(host.querySelector(".cf-guide")).toBeNull();
  });

  it("keeps a real neighbour it cannot draw in view, and offers no walk to it", async () => {
    const onlyDeep = city({
      files: [AUTH],
      tree: dir({
        path: "",
        fileCount: 2,
        detailFiles: [AUTH],
        children: [dir({ path: "deep", name: "deep", detailFiles: [DEEP], districtFiles: [DEEP] })],
      }),
      fileConnections: [{ from: "other", to: "auth", weight: 1 }],
    });
    await act(async () =>
      useStore.setState({ cityData: onlyDeep, selectedUnit: { kind: "file", id: "auth" } }, false),
    );
    await show(<GuideAction />);
    expect(buttons().filter((b) => (b.textContent || "").includes("Ask Ephe"))).toHaveLength(0);
    expect(text()).toContain("this level does not draw them as buildings");
  });
});

describe("the errand", () => {
  it("starts with the edge's own claim and the target's plot point", async () => {
    await show(<GuideAction />);
    await press("Ask Ephe to guide me login.ts");
    const g = guide();
    expect(g).not.toBeNull();
    expect(g!.targetFileId).toBe("login");
    expect(g!.claim).toEqual({ importerPath: "login.ts", importedPath: "auth.ts", weight: 2 });
    expect(Number.isFinite(g!.x) && Number.isFinite(g!.z)).toBe(true);
    expect(useStore.getState().guidePhase).toBe("walking");
    expect(text()).toContain("The Explorer is walking to login.ts.");
  });

  it("speaks only once it has arrived, and then from the edge", async () => {
    await show(<GuideAction />);
    await press("Ask Ephe to guide me login.ts");
    expect(text()).not.toContain("may require reviewing");
    await act(async () => useStore.getState().setGuidePhase("arrived"));
    expect(text()).toContain(
      "login.ts imports auth.ts. A change to auth.ts may require reviewing login.ts.",
    );
  });

  it("ends on the second click", async () => {
    await show(<GuideAction />);
    await press("login.ts");
    expect(guide()).not.toBeNull();
    await press("Stop");
    expect(guide()).toBeNull();
    expect(useStore.getState().guidePhase).toBeNull();
  });

  it("ends when the reader selects another file", async () => {
    await show(<GuideAction />);
    await press("login.ts");
    await act(async () =>
      useStore.setState({ selectedUnit: { kind: "file", id: "session" } }, false),
    );
    expect(guide()).toBeNull();
  });

  it("ends on Escape", async () => {
    await show(<GuideAction />);
    await press("login.ts");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(guide()).toBeNull();
  });

  it("points at the list when the neighbours outgrow the panel", async () => {
    const many = probeCity();
    const extra: CityFile[] = [];
    const edges = [...many.fileConnections];
    for (let i = 0; i < 6; i++) {
      const f = plaza(`imp${i}.ts`, `imp${i}`);
      extra.push(f);
      edges.push({ from: `imp${i}`, to: "auth", weight: 1 });
    }
    const grown = city({
      ...many,
      files: [AUTH, LOGIN, SESSION, UTIL, ISOLATED, ...extra],
      tree: dir({
        path: "",
        fileCount: 11,
        detailFiles: [AUTH, LOGIN, SESSION, UTIL, ISOLATED, ...extra],
      }),
      fileConnections: edges,
    });
    await act(async () => useStore.setState({ cityData: grown }, false));
    await show(<GuideAction />);
    expect(buttons().filter((b) => (b.textContent || "").includes("Ask Ephe")).length).toBe(5);
    expect(text()).toContain("4 more connected files are named in the impact list above.");
  });
});

describe("B11 — the security resident follows the tour, the tour stays itself", () => {
  const risky = file("src/db.ts", "TypeScript", [
    finding({ type: "SQL_INJECTION", severity: "P0", line: 21, ruleId: "regex:SQL_INJECTION" }),
  ]);
  const other = file("src/other.ts", "TypeScript", [
    finding({ type: "CMD_INJECTION", severity: "P1", line: 5, ruleId: "regex:CMD_INJECTION" }),
  ]);

  function tourCity(): CityData {
    return city({
      files: [risky, other],
      tree: dir({
        path: "",
        fileCount: 2,
        detailFiles: [risky, other],
      }),
    });
  }

  const tourFile = () => {
    const unit = useStore.getState().selectedUnit;
    return unit?.kind === "file" ? unit.id : null;
  };

  it("starts the tour, sends the security resident, and keeps the tour panel's own state", async () => {
    await act(async () =>
      useStore.setState({ cityData: tourCity(), selectedUnit: null, focusPath: [] }, false),
    );
    await show(<GuideAction />);
    await act(async () => useStore.getState().startTour());
    const g = guide();
    expect(g?.role).toBe("security");
    expect(g!.targetFileId).toBe(risky.id);
    expect(useStore.getState().tourActive).toBe(true);
    expect(useStore.getState().tourIndex).toBe(0);
    expect(tourFile()).toBe(risky.id);
    // The claim is the finding the payload carries, not a sentence about it.
    expect(g!.claim).toMatchObject({ worst: "P0", ruleId: "regex:SQL_INJECTION", line: 21 });
  });

  it("follows the next stop and clears itself when the tour ends", async () => {
    await act(async () =>
      useStore.setState({ cityData: tourCity(), selectedUnit: null, focusPath: [] }, false),
    );
    await show(<GuideAction />);
    await act(async () => useStore.getState().startTour());
    await act(async () => useStore.getState().nextTour());
    expect(guide()!.targetFileId).toBe(other.id);
    expect(useStore.getState().tourIndex).toBe(1);
    await act(async () => useStore.getState().endTour());
    expect(guide()).toBeNull();
    expect(useStore.getState().tourActive).toBe(false);
    // The selection the tour made stays where the tour left it.
    expect(tourFile()).toBe(other.id);
  });

  it("sends nobody when the stop carries no finding", async () => {
    const clean = city({
      files: [AUTH],
      tree: dir({ path: "", fileCount: 1, detailFiles: [AUTH] }),
    });
    await act(async () =>
      useStore.setState({ cityData: clean, selectedUnit: null, focusPath: [] }, false),
    );
    await show(<GuideAction />);
    await act(async () => useStore.getState().startTour());
    expect(guide()).toBeNull();
  });

  it("does not let the tour's own selection change cancel the reader's errand", async () => {
    await show(<GuideAction />);
    await press("Ask Ephe to guide me login.ts");
    expect(guide()?.role).toBe("explorer");
    await act(async () =>
      useStore.setState(
        { cityData: tourCity(), selectedUnit: { kind: "file", id: risky.id } },
        false,
      ),
    );
    // The panel saw a new selection; the explorer errand it started is the one
    // that ends, and a security guide driven by the tour is not touched.
    expect(guide()).toBeNull();
  });
});

describe("B12 — the maintenance resident answers for one metric", () => {
  const TANGLED = file("src/db.ts", "TypeScript", [], undefined, {
    id: "tangled",
    cyclomaticComplexity: 22,
  });
  /** cx 1: the metric says the file has no branch, and that is not an errand. */
  const FLAT = file("src/plain.ts", "TypeScript", [], undefined, { id: "flat" });
  /** cx 1 by construction: the analyzer measures no behaviour into data. */
  const LOCK = file("pnpm-lock.yaml", "YAML", [], undefined, {
    id: "lock",
    role: "data",
    cyclomaticComplexity: 30,
  });
  const HUGE = file("src/huge.ts", "TypeScript", [], undefined, {
    id: "huge",
    cyclomaticComplexity: 400,
  });
  /** Real, but this level draws its directory as a block instead. */
  const NESTED = file("deep/nested.ts", "TypeScript", [], undefined, {
    id: "nested",
    cyclomaticComplexity: 8,
  });

  function maintCity(): CityData {
    return city({
      files: [TANGLED, FLAT, LOCK, HUGE, NESTED],
      tree: dir({
        path: "",
        detailFiles: [TANGLED, FLAT, LOCK, HUGE],
        children: [
          dir({ path: "deep", name: "deep", detailFiles: [NESTED], districtFiles: [NESTED] }),
        ],
      }),
    });
  }

  async function openOn(id: string, focusPath: string[] = []): Promise<void> {
    await act(async () =>
      useStore.setState(
        { cityData: maintCity(), focusPath, selectedUnit: { kind: "file", id } },
        false,
      ),
    );
    await show(<MaintenanceAction />);
  }

  // The reduced-motion cache is module-level, so the query is re-read here
  // rather than trusted from whatever the previous test left in it.
  afterEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    refreshReducedMotion();
  });

  beforeEach(() => {
    // jsdom has no scrollIntoView; the spy doubles as the stub and the proof.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("offers the ask where the metric measured something", async () => {
    await openOn("tangled");
    expect(text()).toContain("Ask Ephe about this complexity");
  });

  it("offers nothing for a branch-free file", async () => {
    await openOn("flat");
    expect(host.textContent).toBe("");
  });

  it("offers nothing for data, whatever number it carries", async () => {
    await openOn("lock");
    expect(host.textContent).toBe("");
  });

  it("sends the resident to the building the level draws, with the metric as its claim", async () => {
    await openOn("tangled");
    await press("Ask Ephe about this complexity");
    const g = guide();
    expect(g?.role).toBe("maintenance");
    if (g?.role !== "maintenance") throw new Error("not the maintenance errand");
    expect(g.targetFileId).toBe("tangled");
    // The number is the payload's own, not one the panel wrote down.
    expect(g.claim.cyclomatic).toBe(TANGLED.cyclomaticComplexity);
    expect(Number.isFinite(g.x) && Number.isFinite(g.z)).toBe(true);
    expect(useStore.getState().guidePhase).toBe("walking");
    expect(text()).toContain("The Maintenance Ephe is walking to db.ts.");
    expect(text()).not.toContain("decision points");
  });

  it("speaks the metric only after arrival, and names its own limits", async () => {
    await openOn("tangled");
    await press("Ask Ephe about this complexity");
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    await act(async () => useStore.getState().setGuidePhase("arrived"));
    expect(text()).toContain("cx 22 in db.ts: 21 decision points");
    expect(text()).toContain("It carries 25 % of the complexity value");
    expect(text()).toContain(
      "Height comes from three metrics. This one answers for complexity alone.",
    );
    // The dossier scrolls; a sentence that arrives below the fold did not arrive.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
  });

  it("switches to saturation once the metric has its full share", async () => {
    await openOn("huge");
    await press("Ask Ephe about this complexity");
    await act(async () => useStore.getState().setGuidePhase("arrived"));
    expect(text()).toContain("cx 400 in huge.ts: 399 decision points");
    expect(text()).toContain("this file is at or above it");
    // No share line: below the cap the percentage is the useful half of the
    // sentence, at the cap it would repeat the number the line already gives.
    expect(text()).not.toContain("It carries");
  });

  it("ends on the second click, on Escape, and on a new selection", async () => {
    await openOn("tangled");
    await press("Ask Ephe about this complexity");
    await press("Stop the guide");
    expect(guide()).toBeNull();

    await press("Ask Ephe about this complexity");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(guide()).toBeNull();

    await press("Ask Ephe about this complexity");
    await act(async () => useStore.setState({ selectedUnit: { kind: "file", id: "huge" } }, false));
    expect(guide()).toBeNull();
  });

  it("leaves the explorer errand alone when the selection changes", async () => {
    await openOn("tangled");
    await act(async () =>
      useStore.getState().startGuide({
        role: "explorer",
        targetFileId: "huge",
        x: 1,
        z: 1,
        claim: { importerPath: "huge.ts", importedPath: "db.ts", weight: 1 },
      }),
    );
    await act(async () => useStore.setState({ selectedUnit: { kind: "file", id: "flat" } }, false));
    // Two panels watch the same selection. Each answers for its own role only,
    // or the maintenance block would cancel a guide it never started.
    expect(guide()?.role).toBe("explorer");
  });

  it("says the level draws no building, not that the resident is busy", async () => {
    // The camera sits inside `deep`, so the selected root file is not a
    // building on this level. Measured on the layout the renderer uses, not
    // assumed: a small city does draw its subtree's files, so an ordinary
    // parent level would prove nothing here.
    await openOn("tangled", ["deep"]);
    await press("Ask Ephe about this complexity");
    expect(guide()).toBeNull();
    expect(text()).toContain("does not draw the file as a building");
    expect(text()).not.toContain("no free Maintenance Ephe");
  });

  it("gives a Reduced-Motion reader the sentence instead of a walk", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    refreshReducedMotion();
    await openOn("tangled");
    await press("Ask Ephe about this complexity");
    expect(guide()).toBeNull();
    expect(text()).toContain("cx 22 in db.ts: 21 decision points");
    expect(text()).toContain("the sentence stands here instead of a walk");
    // The scroll itself stays, but without the smooth animation: stillness was
    // the request, and a glide is the thing that was asked for less.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "auto",
    });
  });
});
