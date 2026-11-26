// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { ForgeApp } from "../src/forge/ForgeApp";
import { writeProject } from "../src/forge/codegen";
import type * as ForgeCodegen from "../src/forge/codegen";
import { useForgeStore } from "../src/forge/store";
import { FORGE_CATALOG } from "../src/forge/catalog";
import { useStore } from "../src/stores/useStore";
import { byTestId, click, fill, key, mount, q, qa, text, unmount } from "./helpers/forgeDom";

vi.mock("../src/forge/world/VoxelWorld", () => ({
  VoxelWorld: () => <div data-testid="forge-world-stub" />,
}));

vi.mock("../src/forge/codegen", async (importOriginal) => ({
  ...(await importOriginal<typeof ForgeCodegen>()),
  writeProject: vi.fn(),
}));

function connectedGraph() {
  const forge = useForgeStore.getState();
  forge.reset();
  forge.place([0, 0], "forge-gallery");
  forge.place([2, 0], "forge-cart");
  forge.place([4, 0], "forge-user");
  forge.place([6, 0], "forge-order-form");
  forge.link({ from: "block-1", fromPort: "products", to: "block-2", toPort: "products" });
  forge.link({ from: "block-2", fromPort: "order", to: "block-4", toPort: "order" });
  forge.link({ from: "block-3", fromPort: "user", to: "block-4", toPort: "user" });
  return useForgeStore.getState().graph;
}

beforeEach(() => {
  localStorage.clear();
  useStore.getState().setPref("lang", "de");
  useForgeStore.getState().reset();
  vi.mocked(writeProject).mockReset();
  vi.mocked(writeProject).mockResolvedValue(undefined as never);
});

afterEach(unmount);

describe("FORGE shell safety", () => {
  it("starts with concrete template choices instead of an empty world", () => {
    mount(<ForgeApp onExit={() => undefined} />);
    expect(text(byTestId("forge-starter"))).toContain("Was willst du bauen?");
    expect(q('[data-testid="forge-world-stub"]')).toBeNull();
    expect(q('[data-testid="forge-test-export"]')).toBeNull();
    expect(q('[data-testid="forge-template-website-onepager"]')).not.toBeNull();
    expect(q('[data-testid="forge-template-shop-demo"]')).not.toBeNull();
    expect(q('[data-testid="forge-template-app-dashboard"]')).not.toBeNull();

    key("KeyE");
    expect(q('[data-testid="forge-inventory"]')).toBeNull();
    click(byTestId("forge-template-blank"));
    expect(byTestId("forge-world-stub")).toBeDefined();
    expect(text(byTestId("forge-objective"))).toContain("Klicke auf ein freies Rasterfeld");
    expect(q('[data-testid="forge-test-export"]')).toBeNull();
  });

  it("keeps the graph when leaving with Zurück", () => {
    const graph = connectedGraph();
    const onExit = vi.fn();
    mount(<ForgeApp onExit={onExit} />);
    click(byTestId("forge-exit"));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(useForgeStore.getState().graph).toBe(graph);
  });

  it("requires an accessible confirmation before explicitly resetting", () => {
    connectedGraph();
    mount(<ForgeApp onExit={() => undefined} />);
    click(byTestId("forge-inventory-toggle"));
    click(byTestId("forge-reset"));
    const dialog = q('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(text(dialog)).toContain("Alle Bausteine und Verbindungen werden gelöscht");
    expect(document.activeElement).toBe(byTestId("forge-reset-cancel"));
    expect(useForgeStore.getState().graph.nodes).toHaveLength(4);

    click(byTestId("forge-reset-cancel"));
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(useForgeStore.getState().graph.nodes).toHaveLength(4);
    expect(document.activeElement).toBe(byTestId("forge-reset"));

    click(byTestId("forge-reset"));
    key("Escape");
    expect(q('[role="alertdialog"]')).toBeNull();
    expect(useForgeStore.getState().graph.nodes).toHaveLength(4);

    click(byTestId("forge-reset"));
    click(byTestId("forge-reset-confirm"));
    expect(useForgeStore.getState().graph).toEqual({ nodes: [], edges: [] });
  });

  it("isolates the reset dialog and returns focus to a usable control after confirming", () => {
    connectedGraph();
    mount(<ForgeApp onExit={() => undefined} />);
    click(byTestId("forge-inventory-toggle"));
    click(byTestId("forge-reset"));

    expect(q(".forge-app-surface")?.hasAttribute("inert")).toBe(true);
    key("KeyE");
    expect(useForgeStore.getState().inventoryOpen).toBe(true);
    key("KeyP");
    expect(useForgeStore.getState().phase).toBe("build");
    expect(q('[data-testid="forge-preview-panel"]')).toBeNull();

    click(byTestId("forge-reset-confirm"));
    expect(useForgeStore.getState().graph).toEqual({ nodes: [], edges: [] });
    expect(document.activeElement).toBe(byTestId("forge-exit"));
  });

  it("leaves macOS command shortcuts to the browser", () => {
    connectedGraph();
    mount(<ForgeApp onExit={() => undefined} />);
    for (const code of ["KeyP", "KeyE"]) {
      const event = new KeyboardEvent("keydown", {
        code,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => window.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
    expect(useForgeStore.getState().phase).toBe("build");
    expect(q('[data-testid="forge-inventory"]')).toBeNull();
    expect(q('[data-testid="forge-preview-panel"]')).toBeNull();
  });

  it("blocks PLAY and reports missing required inputs", () => {
    const forge = useForgeStore.getState();
    for (const [index, catalogId] of [
      "forge-gallery",
      "forge-cart",
      "forge-user",
      "forge-order-form",
    ].entries()) {
      forge.place([index * 2, 0], catalogId);
    }
    mount(<ForgeApp onExit={() => undefined} />);
    expect((byTestId("forge-play") as HTMLButtonElement).disabled).toBe(true);
    expect(text(byTestId("forge-readiness"))).toContain("Warenkorb hat keine Produktquelle");
    click(byTestId("forge-play"));
    key("KeyP");
    expect(q('[data-testid="forge-preview-panel"]')).toBeNull();
  });

  it("opens PLAY when every required input is connected", () => {
    connectedGraph();
    mount(<ForgeApp onExit={() => undefined} />);
    expect((byTestId("forge-play") as HTMLButtonElement).disabled).toBe(false);
    click(byTestId("forge-play"));
    expect(byTestId("forge-preview")).toBeDefined();
    expect(q('[data-testid="forge-readiness"]')).toBeNull();
  });

  it("opens a ready website in the test phase and exports its renamed project", async () => {
    vi.mocked(writeProject).mockResolvedValue({
      kind: "download",
      fileCount: 15,
      fileName: "ephemora-forge-app.zip",
    } as never);
    useForgeStore.getState().loadTemplate("website-onepager");
    mount(<ForgeApp onExit={() => undefined} />);
    expect(text(byTestId("forge-objective"))).toContain("Bereit zum Testen");
    expect((byTestId("forge-phase-test") as HTMLButtonElement).disabled).toBe(false);
    click(byTestId("forge-phase-test"));
    expect(byTestId("forge-test-stage")).toBeDefined();
    expect(q(".forge-notice")).toBeNull();
    expect(q('[data-testid="forge-world-stub"]')).toBeNull();
    expect(text(q(".forge-runtime-hero"))).toContain("Software, die aus der Nähe besser wird");
    fill(byTestId("forge-project-name") as HTMLInputElement, "Studio Relaunch");
    expect(text(byTestId("forge-preview"))).toContain("Studio Relaunch");

    const mobile = [...byTestId("forge-preview").querySelectorAll("button")].find(
      (element) => element.textContent === "Mobile",
    )!;
    click(mobile);
    expect(q(".forge-runtime-browser")?.getAttribute("data-device")).toBe("mobile");

    await act(async () => {
      byTestId("forge-test-export").click();
      await Promise.resolve();
    });
    const files = vi.mocked(writeProject).mock.calls[0]![0];
    const exportedProject = files.find((file) => file.path === "src/project.json")!;
    expect(JSON.parse(exportedProject.content).name).toBe("Studio Relaunch");
    expect(text(byTestId("forge-export-status"))).toContain("ZIP lokal gespeichert");
  });

  it("reports one ZIP with the complete localized file count", async () => {
    vi.mocked(writeProject).mockResolvedValue({
      kind: "download",
      fileCount: 15,
      fileName: "ephemora-forge-app.zip",
    } as never);
    connectedGraph();
    mount(<ForgeApp onExit={() => undefined} />);
    click(byTestId("forge-phase-test"));
    await act(async () => {
      byTestId("forge-test-export").click();
      await Promise.resolve();
    });
    expect(text(byTestId("forge-export-status"))).toContain("ZIP lokal gespeichert");
    expect(text(byTestId("forge-export-status"))).toContain("15 Dateien");
  });

  it("switches the whole shell between English and German without losing the graph", () => {
    connectedGraph();
    useStore.getState().setPref("lang", "en");
    mount(<ForgeApp onExit={() => undefined} />);
    expect(text(byTestId("forge-objective"))).toContain("Ready to test");
    const switchGroup = q<HTMLElement>(".forge-language-switch")!;
    click(
      [...switchGroup.querySelectorAll("button")].find(
        (element) => element.getAttribute("aria-pressed") === "false",
      )!,
    );
    expect(useStore.getState().prefs.lang).toBe("de");
    expect(text(byTestId("forge-objective"))).toContain("Bereit zum Testen");
    expect(useForgeStore.getState().graph.nodes).toHaveLength(4);
  });

  it("shows ten essential blocks first and keeps the full catalog behind one action", () => {
    useForgeStore.getState().startBlank("en");
    mount(<ForgeApp onExit={() => undefined} />);
    click(byTestId("forge-inventory-toggle"));
    expect(qa(".forge-inventory-item")).toHaveLength(10);
    click(q(".forge-inventory-modes button")!);
    expect(qa(".forge-inventory-item")).toHaveLength(FORGE_CATALOG.length);
  });
});
