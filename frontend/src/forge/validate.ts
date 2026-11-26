/**
 * Port validation. This is the only place that decides whether two blocks
 * connect; the 3D world and the exported project both call it, so a connection
 * that looks valid in the world cannot become invalid on export.
 */
import { FORGE_CATALOG, catalogById } from "./catalog";
import {
  catalogPort,
  isForgeCell,
  type ForgeEdge,
  type ForgeGraph,
  type ForgeNode,
  type ForgeProject,
  type Port,
} from "./contracts";

export type Issue = {
  readonly code:
    "unknown-block" | "unknown-port" | "direction" | "kind" | "occupied-input" | "self";
  readonly message: { en: string; de: string };
};

const M = {
  unknownBlock: { en: "Unknown block.", de: "Unbekannter Baustein." },
  unknownPort: {
    en: "Unknown port on this block.",
    de: "Unbekannter Anschluss an diesem Baustein.",
  },
  direction: {
    en: "An output can only connect to an input.",
    de: "Ein Ausgang kann nur mit einem Eingang verbunden werden.",
  },
  kind: {
    en: "These ports do not match. Check the required data type.",
    de: "Diese Anschlüsse passen nicht zusammen. Prüfe den geforderten Datentyp.",
  },
  occupied: {
    en: "This input already has a connection. Remove it first.",
    de: "Dieser Eingang ist bereits belegt. Entferne zuerst die alte Verbindung.",
  },
  self: {
    en: "A block cannot connect to itself.",
    de: "Ein Baustein kann sich nicht selbst verbinden.",
  },
} as const;

export function portOf(entryId: string, portId: string): Port | undefined {
  const entry = FORGE_CATALOG.find((candidate) => candidate.id === entryId);
  return entry ? catalogPort(entry, portId) : undefined;
}

export function checkConnection(graph: ForgeGraph, edge: ForgeEdge): Issue | null {
  const from = graph.nodes.find((n) => n.id === edge.from);
  const to = graph.nodes.find((n) => n.id === edge.to);
  if (!from || !to) return { code: "unknown-block", message: M.unknownBlock };
  if (from.id === to.id) return { code: "self", message: M.self };
  const out = portOf(from.catalogId, edge.fromPort);
  const input = portOf(to.catalogId, edge.toPort);
  if (!out || !input) return { code: "unknown-port", message: M.unknownPort };
  if (out.direction !== "out" || input.direction !== "in") {
    return { code: "direction", message: M.direction };
  }
  if (out.kind !== input.kind) {
    return {
      code: "kind",
      message: {
        en: `This port needs ${input.kind}, but this one delivers ${out.kind}.`,
        de: `Dieser Anschluss braucht ${input.kind}, der gewählte liefert aber ${out.kind}.`,
      },
    };
  }
  const occupied = graph.edges.some(
    (existing) => existing.to === edge.to && existing.toPort === edge.toPort,
  );
  if (occupied) return { code: "occupied-input", message: M.occupied };
  return null;
}

/** Adds an edge only if the graph stays valid. Never mutates its argument. */
export function connect(
  graph: ForgeGraph,
  edge: ForgeEdge,
): { graph: ForgeGraph; issue: Issue | null } {
  const issue = checkConnection(graph, edge);
  if (issue) return { graph, issue };
  return { graph: { ...graph, edges: [...graph.edges, edge] }, issue: null };
}

/**
 * Resolve one input through its actual incoming edge and catalog ports. A
 * destination port alone is not a binding: the source must exist, expose the
 * matching output kind and own the only edge into this input. Ambiguous or
 * malformed imported graphs therefore fail closed in both PLAY and export.
 */
export function inputSource(
  graph: ForgeGraph,
  targetId: string,
  inputId: string,
): ForgeNode | undefined {
  const target = graph.nodes.find((node) => node.id === targetId);
  const targetEntry = target && catalogById(target.catalogId);
  const input = targetEntry && catalogPort(targetEntry, inputId);
  if (!target || !input || input.direction !== "in") return undefined;
  const incoming = graph.edges.filter((edge) => edge.to === target.id && edge.toPort === inputId);
  if (incoming.length !== 1) return undefined;
  const source = graph.nodes.find((node) => node.id === incoming[0]!.from);
  const sourceEntry = source && catalogById(source.catalogId);
  const output = sourceEntry && catalogPort(sourceEntry, incoming[0]!.fromPort);
  if (!source || !output || output.direction !== "out" || output.kind !== input.kind) {
    return undefined;
  }
  return source;
}

export function parseForgeProject(value: unknown): ForgeProject {
  if (!value || typeof value !== "object") throw new Error("Forge project must be an object");
  const candidate = value as Record<string, unknown>;
  if (
    !["website", "shop", "app", "blank"].includes(String(candidate.kind)) ||
    typeof candidate.name !== "string" ||
    typeof candidate.templateId !== "string"
  ) {
    throw new Error("Invalid Forge project");
  }
  return {
    kind: candidate.kind as ForgeProject["kind"],
    name: candidate.name.slice(0, 80),
    templateId: candidate.templateId.slice(0, 80),
  };
}

export function parseForgeGraph(value: unknown): ForgeGraph {
  if (!value || typeof value !== "object") throw new Error("Forge graph must be an object");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new Error("Forge graph must contain node and edge arrays");
  }
  const ids = new Set<string>();
  const nodes = raw.nodes.map((node, index): ForgeNode => {
    if (!node || typeof node !== "object") throw new Error(`Invalid Forge node ${index}`);
    const candidate = node as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.catalogId !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.color !== "string"
    ) {
      throw new Error(`Invalid Forge node ${index}`);
    }
    if (!isForgeCell(candidate.cell)) {
      throw new Error(`Invalid Forge node ${index}: Invalid Forge cell`);
    }
    if (!candidate.id || candidate.id in Object.prototype) {
      throw new Error(`Unsafe Forge node id at index ${index}`);
    }
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate Forge node id at index ${index}`);
    }
    if (!catalogById(candidate.catalogId)) {
      throw new Error(`Unknown Forge catalog block at index ${index}`);
    }
    ids.add(candidate.id);
    return {
      id: candidate.id,
      catalogId: candidate.catalogId,
      cell:
        candidate.cell.length === 3
          ? [candidate.cell[0] as number, candidate.cell[1] as number, candidate.cell[2] as number]
          : [candidate.cell[0] as number, candidate.cell[1] as number],
      label: candidate.label,
      color: candidate.color,
    };
  });
  const cells = new Set<string>();
  for (const node of nodes) {
    const key = `${node.cell[0]}:${node.cell[1]}:${node.cell[2] ?? 0}`;
    if (cells.has(key)) throw new Error(`Occupied Forge cell for node ${node.id}`);
    cells.add(key);
  }
  const edges: ForgeEdge[] = [];
  raw.edges.forEach((edge, index) => {
    if (!edge || typeof edge !== "object") throw new Error(`Invalid Forge edge ${index}`);
    const candidate = edge as Record<string, unknown>;
    if (
      typeof candidate.from !== "string" ||
      typeof candidate.fromPort !== "string" ||
      typeof candidate.to !== "string" ||
      typeof candidate.toPort !== "string"
    ) {
      throw new Error(`Invalid Forge edge ${index}`);
    }
    const parsed: ForgeEdge = {
      from: candidate.from,
      fromPort: candidate.fromPort,
      to: candidate.to,
      toPort: candidate.toPort,
    };
    const issue = checkConnection({ nodes, edges }, parsed);
    if (issue) throw new Error(`Invalid Forge edge ${index}: ${issue.message.en}`);
    edges.push(parsed);
  });
  return { nodes, edges };
}

/**
 * Readiness is deliberately stricter than validity: every required catalog
 * input needs a real source of the declared renderer and port kind. The BUILD
 * shell and the exported runtime share this result, so neither can pretend an
 * unconnected graph runs.
 */
export function readiness(graph: ForgeGraph, lang: "en" | "de"): string[] {
  const missing: { en: string; de: string }[] = [];
  for (const node of graph.nodes) {
    const entry = catalogById(node.catalogId);
    if (!entry) continue;
    for (const port of entry.ports.filter((candidate) => candidate.required)) {
      const source = inputSource(graph, node.id, port.id);
      const expectedRenderer =
        entry.renderer === "form" && port.id === "order"
          ? "cart"
          : entry.renderer === "form" && port.id === "user"
            ? "user"
            : undefined;
      if (
        source &&
        (!expectedRenderer || catalogById(source.catalogId)?.renderer === expectedRenderer)
      ) {
        continue;
      }
      if (entry.renderer === "cart" && port.id === "products") {
        missing.push({
          en: "Cart has no product source. Connect a gallery or an import.",
          de: "Der Warenkorb hat keine Produktquelle. Verbinde eine Galerie oder einen Import.",
        });
      } else if (entry.renderer === "form" && port.id === "order") {
        missing.push({
          en: "Order form has no cart. Connect its order input.",
          de: "Das Bestellformular hat keinen Warenkorb. Verbinde seinen Bestelleingang.",
        });
      } else if (entry.renderer === "form" && port.id === "user") {
        missing.push({
          en: "Order form needs a user block.",
          de: "Das Bestellformular braucht einen Benutzerbaustein.",
        });
      } else {
        missing.push({
          en: `${entry.name.en} is missing its required ${port.kind} input "${port.id}".`,
          de: `${entry.name.de} fehlt der erforderliche Eingang "${port.id}" (${port.kind}).`,
        });
      }
    }
  }
  return missing.map((message) => message[lang]);
}
