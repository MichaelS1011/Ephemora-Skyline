// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import App from "../src/App";
import { useStore } from "../src/stores/useStore";
import { useForgeStore } from "../src/forge/store";
import { byTestId, click, mount, q, text, unmount } from "./helpers/forgeDom";

vi.mock("../src/forge/world/VoxelWorld", () => ({
  VoxelWorld: () => <div data-testid="forge-world-stub" />,
}));

beforeEach(() => {
  localStorage.clear();
  useStore.getState().setPref("lang", "de");
  useForgeStore.getState().reset();
  useForgeStore.getState().setMode("select");
  useStore.getState().setCityData(null);
});

afterEach(unmount);

describe("BUILD / EXPLORE entry", () => {
  it("shows two real choices on arrival", () => {
    mount(<App />);
    expect(byTestId("forge-mode-select")).toBeDefined();
    expect(byTestId("forge-mode-explore")).toBeDefined();
    expect(byTestId("forge-mode-build")).toBeDefined();
  });

  it("switches the entry and starter into English without leaving FORGE", async () => {
    mount(<App />);
    const english = [...q<HTMLElement>(".forge-language-switch")!.querySelectorAll("button")].find(
      (element) => element.textContent === "EN",
    )!;
    click(english);
    expect(text(q(".forge-mode-select")!)).toContain("Build a city. Or build software.");
    click(byTestId("forge-mode-build"));
    await vi.waitFor(() => expect(byTestId("forge-starter")).toBeDefined(), { timeout: 5000 });
    expect(text(byTestId("forge-starter"))).toContain("What do you want to build?");
    expect(text(byTestId("forge-starter"))).toContain("Studio website");
  });

  it("EXPLORE keeps the unchanged landing", () => {
    mount(<App />);
    click(byTestId("forge-mode-explore"));
    expect(q(".landing-shell")).not.toBeNull();
    expect(q("[data-testid='forge-mode-select']")).toBeNull();
  });

  it("BUILD offers a ready-made first success before opening the functional hotbar", async () => {
    mount(<App />);
    click(byTestId("forge-mode-build"));
    await vi.waitFor(() => expect(byTestId("forge-starter")).toBeDefined(), { timeout: 5000 });
    expect(text(byTestId("forge-starter"))).toContain("Was willst du bauen?");
    expect(byTestId("forge-template-shop-demo")).toBeDefined();
    click(byTestId("forge-template-shop-demo"));
    await vi.waitFor(() => expect(byTestId("forge-world-stub")).toBeDefined(), { timeout: 5000 });
    expect(q("[data-testid='forge-app']")?.querySelectorAll(".forge-slot").length).toBe(10);
    expect(useForgeStore.getState().graph.edges).toHaveLength(3);
  });
});
