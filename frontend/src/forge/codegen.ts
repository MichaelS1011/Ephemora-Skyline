/**
 * Project export. The exported project runs the SAME runtime source as PLAY
 * (imported verbatim with Vite's `?raw`), and carries the same graph JSON.
 * No second generator describes the application; that is the drift this
 * module exists to prevent.
 */
import catalogSource from "./catalog.ts?raw";
import contractsSource from "./contracts.ts?raw";
import validateSource from "./validate.ts?raw";
import runtimeSource from "./runtime.tsx?raw";
import runtimeCssSource from "./runtime.css?raw";
import i18nSource from "./i18n.ts?raw";
import { createZip } from "./zip";
import { DEFAULT_PROJECT, type ForgeGraph, type ForgeProject } from "./contracts";
import { forgeText, type ForgeLang } from "./i18n";

export type ExportedFile = { path: string; content: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function generateProject(
  graph: ForgeGraph,
  project: ForgeProject = DEFAULT_PROJECT,
  lang: ForgeLang = "en",
): ExportedFile[] {
  const graphJson = `${JSON.stringify(graph, null, 2)}\n`;
  const projectJson = `${JSON.stringify(project, null, 2)}\n`;
  return [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: "ephemora-forge-app",
          private: true,
          version: "0.1.0",
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
          dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" },
          devDependencies: {
            "@types/react": "^19.2.0",
            "@types/react-dom": "^19.2.0",
            "@vitejs/plugin-react": "^6.0.0",
            typescript: "^5.9.0",
            vite: "^8.0.0",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "index.html",
      content: `<!doctype html>\n<html lang="${lang}">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${escapeHtml(project.name)} · Ephemora Forge</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()] });\n`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            resolveJsonModule: true,
          },
          include: ["src", "vite.config.ts"],
        },
        null,
        2,
      )}\n`,
    },
    { path: "src/catalog.ts", content: catalogSource },
    { path: "src/contracts.ts", content: contractsSource },
    { path: "src/validate.ts", content: validateSource },
    { path: "src/i18n.ts", content: i18nSource },
    { path: "src/runtime.tsx", content: runtimeSource },
    { path: "src/runtime.css", content: runtimeCssSource },
    { path: "src/graph.json", content: graphJson },
    { path: "src/project.json", content: projectJson },
    {
      path: "src/main.tsx",
      content: `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { ForgeRuntime } from "./runtime";\nimport graphData from "./graph.json";\nimport projectData from "./project.json";\nimport { parseForgeGraph, parseForgeProject } from "./validate";\n\nconst root = document.getElementById("root");\nif (!root) throw new Error("#root missing");\nconst graph = parseForgeGraph(graphData);\nconst project = parseForgeProject(projectData);\ncreateRoot(root).render(\n  <StrictMode>\n    <ForgeRuntime graph={graph} project={project} lang="${lang}" />\n  </StrictMode>,\n);\n`,
    },
    {
      path: "README.md",
      content: `# ${escapeHtml(project.name)}\n\n${forgeText(lang, "export.readmeGenerated")} ${forgeText(lang, "export.readmeRun")}\n\n${forgeText(lang, "export.readmeGraph")} ${forgeText(lang, "export.readmeRuntime")}\n\n${forgeText(lang, "export.readmeLocal")}\n`,
    },
    {
      path: "NOTICE.md",
      content: `# ${forgeText(lang, "export.noticeTitle")}\n\n${forgeText(lang, "export.noticeRuntime")}\n${forgeText(lang, "export.noticeCatalog")}\n${forgeText(lang, "export.noticeThirdParty")}\n`,
    },
  ];
}

export type ProjectWriteResult = {
  kind: "directory" | "download";
  fileCount: number;
  fileName: string;
};

/** File System Access API when available; otherwise one ZIP download with
 * original paths. Both paths are user-triggered, local and never use the network. */
export async function writeProject(
  files: readonly ExportedFile[],
  dir?: string,
  lang: ForgeLang = "en",
): Promise<ProjectWriteResult> {
  type DirectoryHandle = {
    getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandle>;
    getFileHandle: (
      name: string,
      options?: { create?: boolean },
    ) => Promise<{
      createWritable: () => Promise<{
        write: (content: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
    .showDirectoryPicker;
  if (picker && !dir) {
    try {
      const handle = await picker.call(window);
      for (const file of files) {
        const parts = file.path.split("/");
        let current = handle;
        for (const part of parts.slice(0, -1)) {
          current = await current.getDirectoryHandle(part, { create: true });
        }
        const writable = await (
          await current.getFileHandle(parts.at(-1)!, { create: true })
        ).createWritable();
        await writable.write(file.content);
        await writable.close();
      }
      return {
        kind: "directory",
        fileCount: files.length,
        fileName: forgeText(lang, "export.folder"),
      };
    } catch {
      // The picker can exist yet refuse: the reader cancels the folder dialog,
      // or an embedding browser denies File System Access. The reader still
      // expects their project — fall through to the one-ZIP download rather
      // than reporting a failed export with nothing to show for the click.
    }
  }
  const fileName = "ephemora-forge-app.zip";
  const blob = new Blob([createZip(files).buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { kind: "download", fileCount: files.length, fileName };
}
