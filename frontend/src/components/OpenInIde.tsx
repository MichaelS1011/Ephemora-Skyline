"use client";

import { useState } from "react";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
import {
  editorDeepLink,
  openDeepLink,
  getWorkspaceRoot,
  setWorkspaceRoot,
  getPreferredEditor,
  setPreferredEditor,
  EDITOR_LABELS,
  type EditorId,
} from "../editor/deepLink";

/**
 * "Open in IDE" — builds the vscode:// / cursor:// deep link for a file
 * (plus optional line) and opens it. First use asks once for the absolute
 * workspace root; the choice persists in localStorage.
 */

/** A usable workspace root must be absolute: "/…" or a drive root like "C:\…". */
const looksAbsolute = (p: string): boolean => {
  const trimmed = p.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed);
};

export function OpenInIde({
  filePath,
  line,
  repoKey,
}: {
  filePath: string;
  line?: number;
  repoKey?: string;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const [root, setRoot] = useState(getWorkspaceRoot(repoKey));
  const [editor, setEditor] = useState<EditorId>(getPreferredEditor());
  const [configured, setConfigured] = useState(getWorkspaceRoot(repoKey) !== "");
  const [draftRoot, setDraftRoot] = useState("");

  // Live validation for the first-run setup: non-empty but not absolute →
  // red border + hint, and SAVE is blocked instead of storing a broken link.
  const invalid = draftRoot.trim().length > 0 && !looksAbsolute(draftRoot);

  const link = editorDeepLink({ editor, workspaceRoot: root || undefined, filePath, line });

  if (!configured) {
    return (
      <div
        className="mb-3 rounded-sm p-2"
        style={{ background: "rgba(232,178,60,0.06)", border: "1px solid rgba(232,178,60,0.25)" }}
      >
        <div
          className="font-jetbrains text-[11px] tracking-widest mb-1.5"
          style={{ color: "#d8c9a3" }}
        >
          {t(lang, "ide.setup")}
        </div>
        <div className="flex gap-1">
          <input
            value={draftRoot}
            onChange={(e) => setDraftRoot(e.target.value)}
            placeholder="/absolute/path/to/repo"
            aria-label={t(lang, "ide.pathAria")}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "workspace-root-hint" : undefined}
            className="flex-1 min-w-0 font-jetbrains text-[11px] px-1.5 py-1 rounded-sm"
            style={{
              background: "rgba(0,0,0,0.4)",
              border: invalid ? "1px solid #ff0044" : "1px solid rgba(150,142,128,0.3)",
              color: "var(--brand-ink)",
              outline: "none",
            }}
          />
          <button
            onClick={() => {
              const trimmed = draftRoot.trim();
              if (!looksAbsolute(trimmed)) return; // invalid input stays on screen with the hint below
              setWorkspaceRoot(trimmed, repoKey);
              setRoot(getWorkspaceRoot(repoKey));
              setConfigured(true);
            }}
            disabled={invalid}
            className="font-jetbrains text-[11px] px-2 py-1 rounded-sm cursor-pointer hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "rgba(232,178,60,0.12)",
              border: "1px solid rgba(232,178,60,0.4)",
              color: "#f2d5a0",
            }}
          >
            {t(lang, "ide.save")}
          </button>
        </div>
        {invalid && (
          <div
            id="workspace-root-hint"
            role="alert"
            className="font-jetbrains text-[11px] mt-1.5"
            style={{ color: "#ff6688" }}
          >
            {t(lang, "ide.invalidHint")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mb-3">
      <button
        onClick={() => link && openDeepLink(link)}
        disabled={!link}
        aria-label={
          line != null
            ? t(lang, "ide.openAriaLine", { path: filePath, editor: EDITOR_LABELS[editor], line })
            : t(lang, "ide.openAria", { path: filePath, editor: EDITOR_LABELS[editor] })
        }
        className="inline-flex items-center gap-1.5 font-jetbrains text-[11px] tracking-wide px-2 py-1 rounded-sm
                   transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer"
        style={{
          color: "#f2d5a0",
          border: "1px solid rgba(232,178,60,0.4)",
          background: "rgba(232,178,60,0.07)",
        }}
      >
        {t(lang, "ide.openIn", { editor: EDITOR_LABELS[editor].toUpperCase() })}
      </button>
      <button
        onClick={() => {
          const next: EditorId = editor === "vscode" ? "cursor" : "vscode";
          setPreferredEditor(next);
          setEditor(next);
        }}
        aria-label={t(lang, "ide.switchAria", {
          editor: EDITOR_LABELS[editor === "vscode" ? "cursor" : "vscode"],
        })}
        className="font-jetbrains text-[11px] px-1.5 py-1 rounded-sm cursor-pointer hover:opacity-80"
        style={{ color: "var(--meta)", border: "1px solid rgba(150,142,128,0.3)" }}
      >
        ⇄
      </button>
    </div>
  );
}
