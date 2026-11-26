// @vitest-environment jsdom
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { ForgeRuntime } from "../src/forge/runtime";
import { generateProject } from "../src/forge/codegen";
import { useForgeStore } from "../src/forge/store";
import { parseForgeGraph, parseForgeProject } from "../src/forge/validate";
import { templateGraph, templateProject } from "../src/forge/templates";
import { byTestId, click, fill, mount, q, qa, text, unmount } from "./helpers/forgeDom";

function sampleGraph() {
  const forge = useForgeStore.getState();
  forge.reset();
  forge.place([0, 0], "forge-gallery");
  forge.place([2, 0], "forge-cart");
  forge.place([4, 0], "forge-user");
  forge.place([6, 0], "forge-order-form");
  forge.place([8, 0], "forge-storage");
  forge.link({ from: "block-1", fromPort: "products", to: "block-2", toPort: "products" });
  forge.link({ from: "block-2", fromPort: "order", to: "block-4", toPort: "order" });
  forge.link({ from: "block-3", fromPort: "user", to: "block-4", toPort: "user" });
  return useForgeStore.getState().graph;
}

function splitGraph() {
  const forge = useForgeStore.getState();
  forge.reset();
  for (const [index, catalogId] of [
    "forge-gallery",
    "forge-cart",
    "forge-gallery",
    "forge-cart",
    "forge-user",
    "forge-user",
    "forge-order-form",
    "forge-order-form",
    "forge-storage",
  ].entries()) {
    forge.place([index * 2, 0], catalogId);
  }
  const links: readonly (readonly [string, string, string, string])[] = [
    ["block-1", "products", "block-2", "products"],
    ["block-3", "products", "block-4", "products"],
    ["block-2", "order", "block-7", "order"],
    ["block-4", "order", "block-8", "order"],
    ["block-5", "user", "block-7", "user"],
    ["block-6", "user", "block-8", "user"],
  ];
  for (const [from, fromPort, to, toPort] of links) {
    expect(forge.link({ from, fromPort, to, toPort })).toBeNull();
  }
  return useForgeStore.getState().graph;
}

const button = (label: string) =>
  qa("button").find((element) => text(element).includes(label)) ?? null;
const scopedButton = (scope: Element, label: string) =>
  [...scope.querySelectorAll("button")].find((element) => text(element).includes(label)) ?? null;

describe("FORGE runtime and export", () => {
  beforeEach(() => useForgeStore.getState().reset());
  afterEach(unmount);

  it("executes real state: add to cart, then place an order", () => {
    mount(<ForgeRuntime graph={sampleGraph()} lang="de" />);
    expect(byTestId("forge-preview")).toBeDefined();
    expect(text(byTestId("forge-cart-total"))).toBe("0 CHF");

    click(button("Hinzufügen"));
    expect(text(byTestId("forge-cart-total"))).toBe("19 CHF");

    const input = q<HTMLInputElement>('input[placeholder="Bestellung"]');
    expect(input).not.toBeNull();
    fill(input!, "order-1");
    const submit = button("Bestellung senden") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    click(submit);
    expect(text(byTestId("forge-order-count"))).toContain("1");
    expect(text(byTestId("forge-cart-total"))).toBe("0 CHF");
    expect(text(q('[role="status"]'))).toContain("Bestellung lokal gespeichert");
  });

  it("keeps input state separate when one block id prefixes another", () => {
    mount(
      <ForgeRuntime
        graph={{
          nodes: [
            {
              id: "alpha-order",
              catalogId: "shadcn-checkbox",
              cell: [0, 0],
              label: "Input",
              color: "#fff",
            },
            {
              id: "alpha",
              catalogId: "forge-order-form",
              cell: [2, 0],
              label: "Form",
              color: "#fff",
            },
          ],
          edges: [],
        }}
        lang="de"
      />,
    );
    const input = q<HTMLInputElement>("label.forge-runtime-card input")!;
    const order = q<HTMLInputElement>('input[placeholder="Bestellung"]')!;

    fill(order, "form-value");

    expect(order.value).toBe("form-value");
    expect(input.value).toBe("");
  });

  it("fails closed when every required edge is missing", () => {
    mount(<ForgeRuntime graph={{ ...sampleGraph(), edges: [] }} lang="de" />);
    const gallery = q(".forge-runtime-list")!;
    const add = scopedButton(gallery, "Hinzufügen") as HTMLButtonElement;
    const submit = button("Bestellung senden") as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
    click(add);
    expect(text(byTestId("forge-cart-total"))).toBe("0 CHF");
    const form = byTestId("forge-order-form");
    act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(text(byTestId("forge-order-count"))).toContain("0");
    expect(q("[role='alert']")?.textContent).toContain("Warenkorb hat keine Produktquelle");
    expect(q("[role='alert']")?.textContent).toContain("Bestellformular hat keinen Warenkorb");
    expect(q("[role='alert']")?.textContent).toContain(
      "Bestellformular braucht einen Benutzerbaustein",
    );
  });

  it("does not accept an edge merely because it targets the right port", () => {
    const graph = sampleGraph();
    mount(
      <ForgeRuntime
        graph={{
          ...graph,
          edges: graph.edges.map((edge) =>
            edge.to === "block-2"
              ? { from: "block-1", fromPort: "ui", to: "block-2", toPort: "products" }
              : edge,
          ),
        }}
        lang="de"
      />,
    );
    expect(
      (scopedButton(q(".forge-runtime-list")!, "Hinzufügen") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(text(byTestId("forge-cart-total"))).toBe("0 CHF");
  });

  it("keeps two galleries, carts, forms and users isolated by their edges", () => {
    mount(<ForgeRuntime graph={splitGraph()} lang="de" />);
    const galleries = qa(".forge-runtime-list");
    const carts = qa("[data-testid='forge-cart']");
    const forms = qa("[data-testid='forge-order-form']");
    const users = qa<HTMLSelectElement>("[data-testid='forge-user']");

    click(scopedButton(galleries[0]!, "Hinzufügen"));
    expect(text(carts[0]!.querySelector("[data-testid='forge-cart-total']"))).toBe("19 CHF");
    expect(text(carts[1]!.querySelector("[data-testid='forge-cart-total']"))).toBe("0 CHF");
    click(scopedButton(galleries[1]!, "Hinzufügen"));
    expect(text(carts[0]!.querySelector("[data-testid='forge-cart-total']"))).toBe("19 CHF");
    expect(text(carts[1]!.querySelector("[data-testid='forge-cart-total']"))).toBe("19 CHF");

    act(() => {
      users[0]!.value = "Lin";
      users[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(scopedButton(forms[0]!, "Bestellung senden"));
    expect(text(carts[0]!.querySelector("[data-testid='forge-cart-total']"))).toBe("0 CHF");
    expect(text(carts[1]!.querySelector("[data-testid='forge-cart-total']"))).toBe("19 CHF");
    expect(text(byTestId("forge-last-order-user"))).toContain("Lin");

    click(scopedButton(forms[1]!, "Bestellung senden"));
    expect(text(carts[1]!.querySelector("[data-testid='forge-cart-total']"))).toBe("0 CHF");
    expect(text(byTestId("forge-last-order-user"))).toContain("Ada");
    expect(text(byTestId("forge-order-count"))).toContain("2");
  });

  it("turns the website template into a responsive page with a working call-to-action", () => {
    const project = templateProject("website-onepager");
    mount(<ForgeRuntime graph={templateGraph(project.templateId)} project={project} lang="de" />);
    expect(byTestId("forge-preview").getAttribute("data-project-kind")).toBe("website");
    expect(text(q(".forge-runtime-hero"))).toContain("Software, die aus der Nähe besser wird");
    expect(text(q(".forge-runtime-nav"))).toContain("Studio Nord");
    expect(text(q(".forge-runtime-list"))).toContain("Nordlicht");
    expect(text(q(".forge-runtime-list"))).not.toContain("CHF");
    expect(q(".forge-runtime-browser")?.getAttribute("data-device")).toBe("desktop");
    expect(
      qa(".forge-runtime-check").every((check) => check.getAttribute("data-pass") === "true"),
    ).toBe(true);

    click(button("Projekt starten"));
    expect(text(button("Projekt starten"))).toContain("1 Klick");
    click(button("Mobile"));
    expect(q(".forge-runtime-browser")?.getAttribute("data-device")).toBe("mobile");
    expect(button("Mobile")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("runs the dashboard template as an app with real input and action state", () => {
    const project = templateProject("app-dashboard");
    mount(<ForgeRuntime graph={templateGraph(project.templateId)} project={project} lang="de" />);
    expect(byTestId("forge-preview").getAttribute("data-project-kind")).toBe("app");
    expect(q(".forge-runtime-table")).not.toBeNull();
    const input = q<HTMLInputElement>(".forge-runtime-card input")!;
    fill(input, "Skyline Relaunch");
    expect(q(".forge-runtime-card small")?.textContent).toContain("Skyline Relaunch");
    click(button("Neuen Auftrag anlegen"));
    expect(text(button("Neuen Auftrag anlegen"))).toContain("1 Klick");
  });

  it("exports a runnable project with the exact same runtime and graph", () => {
    const graph = sampleGraph();
    const files = generateProject(graph);
    const paths = files.map((file) => file.path);
    expect(paths).toHaveLength(15);
    for (const path of [
      "package.json",
      "index.html",
      "vite.config.ts",
      "tsconfig.json",
      "src/main.tsx",
      "src/contracts.ts",
      "src/i18n.ts",
      "src/validate.ts",
      "src/runtime.tsx",
      "src/runtime.css",
      "src/graph.json",
      "src/project.json",
      "README.md",
      "NOTICE.md",
    ]) {
      expect(paths).toContain(path);
    }
    const pkg = JSON.parse(files.find((file) => file.path === "package.json")!.content);
    expect(pkg.dependencies.react).toContain("19");
    const runtime = files.find((file) => file.path === "src/runtime.tsx")!.content;
    expect(runtime).toContain('data-testid="forge-preview"');
    const exportedGraph = JSON.parse(files.find((file) => file.path === "src/graph.json")!.content);
    expect(exportedGraph).toEqual(graph);
    expect(files.find((file) => file.path === "src/runtime.css")!.content).toContain(
      ".forge-runtime-app.is-app",
    );
    expect(files.find((file) => file.path === "src/runtime.css")!.content).toContain(
      '[data-project-kind="website"]',
    );
    const main = files.find((file) => file.path === "src/main.tsx")!.content;
    expect(runtime).toContain('import "./runtime.css"');
    expect(main).toContain("parseForgeProject(projectData)");
  });

  it("exports the selected language in HTML, runtime, README and NOTICE", () => {
    for (const lang of ["en", "de"] as const) {
      const graph = templateGraph("website-onepager", lang);
      const files = generateProject(graph, templateProject("website-onepager", lang), lang);
      expect(files.find((file) => file.path === "index.html")?.content).toContain(
        `<html lang="${lang}">`,
      );
      expect(files.find((file) => file.path === "src/main.tsx")?.content).toContain(
        `lang="${lang}"`,
      );
      expect(files.find((file) => file.path === "src/i18n.ts")?.content).toContain(
        'export type ForgeLang = "en" | "de"',
      );
      const readme = files.find((file) => file.path === "README.md")!.content;
      expect(readme).toContain(lang === "de" ? "Starte mit" : "Run `npm install");
      const notice = files.find((file) => file.path === "NOTICE.md")!.content;
      expect(notice).toContain(lang === "de" ? "Danksagungen" : "Credits");
    }
  });

  it("exports project metadata and escapes the project name in generated HTML", () => {
    const project = {
      kind: "website" as const,
      name: 'Studio <Nord> & "Süd"',
      templateId: "website-onepager",
    };
    const graph = templateGraph(project.templateId);
    const files = generateProject(graph, project);
    const html = files.find((file) => file.path === "index.html")!.content;
    expect(html).toContain("Studio &lt;Nord&gt; &amp; &quot;Süd&quot;");
    expect(html).not.toContain("<Nord>");
    const exportedProject = JSON.parse(
      files.find((file) => file.path === "src/project.json")!.content,
    );
    expect(parseForgeProject(exportedProject)).toEqual(project);
    expect(JSON.parse(files.find((file) => file.path === "src/graph.json")!.content)).toEqual(
      graph,
    );
  });

  it("validates imported graph JSON at the runtime boundary", () => {
    const graph = sampleGraph();
    const raised = {
      nodes: [{ ...graph.nodes[0], cell: [0, 0, 3] as const }, ...graph.nodes.slice(1)],
      edges: graph.edges,
    };
    expect(parseForgeGraph(JSON.parse(JSON.stringify(raised)))).toEqual(raised);
    expect(() => parseForgeGraph({ nodes: [], edges: [] })).not.toThrow();
    expect(() =>
      parseForgeGraph({
        nodes: [graph.nodes[0], { ...graph.nodes[1], id: "other", cell: [0, 0, 0] }],
        edges: [],
      }),
    ).toThrow("Occupied Forge cell");
    expect(() => parseForgeGraph(null)).toThrow("Forge graph must be an object");
    expect(() => parseForgeGraph({ nodes: graph.nodes })).toThrow("node and edge arrays");
    expect(() =>
      parseForgeGraph({
        ...graph,
        nodes: [{ ...graph.nodes[0], cell: [0, Number.NaN] }],
      }),
    ).toThrow("Invalid Forge node 0");
    expect(() =>
      parseForgeGraph({
        ...graph,
        nodes: [{ ...graph.nodes[0], id: "__proto__" }],
      }),
    ).toThrow("Unsafe Forge node id");
    expect(() =>
      parseForgeGraph({
        ...graph,
        nodes: [graph.nodes[0], { ...graph.nodes[1], id: graph.nodes[0]!.id }],
      }),
    ).toThrow("Duplicate Forge node id");
    expect(() =>
      parseForgeGraph({
        ...graph,
        nodes: [{ ...graph.nodes[0], catalogId: "not-a-catalog-block" }],
      }),
    ).toThrow("Unknown Forge catalog block");
    expect(() =>
      parseForgeGraph({
        ...graph,
        edges: [{ from: "missing-block", fromPort: "products", to: "block-2", toPort: "products" }],
      }),
    ).toThrow("Unknown block");
    expect(() =>
      parseForgeGraph({ ...graph, edges: [{ from: "block-1", to: "block-2" }] }),
    ).toThrow("Invalid Forge edge 0");
  });

  it("validates project metadata at the import boundary", () => {
    expect(parseForgeProject({ kind: "shop", name: "Lokal", templateId: "shop-demo" })).toEqual({
      kind: "shop",
      name: "Lokal",
      templateId: "shop-demo",
    });
    expect(() => parseForgeProject({ kind: "unknown", name: "Lokal", templateId: "x" })).toThrow(
      "Invalid Forge project",
    );
    expect(
      parseForgeProject({ kind: "app", name: "x".repeat(100), templateId: "app-dashboard" }).name,
    ).toHaveLength(80);
  });

  it("type-checks the generated project without weakening its graph contract", () => {
    const dir = mkdtempSync(path.join(process.cwd(), ".forge-export-"));
    try {
      for (const file of generateProject(sampleGraph())) {
        const target = path.join(dir, file.path);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, file.content);
      }
      const configPath = path.join(dir, "tsconfig.json");
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      expect(config.error).toBeUndefined();
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dir);
      const program = ts.createProgram(parsed.fileNames, parsed.options);
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(
        diagnostics.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("executes no dynamic or injected code", () => {
    const runtime = generateProject(sampleGraph()).find(
      (file) => file.path === "src/runtime.tsx",
    )!.content;
    expect(runtime).not.toMatch(/\beval\s*\(/);
    expect(runtime).not.toMatch(/new\s+Function\s*\(/);
    expect(runtime).not.toMatch(/\bimport\s*\(/);
  });
});
