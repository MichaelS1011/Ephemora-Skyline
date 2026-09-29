/**
 * IDE deep-linking — one click on a building opens the file at the exact
 * line in VS Code / Cursor via the `vscode://file/` and `cursor://file/`
 * URL schemes. Both require an ABSOLUTE path, so the user registers their
 * workspace root once; it persists in localStorage.
 */

export type EditorId = "vscode" | "cursor";

const ROOT_KEY = "codecity.workspaceRoot";
const EDITOR_KEY = "codecity.editor";

export function getWorkspaceRoot(repoKey?: string): string {
  if (typeof window === "undefined") return "";
  if (repoKey) {
    return window.localStorage.getItem(`${ROOT_KEY}:${repoKey}`) ?? "";
  }
  return window.localStorage.getItem(ROOT_KEY) ?? "";
}

export function setWorkspaceRoot(root: string, repoKey?: string): void {
  if (typeof window === "undefined") return;
  // Normalize: forward slashes, no trailing slash — the URL scheme hates both
  const clean = root.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const key = repoKey ? `${ROOT_KEY}:${repoKey}` : ROOT_KEY;
  window.localStorage.setItem(key, clean);
}

export function getPreferredEditor(): EditorId {
  if (typeof window === "undefined") return "vscode";
  return (window.localStorage.getItem(EDITOR_KEY) as EditorId) ?? "vscode";
}

export function setPreferredEditor(editor: EditorId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EDITOR_KEY, editor);
}

/**
 * Build the deep link. Returns null when no workspace root is configured
 * (the UI then offers the setup instead of opening a broken link).
 */
export function editorDeepLink(opts: {
  editor?: EditorId;
  workspaceRoot?: string;
  filePath: string;
  line?: number;
  column?: number;
}): string | null {
  const editor = opts.editor ?? getPreferredEditor();
  const root = opts.workspaceRoot ?? getWorkspaceRoot();
  if (!root) return null;
  const rel = opts.filePath.replace(/^\/+/, "");
  const absolute = root.endsWith("/") || root === "" ? `${root}${rel}` : `${root}/${rel}`;
  const scheme = editor === "cursor" ? "cursor://file" : "vscode://file";
  const pos =
    opts.line !== undefined && opts.line > 0
      ? `:${opts.line}${opts.column ? `:${opts.column}` : ""}`
      : "";
  return `${scheme}/${absolute}${pos}`;
}

/** Open the link without losing the 3D canvas context (same tab, new focus). */
export function openDeepLink(link: string): void {
  if (typeof window === "undefined") return;
  window.open(link, "_self");
}

/** Editor display names for the settings UI. */
export const EDITOR_LABELS: Record<EditorId, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
};
