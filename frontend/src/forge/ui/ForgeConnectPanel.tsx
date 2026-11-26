import { useEffect, useMemo, useState } from "react";
import { catalogById } from "../catalog";
import type { ForgeNode, Port } from "../contracts";
import { useForgeStore } from "../store";
import { checkConnection } from "../validate";
import { useStore } from "../../stores/useStore";
import { forgeCount, forgeText, nodeLabel, portName } from "../i18n";

type PendingPort = { nodeId: string; port: Port };

export function ForgeConnectPanel({ onClose }: { onClose: () => void }) {
  const graph = useForgeStore((state) => state.graph);
  const selectedNodeId = useForgeStore((state) => state.selectedNodeId);
  const selectNode = useForgeStore((state) => state.selectNode);
  const link = useForgeStore((state) => state.link);
  const unlink = useForgeStore((state) => state.unlink);
  const lang = useStore((state) => state.prefs.lang);
  const [pending, setPending] = useState<PendingPort | null>(null);
  const selected = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0];
  const entry = selected ? catalogById(selected.catalogId) : undefined;
  const outputs = entry?.ports.filter((port) => port.direction === "out") ?? [];
  const inputs = entry?.ports.filter((port) => port.direction === "in") ?? [];

  useEffect(() => {
    setPending(null);
  }, [selectedNodeId]);

  const targets = useMemo(() => {
    if (!pending) return [];
    const result: { node: ForgeNode; port: Port }[] = [];
    for (const node of graph.nodes) {
      if (node.id === pending.nodeId) continue;
      const targetEntry = catalogById(node.catalogId);
      for (const port of targetEntry?.ports.filter((candidate) => candidate.direction === "in") ??
        []) {
        if (
          checkConnection(graph, {
            from: pending.nodeId,
            fromPort: pending.port.id,
            to: node.id,
            toPort: port.id,
          }) === null
        ) {
          result.push({ node, port });
        }
      }
    }
    return result;
  }, [graph, pending]);

  const labelFor = (node: ForgeNode) => nodeLabel(node, lang, catalogById(node.catalogId)?.name);

  return (
    <aside className="forge-panel forge-connect-panel" data-testid="forge-connect-panel">
      <div className="forge-panel-head">
        <div>
          <span className="forge-panel-kicker">{forgeText(lang, "connect.kicker")}</span>
          <h2>{forgeText(lang, "connect.title")}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={forgeText(lang, "connect.close")}>
          ×
        </button>
      </div>
      <div className="forge-connect-body">
        <p className="forge-panel-sub">{forgeText(lang, "connect.intro")}</p>
        <label className="forge-field">
          {forgeText(lang, "connect.block")}
          <select
            value={selected?.id ?? ""}
            onChange={(event) => selectNode(event.target.value)}
            data-testid="forge-connect-node"
          >
            {graph.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {labelFor(node)}
              </option>
            ))}
          </select>
        </label>

        {selected && entry ? (
          <>
            <div className="forge-connect-section">
              <h3>{forgeText(lang, "connect.outputs")}</h3>
              {outputs.length === 0 ? (
                <p className="forge-connect-empty">{forgeText(lang, "connect.noOutputs")}</p>
              ) : (
                outputs.map((port) => (
                  <button
                    key={port.id}
                    type="button"
                    className="forge-port-button"
                    aria-pressed={pending?.port.id === port.id}
                    onClick={() => setPending({ nodeId: selected.id, port })}
                    title={port.id}
                    data-testid={`forge-output-${port.id}`}
                  >
                    <span>{portName(lang, port.id)}</span>
                  </button>
                ))
              )}
            </div>

            {pending ? (
              <div className="forge-connect-section" data-testid="forge-connect-targets">
                <h3>
                  {forgeText(lang, "connect.chooseTarget", {
                    port: portName(lang, pending.port.id),
                  })}
                </h3>
                {targets.length === 0 ? (
                  <p className="forge-connect-empty">{forgeText(lang, "connect.noTarget")}</p>
                ) : (
                  targets.map(({ node, port }) => (
                    <button
                      key={`${node.id}:${port.id}`}
                      type="button"
                      className="forge-target-button"
                      onClick={() => {
                        link({
                          from: pending.nodeId,
                          fromPort: pending.port.id,
                          to: node.id,
                          toPort: port.id,
                        });
                        setPending(null);
                      }}
                    >
                      <strong>{labelFor(node)}</strong>
                      <span>
                        {forgeText(lang, "connect.input", { port: portName(lang, port.id) })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="forge-connect-section">
                <h3>{forgeText(lang, "connect.inputs")}</h3>
                {inputs.length === 0 ? (
                  <p className="forge-connect-empty">{forgeText(lang, "connect.noInputs")}</p>
                ) : (
                  inputs.map((port) => {
                    const incoming = graph.edges.find(
                      (edge) => edge.to === selected.id && edge.toPort === port.id,
                    );
                    return (
                      <div key={port.id} className="forge-port-row">
                        <span>{portName(lang, port.id)}</span>
                        {incoming ? (
                          <button type="button" onClick={() => unlink(incoming)}>
                            {forgeText(lang, "connect.disconnect")}
                          </button>
                        ) : (
                          <span>
                            {forgeText(
                              lang,
                              port.required ? "connect.required" : "connect.optional",
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        ) : (
          <p className="forge-connect-empty">{forgeText(lang, "connect.emptyWorld")}</p>
        )}

        <div className="forge-connect-section">
          <h3>
            {forgeText(lang, graph.edges.length === 1 ? "connect.countOne" : "connect.countMany", {
              count: forgeCount(lang, graph.edges.length),
            })}
          </h3>
          {graph.edges.length === 0 ? (
            <p className="forge-connect-empty">{forgeText(lang, "connect.none")}</p>
          ) : (
            graph.edges.map((edge, index) => {
              const from = graph.nodes.find((node) => node.id === edge.from);
              const to = graph.nodes.find((node) => node.id === edge.to);
              return (
                <div
                  className="forge-edge-row"
                  key={`${edge.from}:${edge.fromPort}:${edge.to}:${edge.toPort}`}
                >
                  <span>
                    {from ? labelFor(from) : edge.from} → {to ? labelFor(to) : edge.to}
                  </span>
                  <button
                    type="button"
                    onClick={() => unlink(edge)}
                    aria-label={forgeText(lang, "connect.disconnectAria", { number: index + 1 })}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
