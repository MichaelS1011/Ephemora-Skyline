/**
 * File-structure parsing — the import/export edges of one source file.
 *
 * Regex-based, V1 has no AST. It reads ESM imports (named, default, side-effect
 * and dynamic), CJS `require` forms, and both ESM/CJS exports. The analyzer
 * draws a file's dependency edges from this; the security facade only ever
 * carried it here because it happened to be pasted there.
 */

/** One import edge: the module specifier plus the names it brings in. */
export interface ImportEdge {
  source: string;
  named: string[];
  isExternal: boolean;
}

/** One export edge: a named export or the module's default. */
export interface ExportEdge {
  type: string;
  name: string;
}

/** The structure of one file: the import/export edges the city draws from. */
export interface FileStructure {
  imports: ImportEdge[];
  exports: ExportEdge[];
}

/** Parse ESM + CJS + dynamic imports and exports from source */
export function scanFileStructure(filePath: string, content: string): FileStructure {
  const imports: Array<{ source: string; named: string[]; isExternal: boolean }> = [];
  const exports: Array<{ type: string; name: string }> = [];
  const seen = new Set<string>();

  const push = (source: string, named: string[]): void => {
    if (seen.has(source)) return;
    seen.add(source);
    imports.push({
      source,
      named,
      isExternal: !source.startsWith(".") && !source.startsWith("/"),
    });
  };

  let match: RegExpExecArray | null;

  // ── ESM: import { x } / import y / import type … from '…' ────────────
  const esmRegex =
    /import\s+(?:type\s+)?(?:(?:\{([^}]+)\})|(?:([\w$]+))|(?:[\w$]+\s+as\s+([\w$]+)))\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = esmRegex.exec(content)) !== null) {
    const named =
      match[1]
        ?.split(",")
        .map((s: string) => s.trim().split(" as ")[0]!.trim())
        .filter(Boolean) ?? [];
    const def = match[2] ?? match[3] ?? "";
    push(match[4]!, def ? [...named, def] : named);
  }

  // ── ESM: import '…' (side-effect) ─────────────────────────────────────
  const esmSideEffect = /import\s+['"]([^'"]+)['"]/g;
  while ((match = esmSideEffect.exec(content)) !== null) {
    push(match[1]!, []);
  }

  // ── CJS: const { a, b } = require('…') / const x = require('…') ───────
  const cjsDestructured =
    /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsDestructured.exec(content)) !== null) {
    const named = match[1]!
      .split(",")
      .map((s: string) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter(Boolean);
    push(match[2]!, named);
  }

  const cjsSimple = /(?:const|let|var)\s+([\w$]+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsSimple.exec(content)) !== null) {
    push(match[2]!, [match[1]!]);
  }

  // ── CJS: bare require('…') — e.g. inside if-guards or middleware chains
  const cjsBare = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsBare.exec(content)) !== null) {
    push(match[1]!, []);
  }

  // ── Dynamic import: import('…') ────────────────────────────────────────
  const dynImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynImport.exec(content)) !== null) {
    push(match[1]!, []);
  }

  // ── ESM exports ────────────────────────────────────────────────────────
  const exportRegex =
    /export\s+(?:default\s+)?(?:function|class|const|let|var|async\s+function)\s+([\w$]+)/g;
  while ((match = exportRegex.exec(content)) !== null) {
    exports.push({ type: "named", name: match[1]! });
  }
  const defaultExportRegex = /export\s+default\s+(?:function|class)\s+([\w$]+)/g;
  while ((match = defaultExportRegex.exec(content)) !== null) {
    exports.push({ type: "default", name: match[1]! });
  }

  // ── CJS exports: module.exports / exports.x ────────────────────────────
  const cjsExportNamed = /exports\s*\.\s*([\w$]+)\s*=/g;
  while ((match = cjsExportNamed.exec(content)) !== null) {
    exports.push({ type: "named", name: match[1]! });
  }
  if (/module\.exports\s*=/.test(content)) {
    exports.push({ type: "default", name: "default" });
  }

  return { imports, exports };
}
