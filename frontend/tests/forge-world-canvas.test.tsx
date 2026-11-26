// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { VoxelWorld } from "../src/forge/world/VoxelWorld";
import { useForgeStore } from "../src/forge/store";
import { useStore } from "../src/stores/useStore";
import { mount, unmount } from "./helpers/forgeDom";

const canvas = document.createElement("canvas");
const camera = {
  position: new Vector3(0, 2.4, 6),
  getWorldDirection: vi.fn(),
  rotation: { set: vi.fn() },
  lookAt: vi.fn(),
};
let frame: ((state: unknown, delta: number) => void) | undefined;
let frames: ((state: unknown, delta: number) => void)[];

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="r3f-scene">
      {Children.toArray(children).map((child) =>
        isValidElement(child) &&
        typeof child.type === "function" &&
        ["Controls", "MouseLook", "PlayerAvatar"].includes(child.type.name)
          ? child
          : null,
      )}
    </div>
  ),
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    frames.push(callback);
    frame = callback;
  },
  useThree: () => ({ camera, gl: { domElement: canvas } }),
}));

beforeEach(() => {
  localStorage.clear();
  useStore.getState().setPref("lang", "de");
  useForgeStore.getState().reset();
  camera.position.set(0, 1.7, 6);
  camera.getWorldDirection.mockImplementation((direction) => {
    direction.set(0, 0, -1);
    return direction;
  });
  frame = undefined;
  frames = [];
  camera.rotation.set.mockClear();
  camera.lookAt.mockClear();
  canvas.requestPointerLock = vi.fn();
  Object.defineProperty(document, "pointerLockElement", { configurable: true, value: null });
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("FORGE world scene boundary", () => {
  it("keeps the pointer-lock HUD in the DOM outside the R3F scene", () => {
    const host = mount(<VoxelWorld />);
    const scene = host.querySelector('[data-testid="r3f-scene"]');
    const hud = host.querySelector(".forge-pointer-state");

    expect(scene).not.toBeNull();
    expect(scene?.querySelector("div, p, span, button, nav, section, form")).toBeNull();
    expect(hud).not.toBeNull();
    expect(scene?.contains(hud)).toBe(false);
    expect(hud?.getAttribute("aria-live")).toBe("polite");
    expect(hud?.textContent).toContain("Kein Ziel in Reichweite");
    expect(host.querySelector(".forge-world")?.getAttribute("aria-label")).toBe(
      "Begehbare Bauwelt",
    );

    act(() => useStore.getState().setPref("lang", "en"));
    expect(hud?.textContent).toContain("No target in reach");
    expect(host.querySelector(".forge-world")?.getAttribute("aria-label")).toBe(
      "Walkable building world",
    );
  });

  it("still requests pointer lock and announces the active controls", () => {
    const host = mount(<VoxelWorld />);
    const hud = host.querySelector(".forge-pointer-state");

    canvas.click();
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();

    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
    act(() => document.dispatchEvent(new Event("pointerlockchange")));

    expect(hud?.textContent).toContain("Maus aktiv");
  });

  it("keeps the initial downward camera pitch when arrow look starts", () => {
    camera.getWorldDirection.mockImplementation((direction) => {
      direction.set(0, -0.4, -Math.sqrt(0.84));
      return direction;
    });
    mount(<VoxelWorld />);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight" })));
    act(() => frames[0]?.({}, 0.05));
    const [pitch, yaw, roll, order] = camera.rotation.set.mock.calls.at(-1)!;
    expect(pitch).toBeCloseTo(Math.asin(-0.4), 10);
    expect(yaw).toBeCloseTo(-0.08, 10);
    expect(roll).toBe(0);
    expect(order).toBe("YXZ");
  });

  it("keeps the unlocked controls usable when pointer lock is rejected", async () => {
    const host = mount(<VoxelWorld />);
    const hud = host.querySelector(".forge-pointer-state");
    canvas.requestPointerLock = vi.fn().mockRejectedValue(new Error("Pointer lock unavailable"));
    await act(async () => {
      canvas.click();
      await Promise.resolve();
    });
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();
    expect(hud?.textContent).toContain("Klick platziert");
    expect(hud?.textContent).not.toContain("Maus aktiv");
  });

  it("clears held movement when focus enters an interactive control", () => {
    const host = mount(<VoxelWorld />);
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
    act(() => document.dispatchEvent(new Event("pointerlockchange")));
    const walking = new KeyboardEvent("keydown", {
      code: "KeyW",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(walking);
    expect(walking.defaultPrevented).toBe(true);
    expect(frame).toBeTypeOf("function");
    act(() => frame?.({}, 0.05));
    expect(camera.position.z).toBeLessThan(6);
    camera.position.z = 6;

    const button = document.createElement("button");
    host.append(button);
    act(() => button.focus());
    act(() => frame?.({}, 0.05));

    expect(camera.position.z).toBe(6);
  });

  it("normalizes diagonal walking and applies sprint without exceeding the frame delta", () => {
    mount(<VoxelWorld />);
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
    act(() => document.dispatchEvent(new Event("pointerlockchange")));
    for (const code of ["KeyW", "KeyD"]) {
      act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true })));
    }
    act(() => frame?.({}, 0.05));
    expect(camera.position.x).toBeCloseTo(0.1767767, 5);
    expect(camera.position.z).toBeCloseTo(5.8232233, 5);

    camera.position.x = 0;
    camera.position.z = 6;
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.x).toBeCloseTo(0.3535534, 5);
    expect(camera.position.z).toBeCloseTo(5.6464466, 5);
  });

  it("blocks walking into a block and clamps vertical movement", () => {
    useForgeStore.getState().place([0, 4], "forge-text");
    mount(<VoxelWorld />);
    camera.position.y = 1.7;
    camera.position.z = 4.5;
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
    act(() => document.dispatchEvent(new Event("pointerlockchange")));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.z).toBe(4.5);
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" })));
    camera.position.z = 2.8;

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.y).toBeCloseTo(1.95, 5);
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
    camera.position.y = 15.7;
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.y).toBe(15.7);
  });

  it("leaves text input alone and captures movement only while pointer-locked", () => {
    const host = mount(<VoxelWorld />);
    const input = document.createElement("input");
    host.append(input);
    input.focus();

    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "Space"]) {
      const typing = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
      input.dispatchEvent(typing);
      expect(typing.defaultPrevented, `${code} must not be swallowed while typing`).toBe(false);
    }

    const unlocked = new KeyboardEvent("keydown", {
      code: "KeyW",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(unlocked);
    expect(unlocked.defaultPrevented).toBe(false);

    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
    act(() => document.dispatchEvent(new Event("pointerlockchange")));
    const typingLocked = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(typingLocked);
    expect(typingLocked.defaultPrevented).toBe(false);

    const button = document.createElement("button");
    host.append(button);
    button.focus();
    const activating = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(activating);
    expect(activating.defaultPrevented, "Space must still activate a focused button").toBe(false);

    const walking = new KeyboardEvent("keydown", {
      code: "KeyW",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(walking);
    expect(walking.defaultPrevented).toBe(true);
  });
});

function viewToggle(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('[data-testid="forge-view-toggle"]');
  if (!button) throw new Error("Missing First/Third Person toggle");
  return button;
}

function enterThirdPerson(host: HTMLElement): void {
  act(() => viewToggle(host).click());
}

function lockPointer(): void {
  Object.defineProperty(document, "pointerLockElement", { configurable: true, value: canvas });
  act(() => document.dispatchEvent(new Event("pointerlockchange")));
}

function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f0-9]{2}/gi)!.map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("FORGE player avatar and camera view", () => {
  it("keeps DOM-only visibility data off R3F objects", () => {
    const source = readFileSync(resolve(process.cwd(), "src/forge/world/PlayerAvatar.tsx"), "utf8");

    expect(source).not.toMatch(/data-visible|data-testid/);
  });

  it("toggles First/Third Person with the visible bilingual button and F5", () => {
    const host = mount(<VoxelWorld />);
    const button = viewToggle(host);
    const world = host.querySelector('[data-testid="forge-world"]');
    const avatar = host.querySelector('[name^="forge-player-avatar"]');

    expect(button.textContent).toContain("Dritte-Person-Ansicht");
    expect(button.textContent).toContain("F5");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(world?.getAttribute("data-view")).toBe("first");
    expect(avatar?.getAttribute("name")).toBe("forge-player-avatar-hidden");

    act(() => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(world?.getAttribute("data-view")).toBe("third");
    expect(avatar?.getAttribute("name")).toBe("forge-player-avatar");

    const toFirst = new KeyboardEvent("keydown", {
      code: "F5",
      key: "F5",
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(toFirst));
    expect(toFirst.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(avatar?.getAttribute("name")).toBe("forge-player-avatar-hidden");

    act(() => useStore.getState().setPref("lang", "en"));
    expect(button.textContent).toContain("Third-person view");
    const toThird = new KeyboardEvent("keydown", {
      code: "F5",
      key: "F5",
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(toThird));
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves F5 alone while editing text fields or a contenteditable element", () => {
    const host = mount(<VoxelWorld />);
    const fields: HTMLElement[] = [
      document.createElement("input"),
      document.createElement("textarea"),
      document.createElement("select"),
    ];
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.tabIndex = 0;
    fields.push(editable);

    for (const field of fields) {
      host.append(field);
      act(() => field.focus());
      const event = new KeyboardEvent("keydown", {
        code: "F5",
        key: "F5",
        bubbles: true,
        cancelable: true,
      });
      act(() => field.dispatchEvent(event));
      expect(event.defaultPrevented, `${field.tagName} must keep F5`).toBe(false);
      expect(viewToggle(host).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("builds a contrasting block avatar and shows it only in Third Person", () => {
    const host = mount(<VoxelWorld />);
    const avatar = host.querySelector('[name^="forge-player-avatar"]');
    expect(avatar).not.toBeNull();
    expect([...avatar!.querySelectorAll("mesh")].map((mesh) => mesh.getAttribute("name"))).toEqual([
      "player-torso",
      "player-head",
      "player-hair",
      "player-left-arm",
      "player-right-arm",
      "player-left-leg",
      "player-right-leg",
    ]);
    const colors = [...avatar!.querySelectorAll("meshStandardMaterial")].map((material) =>
      material.getAttribute("color"),
    );
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBeGreaterThanOrEqual(4);
    const partColor = (name: string) =>
      avatar!.querySelector(`[name="${name}"] meshStandardMaterial`)?.getAttribute("color") ?? "";
    expect(
      contrastRatio(partColor("player-torso"), partColor("player-left-leg")),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(partColor("player-head"), partColor("player-hair")),
    ).toBeGreaterThanOrEqual(3);
    expect(avatar?.getAttribute("name")).toBe("forge-player-avatar-hidden");

    enterThirdPerson(host);
    expect(avatar?.getAttribute("name")).toBe("forge-player-avatar");
    act(() => viewToggle(host).click());
    expect(avatar?.getAttribute("name")).toBe("forge-player-avatar-hidden");
  });

  it("places the Third Person camera behind and above the player and aims ahead", () => {
    const host = mount(<VoxelWorld />);
    enterThirdPerson(host);
    act(() => frame?.({}, 0.05));

    expect(camera.position.x).toBeCloseTo(0, 5);
    expect(camera.position.y).toBeGreaterThan(3.2);
    expect(camera.position.z).toBeGreaterThan(9);
    const [aimX, aimY, aimZ] = camera.lookAt.mock.calls.at(-1)!;
    expect(aimX).toBeCloseTo(0, 5);
    expect(aimY).toBeGreaterThan(2.1);
    expect(aimZ).toBeLessThan(6);

    act(() => viewToggle(host).click());
    expect(camera.position.x).toBeCloseTo(0, 5);
    expect(camera.position.y).toBeCloseTo(1.7, 5);
    expect(camera.position.z).toBeCloseTo(6, 5);
  });

  it("walks with the avatar yaw instead of the orbiting camera direction", () => {
    const host = mount(<VoxelWorld />);
    enterThirdPerson(host);
    lockPointer();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" })));
    act(() => frames[0]?.({}, 0.05));
    act(() => frame?.({}, 0.05));
    const before = camera.position.clone();
    camera.getWorldDirection.mockClear();
    camera.getWorldDirection.mockImplementation((direction) => {
      direction.set(1, 0, 0);
      return direction;
    });

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true })));
    act(() => frame?.({}, 0.05));

    expect(camera.getWorldDirection).not.toHaveBeenCalled();
    expect(camera.position.x - before.x).toBeCloseTo(-Math.sin(0.08) * 0.25, 5);
    expect(camera.position.z - before.z).toBeCloseTo(-Math.cos(0.08) * 0.25, 5);
    expect(document.pointerLockElement).toBe(canvas);
  });

  it("keeps block collision and vertical movement in Third Person", () => {
    useForgeStore.getState().place([0, 4], "forge-text");
    camera.position.set(0, 1.7, 5.25);
    const host = mount(<VoxelWorld />);
    enterThirdPerson(host);
    act(() => frame?.({}, 0.05));
    lockPointer();
    const before = camera.position.clone();

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.x).toBeCloseTo(before.x, 5);
    expect(camera.position.y).toBeCloseTo(before.y, 5);
    expect(camera.position.z).toBeCloseTo(before.z, 5);

    useForgeStore.getState().removeNode("block-1");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.y - before.y).toBeCloseTo(0.25, 5);
  });

  it("keeps the upper height limit in Third Person", () => {
    camera.position.y = 15.7;
    const host = mount(<VoxelWorld />);
    enterThirdPerson(host);
    act(() => frame?.({}, 0.05));
    lockPointer();
    const ceiling = camera.position.y;

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })));
    act(() => frame?.({}, 0.05));
    expect(camera.position.y).toBeCloseTo(ceiling, 5);
  });
});
