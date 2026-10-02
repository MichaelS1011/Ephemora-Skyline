import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { useStore } from "../src/stores/useStore";
import { deriveLookAngles } from "../src/components/CameraRig";
import type { CityData } from "../src/city/types";

/** Minimal one-building city fixture (same shape as store.test.ts). */
function makeCity(): CityData {
  return {
    id: "cam-city",
    repo: { owner: "test", name: "repo", branch: "main", cloneUrl: "", analyzedAt: "" },
    languages: { TypeScript: 50 },
    totalFiles: 1,
    renderedFiles: 1,
    threatScore: 0,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree: {
      name: "root",
      path: "",
      fileCount: 1,
      linesOfCode: 50,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      children: [],
      detailFiles: [
        {
          id: "file:src/main.ts",
          name: "main.ts",
          path: "src/main.ts",
          language: "TypeScript",
          linesOfCode: 50,
          cyclomaticComplexity: 2,
          threatLevel: "low",
          findings: [],
        },
      ],
      remainingFiles: 0,
      districtFiles: [],
    },
    fileConnections: [],
    dirConnections: [],
    meta: {},
  } as unknown as CityData;
}

describe("camera mode transitions", () => {
  beforeEach(() => {
    useStore.getState().resetToLanding();
    useStore.getState().setCityData(makeCity());
    useStore.getState().setBuildPhase("built");
  });

  it("starts in free mode and focusBuilding switches to orbit", () => {
    const s = useStore.getState();
    expect(s.cameraMode).toBe("free");
    s.focusBuilding("file:src/main.ts");
    const after = useStore.getState();
    expect(after.cameraMode).toBe("orbit");
    expect(after.selectedUnit).toEqual({ kind: "file", id: "file:src/main.ts" });
    // focusBuilding flies the camera (short approach flight)
    expect(after.flyRequest).not.toBeNull();
  });

  it("exitOrbit returns to free without moving the camera", () => {
    const s = useStore.getState();
    s.focusBuilding("file:src/main.ts");
    const before = useStore.getState().flyRequest;
    s.exitOrbit();
    const after = useStore.getState();
    expect(after.cameraMode).toBe("free");
    // no new flight was queued by exitOrbit — it only flips the mode
    expect(after.flyRequest).toBe(before);
  });

  it("navigateToFile keeps the current camera mode", () => {
    const s = useStore.getState();
    s.focusBuilding("file:src/main.ts");
    useStore.getState().navigateToFile("file:src/main.ts");
    expect(useStore.getState().cameraMode).toBe("orbit");
  });

  it("a new city resets to free mode", () => {
    useStore.getState().focusBuilding("file:src/main.ts");
    expect(useStore.getState().cameraMode).toBe("orbit");
    useStore.getState().setCityData(makeCity());
    expect(useStore.getState().cameraMode).toBe("free");
  });

  it("refocusVoxel is a no-op without a focused finding", () => {
    useStore.getState().focusBuilding("file:src/main.ts");
    const before = useStore.getState().flyRequest;
    expect(() => useStore.getState().refocusVoxel()).not.toThrow();
    // no finding focused → no additional flight queued
    expect(useStore.getState().flyRequest).toBe(before);
  });
});

describe("deriveLookAngles", () => {
  it("reads yaw/pitch from a camera quaternion (YXZ)", () => {
    const cam = new THREE.Object3D();
    cam.rotation.order = "YXZ";
    cam.rotation.set(0.2, -1.1, 0);
    cam.updateMatrixWorld(true);
    const { yaw, pitch } = deriveLookAngles(cam.quaternion);
    expect(yaw).toBeCloseTo(-1.1, 6);
    expect(pitch).toBeCloseTo(0.2, 6);
  });

  it("round-trips through an applied rotation without drift", () => {
    const cam = new THREE.Object3D();
    cam.rotation.order = "YXZ";
    cam.rotation.set(-0.5, 2.4, 0);
    cam.updateMatrixWorld(true);
    const { yaw, pitch } = deriveLookAngles(cam.quaternion);
    const e = new THREE.Euler(0, 0, 0, "YXZ");
    e.set(pitch, yaw, 0);
    expect(e.y).toBeCloseTo(yaw, 6);
    expect(e.x).toBeCloseTo(pitch, 6);
  });
});
