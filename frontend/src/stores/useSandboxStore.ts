import { create } from "zustand";
import type { SandboxScenario } from "../city/refactorSandbox";

/**
 * The active Refactor-Sandbox preview.
 *
 * The panel writes it; a scene component (`GhostTower`) reads it. It holds no
 * city data and no derived React state, so a reset is exactly one null and the
 * original city remains the only source of truth.
 */
interface SandboxStore {
  scenario: SandboxScenario | null;
  setScenario: (scenario: SandboxScenario | null) => void;
  reset: () => void;
}

export const useSandboxStore = create<SandboxStore>((set) => ({
  scenario: null,
  setScenario: (scenario) => set({ scenario }),
  reset: () => set({ scenario: null }),
}));
