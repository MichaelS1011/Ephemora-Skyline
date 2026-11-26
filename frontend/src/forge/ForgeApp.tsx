/** BUILD shell: one graph drives the world, the live test and the export. */
import { useEffect, useMemo, useRef, useState } from "react";
import { FORGE_CATALOG, HOTBAR_IDS, catalogById } from "./catalog";
import { generateProject, writeProject } from "./codegen";
import { useForgeStore, type ForgePhase } from "./store";
import { readiness } from "./validate";
import { VoxelWorld } from "./world/VoxelWorld";
import { ForgeStarter } from "./ui/ForgeStarter";
import { ForgeConnectPanel } from "./ui/ForgeConnectPanel";
import { ForgeTestView } from "./ui/ForgeTestView";
import { ForgeLanguageSwitch } from "./ui/ForgeLanguageSwitch";
import { useStore } from "../stores/useStore";
import { forgeCount, forgeText } from "./i18n";

const PHASES: readonly {
  id: ForgePhase;
  labelKey: "phase.build" | "phase.connect" | "phase.test";
  index: string;
}[] = [
  { id: "build", labelKey: "phase.build", index: "01" },
  { id: "connect", labelKey: "phase.connect", index: "02" },
  { id: "test", labelKey: "phase.test", index: "03" },
];

type ExportStatus = {
  key: "export.download" | "export.directory" | "export.failed";
  vars?: Record<string, string | number>;
};

export function ForgeApp({ onExit }: { onExit: () => void }) {
  const graph = useForgeStore((state) => state.graph);
  const project = useForgeStore((state) => state.project);
  const phase = useForgeStore((state) => state.phase);
  const selectedId = useForgeStore((state) => state.selectedId);
  const select = useForgeStore((state) => state.select);
  const setPhase = useForgeStore((state) => state.setPhase);
  const inventoryOpen = useForgeStore((state) => state.inventoryOpen);
  const setInventoryOpen = useForgeStore((state) => state.setInventoryOpen);
  const setPreviewOpen = useForgeStore((state) => state.setPreviewOpen);
  const notice = useForgeStore((state) => state.notice);
  const clearNotice = useForgeStore((state) => state.clearNotice);
  const reset = useForgeStore((state) => state.reset);
  const undo = useForgeStore((state) => state.undo);
  const redo = useForgeStore((state) => state.redo);
  const past = useForgeStore((state) => state.past);
  const future = useForgeStore((state) => state.future);
  const lang = useStore((state) => state.prefs.lang);
  const [query, setQuery] = useState("");
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const inventoryButtonRef = useRef<HTMLButtonElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const resetConfirmRef = useRef<HTMLButtonElement>(null);
  const restoreStarterFocus = useRef(false);

  const missing = useMemo(() => readiness(graph, lang), [graph, lang]);
  const showStarter = graph.nodes.length === 0 && project.templateId === "new";
  const essentialBlocks = useMemo(
    () => FORGE_CATALOG.filter((entry) => entry.implementation === "native"),
    [],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return FORGE_CATALOG.filter((entry) =>
        `${entry.id} ${entry.name.en} ${entry.name.de} ${entry.description.en} ${entry.description.de} ${entry.renderer} ${entry.source}`
          .toLowerCase()
          .includes(needle),
      );
    }
    return showAllBlocks ? FORGE_CATALOG : essentialBlocks;
  }, [essentialBlocks, query, showAllBlocks]);

  useEffect(() => {
    if (missing.length > 0) {
      setPreviewOpen(false);
      if (phase === "test") setPhase("connect");
    }
  }, [missing.length, phase, setPhase, setPreviewOpen]);

  useEffect(() => {
    if (!inventoryOpen) return;
    document.exitPointerLock?.();
    searchRef.current?.focus();
    return () => inventoryButtonRef.current?.focus();
  }, [inventoryOpen]);

  useEffect(() => {
    if (!resetOpen) return;
    document.exitPointerLock?.();
    resetCancelRef.current?.focus();
    return () => (resetButtonRef.current ?? exitButtonRef.current)?.focus();
  }, [resetOpen]);

  useEffect(() => {
    if (!showStarter || !restoreStarterFocus.current) return;
    restoreStarterFocus.current = false;
    exitButtonRef.current?.focus();
  }, [showStarter]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, 3200);
    return () => window.clearTimeout(timeout);
  }, [clearNotice, notice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.code === "Escape") {
        if (resetOpen) {
          setResetOpen(false);
          return;
        }
        if (showStarter) return;
        setInventoryOpen(false);
        if (phase === "test") setPhase("build");
        document.exitPointerLock?.();
        return;
      }
      if (resetOpen || showStarter || typing || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
      if (event.code === "KeyE") {
        event.preventDefault();
        setInventoryOpen(!useForgeStore.getState().inventoryOpen);
        document.exitPointerLock?.();
        return;
      }
      if (event.code === "KeyP") {
        if (readiness(useForgeStore.getState().graph, lang).length > 0) return;
        event.preventDefault();
        setInventoryOpen(false);
        setPhase(useForgeStore.getState().phase === "test" ? "build" : "test");
        document.exitPointerLock?.();
        return;
      }
      if (event.code.startsWith("Digit")) {
        const digit = event.code === "Digit0" ? 9 : Number(event.code.slice(5)) - 1;
        const id = HOTBAR_IDS[digit];
        if (id) {
          event.preventDefault();
          select(id);
          setPhase("build");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lang, redo, resetOpen, select, setInventoryOpen, setPhase, showStarter, phase, undo]);

  const goToPhase = (next: ForgePhase) => {
    if (next !== "build" && graph.nodes.length === 0) return;
    if (next === "test" && missing.length > 0) return;
    setInventoryOpen(false);
    setPhase(next);
    document.exitPointerLock?.();
  };

  const exportProject = async () => {
    if (graph.nodes.length === 0 || missing.length > 0) return;
    try {
      const files = generateProject(graph, project, lang);
      const result = await writeProject(
        files.map((file) => ({ ...file })),
        undefined,
        lang,
      );
      setExportStatus(
        result.kind === "download"
          ? { key: "export.download", vars: { count: result.fileCount } }
          : { key: "export.directory", vars: { count: result.fileCount } },
      );
    } catch (err) {
      setExportStatus({ key: "export.failed" });
    }
  };

  if (showStarter) {
    return (
      <div className="forge-app" data-testid="forge-app">
        <ForgeStarter />
        <button
          ref={exitButtonRef}
          type="button"
          className="forge-starter-exit"
          onClick={onExit}
          data-testid="forge-exit"
        >
          ← {forgeText(lang, "common.back")}
        </button>
      </div>
    );
  }

  const selectedEntry = catalogById(selectedId);
  const phaseIndex = PHASES.find((item) => item.id === phase)?.index ?? "01";
  const nextActionKey =
    graph.nodes.length === 0
      ? "objective.buildPlace"
      : phase === "build"
        ? missing.length === 0
          ? "objective.buildReady"
          : "objective.buildPlace"
        : phase === "connect"
          ? missing.length > 0
            ? "objective.connectMissing"
            : "objective.connectReady"
          : "objective.test";
  const nextActionVars: Record<string, string | number> | undefined =
    nextActionKey === "objective.buildPlace"
      ? { block: selectedEntry?.name[lang] ?? forgeText(lang, "action.inventory") }
      : nextActionKey === "objective.connectMissing"
        ? { message: missing[0] ?? "" }
        : undefined;
  const metaKey =
    graph.nodes.length === 1 && graph.edges.length === 1
      ? "objective.metaOne"
      : "objective.metaMany";

  return (
    <div className="forge-app" data-testid="forge-app" data-phase={phase}>
      <div className="forge-app-surface" inert={resetOpen ? true : undefined}>
        {phase !== "test" && <VoxelWorld />}
        <header className="forge-topbar">
          <div className="forge-identity">
            <button
              ref={exitButtonRef}
              type="button"
              className="forge-back-button"
              onClick={onExit}
              aria-label={forgeText(lang, "common.back")}
              data-testid="forge-exit"
            >
              ←
            </button>
            <div>
              <span className="forge-brand">◆ EPHEMORA FORGE</span>
              <strong>{project.name || forgeText(lang, "common.unnamed")}</strong>
            </div>
          </div>
          <nav className="forge-phases" aria-label={forgeText(lang, "phase.aria")}>
            {PHASES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={phase === item.id ? "is-active" : ""}
                aria-current={phase === item.id ? "step" : undefined}
                disabled={
                  item.id !== "build" &&
                  (graph.nodes.length === 0 || (item.id === "test" && missing.length > 0))
                }
                onClick={() => goToPhase(item.id)}
                data-testid={`forge-phase-${item.id}`}
              >
                <span>{item.index}</span>
                {forgeText(lang, item.labelKey)}
              </button>
            ))}
          </nav>
          <div className="forge-topbar-actions">
            <ForgeLanguageSwitch />
            {phase !== "test" && (
              <button
                ref={inventoryButtonRef}
                type="button"
                onClick={() => setInventoryOpen(!inventoryOpen)}
                aria-expanded={inventoryOpen}
                data-testid="forge-inventory-toggle"
              >
                {forgeText(lang, "action.inventory")} <kbd>E</kbd>
              </button>
            )}
            <button
              type="button"
              className="forge-play-button"
              onClick={() => goToPhase(phase === "test" ? "build" : "test")}
              disabled={missing.length > 0}
              title={missing.length > 0 ? missing.join(" ") : undefined}
              data-testid="forge-play"
            >
              {phase === "test"
                ? forgeText(lang, "action.closeTest")
                : `▶ ${forgeText(lang, "action.test")}`}
            </button>
          </div>
        </header>

        {phase !== "test" && (
          <>
            <div className="forge-objective" data-testid="forge-objective">
              <span>{forgeText(lang, "phase.count", { current: Number(phaseIndex) })}</span>
              <strong>{forgeText(lang, nextActionKey, nextActionVars)}</strong>
              <small>
                {forgeText(lang, metaKey, {
                  blocks: forgeCount(lang, graph.nodes.length),
                  connections: forgeCount(lang, graph.edges.length),
                })}
              </small>
            </div>

            {missing.length > 0 && phase !== "connect" && (
              <div className="forge-readiness" role="alert" data-testid="forge-readiness">
                <strong>
                  {forgeText(lang, missing.length === 1 ? "readiness.one" : "readiness.many", {
                    count: forgeCount(lang, missing.length),
                  })}
                </strong>
                <span>{missing[0]}</span>
                <button type="button" onClick={() => goToPhase("connect")}>
                  {forgeText(lang, "readiness.connect")}
                </button>
              </div>
            )}

            <div
              className="forge-world-actions"
              role="toolbar"
              aria-label={forgeText(lang, "phase.aria")}
            >
              <button
                type="button"
                onClick={undo}
                disabled={past.length === 0}
                aria-label={forgeText(lang, "action.undo")}
                title={`${forgeText(lang, "action.undo")} · Ctrl/⌘ Z`}
              >
                ↶
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={future.length === 0}
                aria-label={forgeText(lang, "action.redo")}
                title={`${forgeText(lang, "action.redo")} · Ctrl/⌘ Shift Z`}
              >
                ↷
              </button>
            </div>

            {phase === "build" && (
              <div
                className="forge-hotbar"
                role="toolbar"
                aria-label={forgeText(lang, "hotbar.aria")}
              >
                {HOTBAR_IDS.map((id, index) => {
                  const entry = catalogById(id);
                  return (
                    <button
                      type="button"
                      key={id}
                      className={id === selectedId ? "forge-slot is-active" : "forge-slot"}
                      aria-pressed={id === selectedId}
                      onClick={() => select(id)}
                      title={entry?.name[lang] ?? id}
                      data-testid={`forge-slot-${index + 1}`}
                    >
                      <span className="forge-slot-key">{index === 9 ? 0 : index + 1}</span>
                      <span
                        className="forge-slot-dot"
                        style={{ background: entry?.color ?? "#888" }}
                      />
                      <span className="forge-slot-name">{entry?.name[lang] ?? id}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="forge-help">
              {forgeText(lang, phase === "build" ? "controls.build" : "controls.connect")}
            </div>
          </>
        )}

        {exportStatus && (
          <p className="forge-export-status" role="status" data-testid="forge-export-status">
            {forgeText(lang, exportStatus.key, exportStatus.vars)}
          </p>
        )}

        {notice && (
          <div className={`forge-notice forge-notice-${notice.kind}`} role="status">
            {notice.key ? forgeText(lang, notice.key, notice.vars) : notice.issue?.message[lang]}
          </div>
        )}

        {phase === "test" ? (
          <ForgeTestView
            onBack={() => goToPhase("build")}
            onConnect={() => goToPhase("connect")}
            onExport={() => void exportProject()}
          />
        ) : inventoryOpen ? (
          <aside className="forge-panel forge-inventory" data-testid="forge-inventory">
            <div className="forge-panel-head">
              <div>
                <span className="forge-panel-kicker">{forgeText(lang, "inventory.kicker")}</span>
                <h2>{forgeText(lang, "inventory.title")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setInventoryOpen(false)}
                aria-label={forgeText(lang, "common.close")}
              >
                ×
              </button>
            </div>
            <p className="forge-panel-sub">
              {forgeText(lang, "inventory.simple", { count: essentialBlocks.length })}
            </p>
            <input
              ref={searchRef}
              className="forge-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={forgeText(lang, "inventory.search")}
              aria-label={forgeText(lang, "inventory.searchAria")}
            />
            <div className="forge-inventory-modes">
              <button type="button" onClick={() => setShowAllBlocks((value) => !value)}>
                {forgeText(lang, showAllBlocks ? "inventory.essential" : "inventory.all", {
                  count: FORGE_CATALOG.length,
                })}
              </button>
            </div>
            <div className="forge-inventory-list">
              {filtered.length === 0 ? (
                <p className="forge-connect-empty">{forgeText(lang, "inventory.noResults")}</p>
              ) : (
                filtered.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    className={
                      entry.id === selectedId
                        ? "forge-inventory-item is-active"
                        : "forge-inventory-item"
                    }
                    aria-pressed={entry.id === selectedId}
                    onClick={() => {
                      select(entry.id);
                      setInventoryOpen(false);
                      setPhase("build");
                    }}
                  >
                    <span className="forge-slot-dot" style={{ background: entry.color }} />
                    <span className="forge-inventory-name">{entry.name[lang]}</span>
                    <span className="forge-inventory-meta">
                      {entry.implementation === "native"
                        ? forgeText(lang, "inventory.native")
                        : forgeText(lang, "inventory.adapter", { renderer: entry.renderer })}{" "}
                      · {entry.version}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="forge-inventory-foot">
              <button
                ref={resetButtonRef}
                type="button"
                onClick={() => setResetOpen(true)}
                disabled={graph.nodes.length === 0 && graph.edges.length === 0}
                data-testid="forge-reset"
              >
                {forgeText(lang, "inventory.reset")}
              </button>
            </div>
          </aside>
        ) : phase === "connect" ? (
          <ForgeConnectPanel onClose={() => goToPhase("build")} />
        ) : null}
      </div>

      {resetOpen && (
        <div className="forge-reset-overlay">
          <div
            className="forge-reset-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="forge-reset-title"
            aria-describedby="forge-reset-description"
            data-testid="forge-reset-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setResetOpen(false);
              } else if (event.key === "Tab") {
                const first = resetCancelRef.current!;
                const last = resetConfirmRef.current!;
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="forge-reset-title">{forgeText(lang, "reset.title")}</h2>
            <p id="forge-reset-description">{forgeText(lang, "reset.body")}</p>
            <div className="forge-reset-actions">
              <button
                ref={resetCancelRef}
                type="button"
                onClick={() => setResetOpen(false)}
                data-testid="forge-reset-cancel"
              >
                {forgeText(lang, "common.cancel")}
              </button>
              <button
                ref={resetConfirmRef}
                type="button"
                className="forge-reset-confirm"
                onClick={() => {
                  restoreStarterFocus.current = true;
                  reset();
                  setResetOpen(false);
                  setExportStatus(null);
                }}
                data-testid="forge-reset-confirm"
              >
                {forgeText(lang, "reset.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
