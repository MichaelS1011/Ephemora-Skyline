import { useStore } from "../stores/useStore";

/**
 * Breadcrumb navigation for the semantic zoom — where am I in the repo?
 */
export function Breadcrumbs() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const setFocusPath = useStore((s) => s.setFocusPath);
  const drillOut = useStore((s) => s.drillOut);

  if (!cityData) return null;

  return (
    <div className="absolute top-[52px] left-4 z-20 pointer-events-auto flex items-center gap-1.5 flex-wrap max-w-[55vw]">
      {focusPath.length > 0 && (
        <button
          onClick={drillOut}
          className="font-mono text-[10px] px-1.5 py-0.5"
          style={{
            border: "1px solid rgba(165,158,144,0.4)",
            color: "#cfcabe",
            background: "rgba(16,16,14,0.8)",
          }}
          title="Up one level"
        >
          ↑
        </button>
      )}
      <button
        onClick={() => setFocusPath([])}
        className="font-mono text-[10px] px-2 py-0.5 transition-colors"
        style={{
          border: `1px solid ${focusPath.length === 0 ? "#f2d5a0" : "rgba(165,158,144,0.35)"}`,
          color: focusPath.length === 0 ? "#f2d5a0" : "#cfcabe",
          background: "rgba(16,16,14,0.8)",
        }}
      >
        {cityData.repo.name}
      </button>
      {focusPath.map((seg, i) => {
        const isLast = i === focusPath.length - 1;
        return (
          <span key={`${seg}-${i}`} className="flex items-center gap-1.5">
            <span className="font-mono text-[10px]" style={{ color: "#55688a" }}>
              ›
            </span>
            <button
              onClick={() => setFocusPath(focusPath.slice(0, i + 1))}
              className="font-mono text-[10px] px-2 py-0.5 transition-colors"
              style={{
                border: `1px solid ${isLast ? "#f2d5a0" : "rgba(165,158,144,0.35)"}`,
                color: isLast ? "#f2d5a0" : "#cfcabe",
                background: "rgba(16,16,14,0.8)",
              }}
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}
