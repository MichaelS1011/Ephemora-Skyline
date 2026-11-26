// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseForgeGraph, readiness } from "../src/forge/validate";

const STORAGE_KEY = "ephemora-forge-project-v1";

async function store() {
  return (await import("../src/forge/store")).useForgeStore;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("FORGE project store", () => {
  it("loads templates as valid projects with a usable first result", async () => {
    const useForgeStore = await store();
    useForgeStore.getState().loadTemplate("shop-demo", "de");
    expect(useForgeStore.getState().project).toEqual({
      kind: "shop",
      name: "Demo-Shop",
      templateId: "shop-demo",
    });
    expect(
      useForgeStore.getState().graph.nodes.find((node) => node.id === "shop-checkout")?.label,
    ).toBe("Bestellung abschließen");
    expect(useForgeStore.getState().notice).toEqual({
      kind: "info",
      key: "notice.templateLoaded",
    });
    expect(useForgeStore.getState().graph.nodes).toHaveLength(7);
    expect(useForgeStore.getState().graph.edges).toHaveLength(3);
    expect(readiness(useForgeStore.getState().graph, "de")).toEqual([]);
    expect(useForgeStore.getState().notice?.kind).toBe("info");
    useForgeStore.getState().setPhase("test");
    expect(useForgeStore.getState().notice).toBeNull();

    useForgeStore.getState().loadTemplate("website-onepager", "de");
    expect(useForgeStore.getState().graph.nodes.map((node) => node.cell[2])).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(readiness(useForgeStore.getState().graph, "de")).toEqual([]);

    useForgeStore.getState().loadTemplate("app-dashboard", "de");
    expect(useForgeStore.getState().graph.nodes).toHaveLength(5);
    expect(
      useForgeStore.getState().graph.nodes.some((node) => node.catalogId === "shadcn-table"),
    ).toBe(true);
    expect(readiness(useForgeStore.getState().graph, "de")).toEqual([]);
  });

  it("creates templates in the requested language and preserves authored names", async () => {
    const useForgeStore = await store();
    useForgeStore.getState().loadTemplate("website-onepager", "en");
    expect(useForgeStore.getState().project.name).toBe("Studio website");
    expect(
      useForgeStore.getState().graph.nodes.find((node) => node.id === "site-hero")?.label,
    ).toContain("Software that gets better up close");

    useForgeStore.getState().loadTemplate("website-onepager", "de");
    expect(useForgeStore.getState().project.name).toBe("Studio-Website");
    expect(
      useForgeStore.getState().graph.nodes.find((node) => node.id === "site-hero")?.label,
    ).toContain("Software, die aus der Nähe besser wird");

    useForgeStore.getState().startBlank("de");
    expect(useForgeStore.getState().project.name).toBe("Mein Software-Projekt");
  });

  it("rejects cells outside the grid, build area or level range without changing history", async () => {
    const useForgeStore = await store();
    const forge = useForgeStore.getState();
    forge.startBlank();

    for (const cell of [
      [28, 0],
      [0, -28],
      [1, 0],
      [0, 1],
      [0, 0, -1],
      [0, 0, 13],
      [0.5, 0],
      [Number.NaN, 0],
    ] as const) {
      expect(forge.place(cell, "forge-text"), cell.join(",")).toBe(false);
    }

    expect(useForgeStore.getState().graph).toEqual({ nodes: [], edges: [] });
    expect(useForgeStore.getState().past).toEqual([]);
    expect(useForgeStore.getState().nextBlock).toBe(1);
    expect(useForgeStore.getState().notice).toEqual({ kind: "error", key: "notice.invalidCell" });
  });

  it("treats a two-coordinate cell as level zero and preserves distinct elevations", async () => {
    const useForgeStore = await store();
    const forge = useForgeStore.getState();
    forge.startBlank();
    expect(forge.place([0, 0], "forge-text")).toBe(true);
    expect(forge.place([0, 0, 1], "forge-button")).toBe(true);
    expect(forge.place([0, 0, 1], "forge-gallery")).toBe(false);
    expect(forge.place([0, 0], "forge-gallery")).toBe(false);
    expect(useForgeStore.getState().graph.nodes).toHaveLength(2);
    expect(useForgeStore.getState().notice?.kind).toBe("error");
    expect(forge.remove([0, 0, 1])).toBe(true);
    expect(useForgeStore.getState().graph.nodes).toHaveLength(1);
  });

  it.each([
    { cell: [28, 0] },
    { cell: [0, -28] },
    { cell: [1, 0] },
    { cell: [0, 1] },
    { cell: [0, 0, -1] },
    { cell: [0, 0, 13] },
    { cell: [0.5, 0] },
    { cell: [Number.NaN, 0] },
  ] as const)("rejects an imported node at invalid cell $cell", ({ cell }) => {
    expect(() =>
      parseForgeGraph({
        nodes: [
          {
            id: "block-1",
            catalogId: "forge-text",
            cell,
            label: "Text",
            color: "#ffffff",
          },
        ],
        edges: [],
      }),
    ).toThrow("Invalid Forge cell");
  });

  it("accepts the build-area and level boundaries", async () => {
    const useForgeStore = await store();
    const forge = useForgeStore.getState();
    forge.startBlank();

    expect(forge.place([-26, 26], "forge-text")).toBe(true);
    expect(forge.place([26, -26, 12], "forge-button")).toBe(true);
    expect(useForgeStore.getState().graph.nodes.map((node) => node.cell)).toEqual([
      [-26, 26],
      [26, -26, 12],
    ]);
  });

  it("undoes and redoes placement, links and cascading removal without mutating snapshots", async () => {
    const useForgeStore = await store();
    const forge = useForgeStore.getState();
    forge.startBlank();
    forge.place([0, 0], "forge-gallery");
    forge.place([2, 0], "forge-cart");
    const unlinked = useForgeStore.getState().graph;
    expect(
      forge.link({ from: "block-1", fromPort: "products", to: "block-2", toPort: "products" }),
    ).toBeNull();
    const connected = useForgeStore.getState().graph;
    forge.removeNode("block-1");
    expect(useForgeStore.getState().graph).toEqual({ nodes: [connected.nodes[1]], edges: [] });

    forge.undo();
    expect(useForgeStore.getState().graph).toEqual(connected);
    forge.redo();
    expect(useForgeStore.getState().graph).toEqual({ nodes: [connected.nodes[1]], edges: [] });
    forge.undo();
    forge.undo();
    expect(useForgeStore.getState().graph.nodes).toHaveLength(2);
    expect(useForgeStore.getState().graph.edges).toHaveLength(0);
    expect(useForgeStore.getState().graph).toEqual(unlinked);
  });

  it("persists graph and project metadata and hydrates them on the next import", async () => {
    const useForgeStore = await store();
    useForgeStore.getState().loadTemplate("shop-demo");
    useForgeStore.getState().renameProject("Mein lokaler Shop");
    const expected = useForgeStore.getState().graph;
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.project.name).toBe("Mein lokaler Shop");
    expect(saved.graph).toEqual(expected);

    vi.resetModules();
    const reloaded = await store();
    expect(reloaded.getState().graph).toEqual(expected);
    expect(reloaded.getState().project.name).toBe("Mein lokaler Shop");
  });

  it("fails closed to the starter when saved project data is malformed", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      '{"graph":{"nodes":[],"edges":[]},"project":{"kind":"website"}}',
    );
    const useForgeStore = await store();
    expect(useForgeStore.getState().graph).toEqual({ nodes: [], edges: [] });
    expect(useForgeStore.getState().project.templateId).toBe("new");
  });
});
