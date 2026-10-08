import { useStore } from "../stores/useStore";
import { findFileById } from "../city/layout";
import { t } from "../i18n";
import { lineSegmentFor } from "./InfoPanel";

/**
 * Breadcrumb navigation for the semantic zoom — where am I in the repo?
 * With a file building selected, the current file is appended as an active,
 * clickable segment (re-navigating flies the camera to it again). While the
 * triage focuses one of its findings, an additional "L{line}" segment appears;
 * clicking it flies the camera back to the finding's voxel (refocusVoxel).
 */
export function Breadcrumbs() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const setFocusPath = useStore((s) => s.setFocusPath);
  const drillOut = useStore((s) => s.drillOut);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const focusedFindingKey = useStore((s) => s.focusedFindingKey);
  const lang = useStore((s) => s.prefs.lang);
  // Re-flies the camera to the focused finding's voxel (store action).
  const refocusVoxel = useStore((s) => s.refocusVoxel);

  if (!cityData) return null;

  const selectedFile =
    selectedUnit?.kind === "file" ? (findFileById(cityData, selectedUnit.id)?.file ?? null) : null;
  // Line of the triage-focused finding — only shown while the focus belongs
  // to the selected file (lineSegmentFor returns null otherwise), so the
  // segment disappears together with the focus.
  const focusedLine = selectedFile ? lineSegmentFor(focusedFindingKey, selectedFile) : null;

  return (
    <nav aria-label={t(lang, "crumbs.navAria")} className="workspace-breadcrumbs">
      {focusPath.length > 0 && (
        <button
          onClick={drillOut}
          aria-label={t(lang, "crumbs.upAria")}
          className="font-mono text-[11px] px-1.5 py-0.5"
          style={{
            border: "1px solid rgba(165,158,144,0.4)",
            color: "#cfcabe",
            background: "rgba(16,16,14,0.8)",
          }}
          title={t(lang, "crumbs.upAria")}
        >
          ↑
        </button>
      )}
      <button
        onClick={() => setFocusPath([])}
        aria-current={focusPath.length === 0 ? "location" : undefined}
        title={t(lang, "crumbs.rootTip")}
        className="font-mono text-[11px] px-2 py-0.5 transition-colors"
        style={{
          border: `1px solid ${focusPath.length === 0 ? "#f2d5a0" : "rgba(165,158,144,0.35)"}`,
          color: focusPath.length === 0 ? "#f2d5a0" : "var(--meta-strong)",
          fontWeight: focusPath.length === 0 ? 600 : 400,
          background: "rgba(16,16,14,0.8)",
        }}
      >
        {cityData.repo.name}
      </button>
      {focusPath.map((seg, i) => {
        // With a file selected the trailing file segment is the active one
        const isActive = i === focusPath.length - 1 && !selectedFile;
        return (
          <span key={`${seg}-${i}`} className="flex items-center gap-1.5">
            <span
              className="font-mono text-[11px]"
              aria-hidden="true"
              style={{ color: "var(--meta-faint)" }}
            >
              ›
            </span>
            <button
              onClick={() => setFocusPath(focusPath.slice(0, i + 1))}
              // "Current location: src" as a literal was English text in a
              // German run. `aria-current` says the same thing to a screen
              // reader in the user's own language, and the folder name is
              // already the button's visible label.
              aria-current={isActive ? "location" : undefined}
              title={`/${focusPath.slice(0, i + 1).join("/")}`}
              className="font-mono text-[11px] px-2 py-0.5 transition-colors"
              style={{
                border: `1px solid ${isActive ? "#f2d5a0" : "rgba(165,158,144,0.35)"}`,
                color: isActive ? "#f2d5a0" : "var(--meta-strong)",
                fontWeight: isActive ? 600 : 400,
                background: "rgba(16,16,14,0.8)",
              }}
            >
              {seg}
            </button>
          </span>
        );
      })}
      {selectedFile && (
        <span className="flex items-center gap-1.5">
          <span
            className="font-mono text-[11px]"
            aria-hidden="true"
            style={{ color: "var(--meta-faint)" }}
          >
            ›
          </span>
          <button
            onClick={() => navigateToFile(selectedFile.id)}
            aria-current="location"
            aria-label={t(lang, "crumb.fileActive", { name: selectedFile.name })}
            title={t(lang, "crumb.fileTitle")}
            className="font-mono text-[11px] px-2 py-0.5 transition-colors"
            style={{
              border: "1px solid #f2d5a0",
              color: "#f2d5a0",
              fontWeight: 600,
              background: "rgba(16,16,14,0.8)",
            }}
          >
            {selectedFile.name}
          </button>
        </span>
      )}
      {selectedFile && focusedLine !== null && (
        <span className="flex items-center gap-1.5">
          <span
            className="font-mono text-[11px]"
            aria-hidden="true"
            style={{ color: "var(--meta-faint)" }}
          >
            ›
          </span>
          {/* No aria-current here — it stays on the file segment above */}
          <button
            onClick={() => refocusVoxel?.()}
            aria-label={t(lang, "crumb.lineSegment", { line: focusedLine })}
            title={t(lang, "crumb.lineSegment", { line: focusedLine })}
            className="font-mono text-[11px] px-2 py-0.5 transition-colors"
            style={{
              border: "1px solid rgba(232,178,60,0.6)",
              color: "#e8b23c",
              fontWeight: 600,
              background: "rgba(232,178,60,0.08)",
            }}
          >
            L{focusedLine}
          </button>
        </span>
      )}
    </nav>
  );
}
