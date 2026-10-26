import { useStore } from "../stores/useStore";
import { findFileById } from "../city/layout";
import { formatCount, formatDecimal, t, type DictKey, type Lang } from "../i18n";
import type { CityFile, Severity } from "../city/types";

/**
 * The X-ray state: press and hold X and the raw numbers that shaped the tower
 * you are looking at stand on one plate — lines, branches, imports, findings
 * by grade, churn, coverage. No detour into a panel first.
 *
 * Three promises, each with a guard in `tests/xray-raw.test.tsx`:
 *
 * 1. ONE ORIGIN. The numbers are read from the same `CityFile` the dossier
 *    opens (the same `findFileById` lookup, the same fields, the same
 *    `formatCount`/`formatDecimal` steps), so the plate and the panel can
 *    never tell two stories about one building.
 * 2. NOT-DELIVERED IS NOT ZERO. A field the payload does not carry has no row
 *    here — the project distinguishes "not delivered" from a measured `0`,
 *    and an invented zero would erase that. A delivered `0` (importCount 0 =
 *    the reader looked and found nothing) still prints.
 * 3. IT ONLY EXISTS WHILE THE KEY IS HELD. HudOverlay mounts this component
 *    on keydown and removes it on keyup; at rest, and therefore at arrival,
 *    it renders nothing — the four standing surfaces of the arrival budget
 *    are untouched.
 *
 * Motion: none. The plate appears and goes with the key, no transition —
 * which is trivially `prefers-reduced-motion`-safe and needs no switch.
 */

/** The grades the plate prints, worst first — the order the city teaches. */
export const XRAY_GRADES: ReadonlyArray<{ id: Severity; labelKey: DictKey }> = [
  { id: "P0", labelKey: "hud.sevCritical" },
  { id: "P1", labelKey: "hud.sevHigh" },
  { id: "P2", labelKey: "hud.sevMedium" },
];

export interface XrayRow {
  labelKey: DictKey;
  /** The formatted number, or null when the payload does not carry the field. */
  value: string | null;
  /** Stable hook for the guard: which CityFile field the row reads. */
  field:
    | "linesOfCode"
    | "cyclomaticComplexity"
    | "importCount"
    | "findings"
    | "churnScore"
    | "coveragePct";
}

/** A delivered number is a number; anything else is "the payload stayed silent". */
const delivered = (v: number | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * The rows, derived from the payload alone. `value === null` means the field
 * was not delivered — the caller then shows neither a number nor a dash, just
 * no row at all, so nothing here can read as a measured zero.
 */
export function xrayFacts(file: CityFile, lang: Lang): XrayRow[] {
  const lines = delivered(file.linesOfCode);
  const branches = delivered(file.cyclomaticComplexity);
  const imports = delivered(file.importCount);
  const churn = delivered(file.churnScore);
  const coverage = delivered(file.coveragePct);
  // Findings by grade: counted from the list the file itself carries — the
  // same list the dossier's finding rows print, never a second census.
  const findings = Array.isArray(file.findings)
    ? XRAY_GRADES.map(({ id, labelKey }) => {
        const n = file.findings.filter((f) => f.severity === id).length;
        return n > 0 ? `${formatCount(lang, n)} ${t(lang, labelKey)}` : null;
      })
        .filter((s): s is string => s !== null)
        .join(" · ") || formatCount(lang, 0)
    : null;
  return [
    {
      field: "linesOfCode",
      labelKey: "xray.lines",
      value: lines === null ? null : formatCount(lang, lines),
    },
    {
      field: "cyclomaticComplexity",
      labelKey: "xray.branches",
      value: branches === null ? null : formatCount(lang, branches),
    },
    {
      field: "importCount",
      labelKey: "xray.imports",
      value: imports === null ? null : formatCount(lang, imports),
    },
    { field: "findings", labelKey: "xray.findings", value: findings },
    {
      field: "churnScore",
      labelKey: "xray.churn",
      value: churn === null ? null : formatDecimal(lang, churn, 2),
    },
    {
      field: "coveragePct",
      labelKey: "xray.coverage",
      value:
        coverage === null
          ? null
          : t(lang, "xray.coverageValue", { pct: formatCount(lang, coverage) }),
    },
  ];
}

/** The separator between label and number is a dot the eye can skip; the
 *  words carry the meaning, colour never carries alone (words > chips). */
export function XrayRaw() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const hoveredId = useStore((s) => s.hoveredId);
  const selectedUnit = useStore((s) => s.selectedUnit);
  if (!cityData) return null;
  // "the tower you aim at": the pointer's hover first, the keyboard's own
  // selection second — the bracket pair has no pointer to park anywhere.
  // A marked district (`block:`) is not a building; X is a tower instrument.
  const fileId =
    hoveredId && !hoveredId.startsWith("block:")
      ? hoveredId
      : selectedUnit?.kind === "file"
        ? selectedUnit.id
        : null;
  const hit = fileId ? findFileById(cityData, fileId) : null;
  if (!hit) {
    // The press is never mute: it says what it needs to act on.
    const hint = t(lang, "xray.holdHint");
    return (
      <div
        className="xray-raw absolute bottom-20 left-1/2 z-40 -translate-x-1/2 max-w-[calc(100vw-24px)]
                   flex items-center gap-1.5 rounded-md px-3 py-1.5 font-jetbrains text-[length:var(--fs-meta)]
                   pointer-events-none"
        style={{
          background: "var(--material-read-bg)",
          border: "1px solid var(--glass-chrome-border)",
        }}
        role="group"
        aria-label={t(lang, "xray.aria", { name: "", values: hint })}
        data-xray-state="no-target"
      >
        <span style={{ color: "var(--meta-strong)" }}>{hint}</span>
      </div>
    );
  }
  const file = hit.file;
  const rows = xrayFacts(file, lang).filter((r) => r.value !== null);
  // The name is not a row: the plate describes one body, and says whose.
  const spoken = `${file.name} · ${rows
    .map((r) => `${t(lang, r.labelKey)} ${r.value}`)
    .join(", ")}`;
  return (
    <div
      className="xray-raw absolute bottom-20 left-1/2 z-40 -translate-x-1/2 max-w-[calc(100vw-24px)] flex flex-wrap
                 items-center justify-center gap-x-2 gap-y-0.5 rounded-md px-3 py-1.5 font-jetbrains
                 text-[length:var(--fs-meta)] pointer-events-none"
      style={{
        background: "var(--material-read-bg)",
        border: "1px solid var(--glass-chrome-border)",
      }}
      role="group"
      aria-label={t(lang, "xray.aria", { name: file.name, values: spoken })}
      data-xray-state="held"
    >
      <span className="xray-name" style={{ color: "var(--color-text)" }}>
        {file.name}
      </span>
      {rows.map((r) => (
        <span key={r.labelKey} className="flex items-center gap-1" data-xray-row={r.field}>
          <span aria-hidden="true" style={{ color: "var(--meta-strong)" }}>
            ·
          </span>{" "}
          <span style={{ color: "var(--meta-strong)" }}>{t(lang, r.labelKey)}</span>{" "}
          <span style={{ color: "var(--color-text)" }}>{r.value}</span>
        </span>
      ))}
    </div>
  );
}
