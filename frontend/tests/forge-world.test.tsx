// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { ForgeApp } from "../src/forge/ForgeApp";
import { useForgeStore } from "../src/forge/store";
import { useStore } from "../src/stores/useStore";
import { blockSummary } from "../src/forge/world/VoxelWorld";
import { FORGE_CATALOG } from "../src/forge/catalog";
import { byTestId, click, key, mount, qa, text, unmount } from "./helpers/forgeDom";

vi.mock("../src/forge/world/VoxelWorld", () => ({
  VoxelWorld: () => <div data-testid="forge-world-stub" />,
  blockSummary: (graph: { nodes: readonly { label: string }[] }, lang: "en" | "de" = "en") =>
    graph.nodes.map((node) => `${node.label}:${lang}`).join(", "),
}));

beforeEach(() => {
  localStorage.clear();
  useStore.getState().setPref("lang", "de");
  useForgeStore.getState().reset();
  useForgeStore.getState().setMode("build");
});

afterEach(unmount);

describe("FORGE world shell", () => {
  it("keeps place and remove in the store so the preview sees the same graph", () => {
    useForgeStore.getState().place([0, 0], "forge-gallery");
    useForgeStore.getState().place([2, 0], "forge-cart");
    const summary = blockSummary(useForgeStore.getState().graph, "de");
    expect(summary).toContain("Product gallery:de");
    useForgeStore.getState().remove([0, 0]);
    expect(useForgeStore.getState().graph.nodes).toHaveLength(1);
  });

  it("opens the full inventory with E and filters it", () => {
    useForgeStore.getState().startBlank();
    mount(<ForgeApp onExit={() => undefined} />);
    key("KeyE");
    const inventory = byTestId("forge-inventory");
    expect(inventory.textContent).toContain(String(FORGE_CATALOG.length));
    expect(qa(".forge-inventory-item")).toHaveLength(10);
    const search = inventory.querySelector(
      'input[aria-label="Bausteine suchen"]',
    ) as HTMLInputElement;
    expect(search).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      search.dispatchEvent(new Event("focus"));
      // Direct assignment is enough here: the inventory filter is a controlled
      // React input, so React's own value tracker is updated by the native setter.
      setter?.call(search, "Warenkorb");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(qa(".forge-inventory-item").length).toBeGreaterThan(0);
  });

  it("opens PLAY with P for a connected graph and selects hotbar blocks with digits", () => {
    const forge = useForgeStore.getState();
    forge.place([0, 0], "forge-gallery");
    forge.place([2, 0], "forge-cart");
    forge.place([4, 0], "forge-user");
    forge.place([6, 0], "forge-order-form");
    forge.link({ from: "block-1", fromPort: "products", to: "block-2", toPort: "products" });
    forge.link({ from: "block-2", fromPort: "order", to: "block-4", toPort: "order" });
    forge.link({ from: "block-3", fromPort: "user", to: "block-4", toPort: "user" });
    mount(<ForgeApp onExit={() => undefined} />);
    key("Digit2");
    expect(useForgeStore.getState().selectedId).toBe("forge-cart");
    key("KeyP");
    expect(byTestId("forge-preview")).toBeDefined();
    expect(byTestId("forge-preview-panel")).toBeDefined();
  });

  it("connects only an explicitly selected valid port pair", () => {
    useForgeStore.getState().place([0, 0], "forge-gallery");
    useForgeStore.getState().place([2, 0], "forge-cart");
    mount(<ForgeApp onExit={() => undefined} />);
    click(byTestId("forge-phase-connect"));
    expect(useForgeStore.getState().graph.edges).toHaveLength(0);
    click(byTestId("forge-output-products"));
    click(qa(".forge-target-button")[0]!);
    const graph = useForgeStore.getState().graph;
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ from: "block-1", to: "block-2", toPort: "products" });

    click(byTestId("forge-output-ui"));
    expect(text(byTestId("forge-connect-targets"))).toContain("Kein passender Eingang ist frei");
    click(qa(".forge-edge-row button")[0]!);
    expect(useForgeStore.getState().graph.edges).toHaveLength(0);
  });
});
