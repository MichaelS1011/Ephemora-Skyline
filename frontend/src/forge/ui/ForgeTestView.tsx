import { useMemo } from "react";
import { useForgeStore } from "../store";
import { readiness } from "../validate";
import { ForgeRuntime, projectChecks } from "../runtime";
import { useStore } from "../../stores/useStore";
import { forgeText, type ForgeTextKey } from "../i18n";

const INSTRUCTIONS: Record<"website" | "shop" | "app", readonly ForgeTextKey[]> = {
  website: ["test.website1", "test.website2", "test.website3"],
  shop: ["test.shop1", "test.shop2", "test.shop3"],
  app: ["test.app1", "test.app2", "test.app3"],
};

export function ForgeTestView({
  onBack,
  onConnect,
  onExport,
}: {
  onBack: () => void;
  onConnect: () => void;
  onExport: () => void;
}) {
  const graph = useForgeStore((state) => state.graph);
  const project = useForgeStore((state) => state.project);
  const renameProject = useForgeStore((state) => state.renameProject);
  const lang = useStore((state) => state.prefs.lang);
  const missing = useMemo(() => readiness(graph, lang), [graph, lang]);
  const checks = useMemo(() => projectChecks(graph, project, lang), [graph, project, lang]);
  const instructions =
    INSTRUCTIONS[project.kind === "website" ? "website" : project.kind === "shop" ? "shop" : "app"];

  return (
    <section
      className="forge-test-view"
      data-testid="forge-test-stage"
      aria-labelledby="forge-test-title"
    >
      <aside className="forge-test-sidebar">
        <p className="forge-panel-kicker">{forgeText(lang, "test.kicker")}</p>
        <h2 id="forge-test-title">{forgeText(lang, "test.title")}</h2>
        <label className="forge-field">
          {forgeText(lang, "test.name")}
          <input
            value={project.name}
            maxLength={80}
            onChange={(event) => renameProject(event.target.value)}
            data-testid="forge-project-name"
          />
        </label>
        <div className="forge-test-checks">
          {checks.map((check) => (
            <div key={check.id} data-pass={check.pass}>
              <span aria-hidden="true">{check.pass ? "✓" : "○"}</span>
              {check.label}
            </div>
          ))}
        </div>
        {missing.length > 0 ? (
          <div className="forge-test-blocked" role="alert">
            <strong>{forgeText(lang, "test.blockedTitle")}</strong>
            <ul>
              {missing.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <button type="button" onClick={onConnect}>
              {forgeText(lang, "test.openConnections")}
            </button>
          </div>
        ) : (
          <div className="forge-test-task">
            <h3>{forgeText(lang, "test.task")}</h3>
            <ol>
              {instructions.map((key) => (
                <li key={key}>{forgeText(lang, key)}</li>
              ))}
            </ol>
          </div>
        )}
        <p className="forge-test-local">{forgeText(lang, "test.local")}</p>
        <button
          type="button"
          className="forge-test-export"
          onClick={onExport}
          disabled={missing.length > 0 || graph.nodes.length === 0}
          data-testid="forge-test-export"
        >
          {forgeText(lang, "common.export")} →
        </button>
      </aside>
      <div className="forge-test-canvas" data-testid="forge-preview-panel">
        <div className="forge-test-canvas-head">
          <div>
            <span>{forgeText(lang, "test.preview")}</span>
            <strong>{project.name || forgeText(lang, "common.unnamed")}</strong>
          </div>
          <button type="button" onClick={onBack}>
            {forgeText(lang, "test.back")}
          </button>
        </div>
        <ForgeRuntime graph={graph} project={project} lang={lang} />
      </div>
    </section>
  );
}
