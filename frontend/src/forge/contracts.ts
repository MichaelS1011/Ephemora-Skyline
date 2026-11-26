/**
 * Forge contract — the single source of truth for BUILD blocks.
 *
 * The 3D world, the preview and the exported project all read this shape.
 * There is deliberately no second "editor model" (no Blockly document): two
 * models would drift, and this codebase already pays enough for claim drift.
 */
export const PORT_KINDS = [
  "data:product",
  "data:text",
  "data:user",
  "data:order",
  "state:store",
  "event:click",
  "event:submit",
  "struct:ui",
] as const;

export type PortKind = (typeof PORT_KINDS)[number];

export type Port = {
  readonly id: string;
  readonly kind: PortKind;
  readonly direction: "in" | "out";
  /** Required inputs make an otherwise valid graph unrunnable. */
  readonly required?: boolean;
};

/**
 * The runtime has one real React adapter per family. A catalog entry names the
 * upstream component it is modelled on; the adapter itself is our own code.
 * This keeps the promise honest: no foreign bundle is fetched or evaluated.
 */
export const RENDERER_FAMILIES = [
  "nav",
  "button",
  "text",
  "gallery",
  "cart",
  "form",
  "user",
  "storage",
  "chart",
  "dialog",
  "table",
  "input",
  "feedback",
  "icon",
  "date",
] as const;

export type RendererFamily = (typeof RENDERER_FAMILIES)[number];

export type CatalogEntry = {
  readonly id: string;
  readonly version: string;
  readonly name: { en: string; de: string };
  readonly description: { en: string; de: string };
  readonly type: string;
  readonly renderer: RendererFamily;
  readonly implementation: "native" | "adapter";
  readonly license: string;
  readonly source: string;
  readonly ports: readonly Port[];
  /** Own voxel palette, no borrowed game assets. */
  readonly color: string;
};

export const FORGE_GRID_STEP = 2;
export const FORGE_BUILD_HALF_EXTENT = 26;
export const FORGE_MAX_LEVEL = 12;

/** A grid cell on the ground; the optional third coordinate is one block higher
 * per level. Two-coordinate graphs remain valid project files. */
export type ForgeCell = readonly [number, number] | readonly [number, number, number];

export function isForgeCell(value: unknown): value is ForgeCell {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) return false;
  if (!value.every((coordinate) => Number.isInteger(coordinate))) return false;
  const [x, z, level = 0] = value;
  return (
    Math.abs(x) <= FORGE_BUILD_HALF_EXTENT &&
    Math.abs(z) <= FORGE_BUILD_HALF_EXTENT &&
    x % FORGE_GRID_STEP === 0 &&
    z % FORGE_GRID_STEP === 0 &&
    level >= 0 &&
    level <= FORGE_MAX_LEVEL
  );
}

export type ForgeNode = {
  readonly id: string;
  readonly catalogId: string;
  readonly cell: ForgeCell;
  readonly label: string;
  readonly color: string;
};

export type ForgeEdge = {
  readonly from: string;
  readonly fromPort: string;
  readonly to: string;
  readonly toPort: string;
};

export type ForgeGraph = {
  readonly nodes: readonly ForgeNode[];
  readonly edges: readonly ForgeEdge[];
};

export type ForgeProjectKind = "website" | "shop" | "app" | "blank";

export type ForgeProject = {
  readonly kind: ForgeProjectKind;
  readonly name: string;
  readonly templateId: string;
};

export const DEFAULT_PROJECT: ForgeProject = {
  kind: "blank",
  name: "Untitled project",
  templateId: "new",
};

export const EMPTY_GRAPH: ForgeGraph = { nodes: [], edges: [] };

export function catalogPort(entry: CatalogEntry, portId: string): Port | undefined {
  return entry.ports.find((p) => p.id === portId);
}

export function nodeEntry(
  entries: readonly CatalogEntry[],
  node: ForgeNode,
): CatalogEntry | undefined {
  return entries.find((e) => e.id === node.catalogId);
}
