import { describe, expect, it } from "vitest";
import type { ForgeGraph, ForgeNode } from "../src/forge/contracts";
import { catalogById } from "../src/forge/catalog";
import { checkConnection, connect, readiness } from "../src/forge/validate";
import { useForgeStore } from "../src/forge/store";

const node = (id: string, catalogId: string): ForgeNode => ({
  id,
  catalogId,
  cell: [0, 0],
  label: catalogId,
  color: "#7AA2F7",
});

const graph: ForgeGraph = {
  nodes: [
    node("g", "forge-gallery"),
    node("c", "forge-cart"),
    node("u", "forge-user"),
    node("f", "forge-order-form"),
  ],
  edges: [],
};

const edge = (from: string, fromPort: string, to: string, toPort: string) => ({
  from,
  fromPort,
  to,
  toPort,
});

describe("FORGE port validation", () => {
  it("accepts a matching output→input pair and keeps the old graph intact", () => {
    const result = connect(graph, edge("g", "products", "c", "products"));
    expect(result.issue).toBeNull();
    expect(result.graph.edges).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it("rejects reversed direction, mismatched kind, self-links and occupied inputs", () => {
    expect(checkConnection(graph, edge("c", "products", "g", "products"))?.code).toBe("direction");
    expect(checkConnection(graph, edge("g", "ui", "c", "products"))?.code).toBe("kind");
    expect(checkConnection(graph, edge("c", "products", "c", "products"))?.code).toBe("self");
    const linked = connect(graph, edge("g", "products", "c", "products")).graph;
    expect(checkConnection(linked, edge("g", "products", "c", "products"))?.code).toBe(
      "occupied-input",
    );
  });

  it("returns a German message a user can act on", () => {
    const issue = checkConnection(graph, edge("g", "ui", "c", "products"));
    expect(issue?.message.de).toContain("Anschluss braucht");
  });

  it("reports missing required connections instead of pretending the graph runs", () => {
    expect(readiness({ nodes: [node("c", "forge-cart")], edges: [] }, "de").length).toBe(1);
    const formOnly = readiness({ nodes: [node("f", "forge-order-form")], edges: [] }, "en");
    expect(formOnly.length).toBe(2);
    expect(formOnly.some((text) => text.includes("cart"))).toBe(true);
  });

  it("becomes ready once product, order and user ports are connected", () => {
    const step1 = connect(graph, edge("g", "products", "c", "products")).graph;
    const step2 = connect(step1, edge("c", "order", "f", "order")).graph;
    const step3 = connect(step2, edge("u", "user", "f", "user")).graph;
    expect(readiness(step3, "de")).toEqual([]);
  });

  it("keeps catalog ports inside the declared port kinds", () => {
    for (const entry of ["forge-cart", "forge-order-form", "forge-user"].map((id) =>
      catalogById(id)!,
    )) {
      for (const port of entry.ports) expect(["in", "out"]).toContain(port.direction);
    }
  });

  it("rejects occupied cells instead of silently replacing a connected node", () => {
    const forge = useForgeStore.getState();
    forge.reset();
    forge.place([0, 0], "forge-gallery");
    forge.place([2, 0], "forge-cart");
    expect(
      forge.link({ from: "block-1", fromPort: "products", to: "block-2", toPort: "products" }),
    ).toBeNull();
    expect(forge.place([0, 0], "forge-text")).toBe(false);
    const after = useForgeStore.getState().graph;
    expect(after.nodes.some((entry) => entry.id === "block-1")).toBe(true);
    expect(after.edges).toHaveLength(1);
    expect(useForgeStore.getState().notice?.kind).toBe("error");

    forge.remove([0, 0]);
    expect(useForgeStore.getState().graph.edges).toHaveLength(0);
  });

  it("rejects wrong source ports even when the destination port is occupied correctly", () => {
    const invalid: ForgeGraph = {
      nodes: [node("g", "forge-gallery"), node("c", "forge-cart")],
      edges: [edge("g", "ui", "c", "products")],
    };
    expect(readiness(invalid, "de")).toHaveLength(1);
  });

  it("requires products, not merely optional store state, for a cart", () => {
    const storeOnly: ForgeGraph = {
      nodes: [node("s", "forge-storage"), node("c", "forge-cart")],
      edges: [edge("s", "store", "c", "store")],
    };
    expect(readiness(storeOnly, "en")).toHaveLength(1);
    expect(readiness(storeOnly, "en")[0]).toContain("product source");
  });

  it("requires the declared cart and user renderers on form inputs", () => {
    const crossed: ForgeGraph = {
      nodes: graph.nodes,
      edges: [
        edge("g", "products", "c", "products"),
        edge("u", "user", "f", "order"),
        edge("c", "order", "f", "user"),
      ],
    };
    expect(readiness(crossed, "en")).toHaveLength(2);
  });

  it("fails closed on ambiguous duplicate incoming edges", () => {
    const otherGallery = node("g2", "forge-gallery");
    const ambiguous: ForgeGraph = {
      nodes: [...graph.nodes, otherGallery],
      edges: [edge("g", "products", "c", "products"), edge("g2", "products", "c", "products")],
    };
    expect(readiness(ambiguous, "de").some((message) => message.includes("Produktquelle"))).toBe(
      true,
    );
  });
});
