/** Forge UI state. A build session never changes the scanned-city state. */
import { create } from "zustand";
import { catalogById, HOTBAR_IDS } from "./catalog";
import {
  DEFAULT_PROJECT,
  EMPTY_GRAPH,
  isForgeCell,
  type ForgeCell,
  type ForgeEdge,
  type ForgeGraph,
  type ForgeProject,
} from "./contracts";
import { templateGraph, templateProject } from "./templates";
import { connect, parseForgeGraph, parseForgeProject, type Issue } from "./validate";
import type { ForgeLang, ForgeTextKey } from "./i18n";

export type ForgeMode = "select" | "build" | "explore";
export type ForgePhase = "build" | "connect" | "test";
export type ForgeNotice = {
  kind: "info" | "error";
  key?: ForgeTextKey;
  vars?: Record<string, string | number>;
  issue?: Issue;
} | null;

type ForgeState = {
  mode: ForgeMode;
  phase: ForgePhase;
  project: ForgeProject;
  graph: ForgeGraph;
  selectedId: string;
  selectedNodeId: string | null;
  inventoryOpen: boolean;
  previewOpen: boolean;
  notice: ForgeNotice;
  nextBlock: number;
  past: readonly ForgeGraph[];
  future: readonly ForgeGraph[];
  setMode: (mode: ForgeMode) => void;
  setPhase: (phase: ForgePhase) => void;
  renameProject: (name: string) => void;
  loadTemplate: (templateId: string, lang?: ForgeLang) => void;
  startBlank: (lang?: ForgeLang) => void;
  select: (catalogId: string) => void;
  selectOffset: (offset: number) => void;
  selectNode: (nodeId: string | null) => void;
  setInventoryOpen: (open: boolean) => void;
  setPreviewOpen: (open: boolean) => void;
  clearNotice: () => void;
  place: (cell: ForgeCell, catalogId?: string) => boolean;
  remove: (cell: ForgeCell) => boolean;
  removeNode: (nodeId: string) => void;
  link: (edge: ForgeEdge) => Issue | null;
  unlink: (edge: ForgeEdge) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

const STORAGE_KEY = "ephemora-forge-project-v1";

function sameCell(a: ForgeCell, b: ForgeCell): boolean {
  return a[0] === b[0] && a[1] === b[1] && (a[2] ?? 0) === (b[2] ?? 0);
}

function nextBlockNumber(graph: ForgeGraph): number {
  return graph.nodes.reduce((largest, node) => {
    const match = /^block-(\d+)$/.exec(node.id);
    return match ? Math.max(largest, Number(match[1]) + 1) : largest;
  }, 1);
}

function readSaved(): { graph: ForgeGraph; project: ForgeProject; nextBlock: number } {
  try {
    if (typeof localStorage === "undefined") throw new Error("unavailable");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const saved = JSON.parse(raw) as { graph?: unknown; project?: Partial<ForgeProject> };
    const graph = parseForgeGraph(saved.graph);
    const project = saved.project ? parseForgeProject(saved.project) : DEFAULT_PROJECT;
    return { graph, project, nextBlock: nextBlockNumber(graph) };
  } catch {
    return { graph: EMPTY_GRAPH, project: DEFAULT_PROJECT, nextBlock: 1 };
  }
}

const saved = readSaved();

export const useForgeStore = create<ForgeState>((set, get) => {
  const commit = (graph: ForgeGraph, extra: Partial<ForgeState> = {}) => {
    set((state) => ({
      graph,
      past: [...state.past.slice(-49), state.graph],
      future: [],
      ...extra,
    }));
  };

  return {
    mode: "select",
    phase: "build",
    project: saved.project,
    graph: saved.graph,
    selectedId: HOTBAR_IDS[0] ?? "forge-gallery",
    selectedNodeId: null,
    inventoryOpen: false,
    previewOpen: false,
    notice: null,
    nextBlock: saved.nextBlock,
    past: [],
    future: [],
    setMode: (mode) => set({ mode }),
    setPhase: (phase) =>
      set({
        phase,
        previewOpen: phase === "test",
        inventoryOpen: false,
        selectedNodeId: phase === "connect" ? get().selectedNodeId : null,
        notice: null,
      }),
    renameProject: (name) => set({ project: { ...get().project, name: name.slice(0, 80) } }),
    loadTemplate: (templateId, lang = "en") => {
      const graph = templateGraph(templateId, lang);
      set({
        project: templateProject(templateId, lang),
        graph,
        phase: "build",
        selectedNodeId: null,
        inventoryOpen: false,
        previewOpen: false,
        notice: { kind: "info", key: "notice.templateLoaded" },
        nextBlock: nextBlockNumber(graph),
        past: [],
        future: [],
      });
    },
    startBlank: (lang = "en") =>
      set({
        project: {
          kind: "blank",
          name: lang === "de" ? "Mein Software-Projekt" : "Untitled project",
          templateId: "blank",
        },
        graph: EMPTY_GRAPH,
        phase: "build",
        selectedNodeId: null,
        inventoryOpen: false,
        previewOpen: false,
        notice: null,
        nextBlock: 1,
        past: [],
        future: [],
      }),
    select: (catalogId) => {
      if (!catalogById(catalogId)) return;
      set({ selectedId: catalogId, notice: null });
    },
    selectOffset: (offset) => {
      const ids = HOTBAR_IDS;
      const current = Math.max(0, ids.indexOf(get().selectedId));
      set({ selectedId: ids[(current + offset + ids.length) % ids.length] ?? ids[0]! });
    },
    selectNode: (selectedNodeId) => set({ selectedNodeId }),
    setInventoryOpen: (inventoryOpen) => set({ inventoryOpen }),
    setPreviewOpen: (previewOpen) => set({ previewOpen }),
    clearNotice: () => set({ notice: null }),
    place: (cell, catalogId) => {
      if (!isForgeCell(cell)) {
        set({ notice: { kind: "error", key: "notice.invalidCell" } });
        return false;
      }
      const id = catalogId ?? get().selectedId;
      const entry = catalogById(id);
      if (!entry) return false;
      if (get().graph.nodes.some((node) => sameCell(node.cell, cell))) {
        set({ notice: { kind: "error", key: "notice.occupied" } });
        return false;
      }
      const next = get().nextBlock;
      commit(
        {
          ...get().graph,
          nodes: [
            ...get().graph.nodes,
            {
              id: `block-${next}`,
              catalogId: id,
              cell: [...cell],
              label: entry.name.en,
              color: entry.color,
            },
          ],
        },
        {
          nextBlock: next + 1,
          phase: "build",
          notice: { kind: "info", key: "notice.placed" },
        },
      );
      return true;
    },
    remove: (cell) => {
      const removed = new Set(
        get()
          .graph.nodes.filter((node) => sameCell(node.cell, cell))
          .map((node) => node.id),
      );
      if (removed.size === 0) {
        set({ notice: { kind: "info", key: "notice.empty" } });
        return false;
      }
      commit(
        {
          nodes: get().graph.nodes.filter((node) => !removed.has(node.id)),
          edges: get().graph.edges.filter(
            (edge) => !removed.has(edge.from) && !removed.has(edge.to),
          ),
        },
        { notice: { kind: "info", key: "notice.removed" } },
      );
      return true;
    },
    removeNode: (nodeId) => {
      if (!get().graph.nodes.some((node) => node.id === nodeId)) return;
      commit(
        {
          nodes: get().graph.nodes.filter((node) => node.id !== nodeId),
          edges: get().graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
        },
        { selectedNodeId: null, notice: { kind: "info", key: "notice.removed" } },
      );
    },
    link: (edge) => {
      const result = connect(get().graph, edge);
      if (result.issue) {
        set({ notice: { kind: "error", issue: result.issue } });
      } else {
        commit(result.graph, { notice: { kind: "info", key: "notice.connected" } });
      }
      return result.issue;
    },
    unlink: (edge) => {
      if (
        !get().graph.edges.some((candidate) => JSON.stringify(candidate) === JSON.stringify(edge))
      ) {
        return;
      }
      commit(
        {
          ...get().graph,
          edges: get().graph.edges.filter(
            (candidate) => JSON.stringify(candidate) !== JSON.stringify(edge),
          ),
        },
        { notice: { kind: "info", key: "notice.disconnected" } },
      );
    },
    undo: () => {
      const previous = get().past.at(-1);
      if (!previous) return;
      set((state) => ({
        graph: previous,
        past: state.past.slice(0, -1),
        future: [state.graph, ...state.future].slice(0, 50),
        notice: { kind: "info", key: "notice.undone" },
      }));
    },
    redo: () => {
      const next = get().future[0];
      if (!next) return;
      set((state) => ({
        graph: next,
        past: [...state.past, state.graph].slice(-50),
        future: state.future.slice(1),
        notice: { kind: "info", key: "notice.redone" },
      }));
    },
    reset: () => {
      if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
      set({
        project: DEFAULT_PROJECT,
        graph: EMPTY_GRAPH,
        phase: "build",
        selectedNodeId: null,
        inventoryOpen: false,
        previewOpen: false,
        notice: null,
        nextBlock: 1,
        past: [],
        future: [],
      });
    },
  };
});

if (typeof window !== "undefined") {
  useForgeStore.subscribe((state, previous) => {
    if (state.graph === previous.graph && state.project === previous.project) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ graph: state.graph, project: state.project }),
      );
    } catch {
      // A full or disabled storage must not prevent local building.
    }
  });
}
