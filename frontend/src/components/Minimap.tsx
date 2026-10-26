import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { getDirLayout, type DirLayout } from "../city/layout";
import { languageColor, severityColor } from "../city/palette";
import { t } from "../i18n";
import { resolve } from "../interaction/shortcuts";
import { getKeyboardMark } from "../interaction/keyboardMark";
import "../design/griff.css";

/**
 * City map — shows the CURRENT semantic-zoom level with the REAL camera
 * position and heading (the old minimap had a decorative static arrow).
 * Click anywhere to fly there; the keyboard aims a marker and flies there.
 *
 * Click and Enter now share one geometry and one target. Measured before
 * (`protokoll-vorher.log`): clicking the map at minimap pixel (26,30) and then
 * pressing Enter moved 709 of 1000 screen cells — the key flew to the world
 * origin instead of the point that had just been chosen, so the two hands got
 * two different cities.
 */

const MAP_SIZE = 190;
const PADDING = 12;
/** Gold marks the camera itself; the alarm red belongs to findings and cycles. */
const MARKER_COLOR = "#e8b23c";

/** The one mapping between world and plate — click and keyboard aim through it. */
function geometry(layout: DirLayout): {
  extent: number;
  toX: (x: number) => number;
  toY: (z: number) => number;
  worldFromPixel: (px: number, py: number) => { x: number; z: number };
} {
  const extent = Math.max(layout.bounds + 8, 20);
  const span = MAP_SIZE - PADDING * 2;
  const toX = (x: number): number => PADDING + ((x + extent) / (extent * 2)) * span;
  const toY = (z: number): number => PADDING + ((z + extent) / (extent * 2)) * span;
  const worldFromPixel = (px: number, py: number): { x: number; z: number } => ({
    x: ((px - PADDING) / span) * extent * 2 - extent,
    z: ((py - PADDING) / span) * extent * 2 - extent,
  });
  return { extent, toX, toY, worldFromPixel };
}

export function Minimap({ show = true }: { show?: boolean }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const cameraInfo = useStore((s) => s.cameraInfo);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const requestFly = useStore((s) => s.requestFly);

  /** The point the keyboard is aiming at, in world units. */
  const [marker, setMarker] = useState<{ x: number; z: number } | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setMarker(null);
  }, [cityData, focusPath]);

  useEffect(() => {
    if (!show || !cityData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layout = getDirLayout(cityData, focusPath);
    const { extent, toX, toY } = geometry(layout);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = "rgba(16, 16, 14, 0.85)";
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // blocks with their skyline towers
    for (const b of layout.blocks) {
      const x = toX(b.x - b.w / 2);
      const y = toY(b.z - b.d / 2);
      const w = Math.max(3, (b.w / (extent * 2)) * (MAP_SIZE - PADDING * 2));
      const h = Math.max(3, (b.d / (extent * 2)) * (MAP_SIZE - PADDING * 2));
      const alarm = b.dir.findingsBySeverity.P0 > 0;
      const alarmColor = severityColor("P0", colorblind);
      ctx.fillStyle = alarm ? `${alarmColor}24` : "rgba(160,150,132,0.16)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = alarm ? alarmColor : "rgba(165,158,144,0.55)";
      ctx.strokeRect(x, y, w, h);
      // Shape, not only hue: the wash and its outline are 1,54:1 apart on this
      // canvas, so colour alone carried "critical lives here". The wedge is the
      // same ▲ the severity chip uses, and the line under the map says it in words.
      if (alarm) {
        ctx.fillStyle = alarmColor;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.min(5, w), y);
        ctx.lineTo(x, y + Math.min(5, h));
        ctx.closePath();
        ctx.fill();
      }
      // representative skyline towers
      for (const t of b.skyline) {
        const tx = toX(b.x + t.x);
        const ty = toY(b.z + t.z);
        ctx.fillStyle = languageColor(t.file.language);
        ctx.fillRect(tx - 1.2, ty - 1.2, 2.4, 2.4);
        if (t.file.threatLevel === "critical") {
          ctx.strokeStyle = severityColor("P0", colorblind);
          ctx.strokeRect(tx - 2.6, ty - 2.6, 5.2, 5.2);
        }
      }
    }

    // buildings
    for (const b of layout.buildings) {
      const x = toX(b.x);
      const y = toY(b.z);
      ctx.fillStyle = languageColor(b.file.language);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (b.file.threatLevel === "critical") {
        ctx.strokeStyle = severityColor("P0", colorblind);
        ctx.strokeRect(x - 3, y - 3, 6, 6);
      }
    }

    // podium
    if (layout.podium) {
      const x = toX(layout.podium.x);
      const y = toY(layout.podium.z);
      ctx.strokeStyle = "rgba(180,170,150,0.6)";
      ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
    }

    // the keyboard's aim: crosshair + ring, drawn under the camera cone
    if (marker) {
      const mx = toX(marker.x);
      const my = toY(marker.z);
      ctx.strokeStyle = MARKER_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 9, my);
      ctx.lineTo(mx - 6.5, my);
      ctx.moveTo(mx + 6.5, my);
      ctx.lineTo(mx + 9, my);
      ctx.moveTo(mx, my - 9);
      ctx.lineTo(mx, my - 6.5);
      ctx.moveTo(mx, my + 6.5);
      ctx.lineTo(mx, my + 9);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // REAL camera position + heading
    const cx = toX(cameraInfo.x);
    const cy = toY(cameraInfo.z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-cameraInfo.angle + Math.PI);
    ctx.fillStyle = MARKER_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 4.4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4.4, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [show, cityData, focusPath, cameraInfo, marker, colorblind]);

  /** Where a fresh aim should start: the thing the reader is already looking at. */
  const defaultMarker = useCallback((): { x: number; z: number } | null => {
    if (!cityData) return null;
    const layout = getDirLayout(cityData, focusPath);
    const selected =
      selectedUnit?.kind === "file"
        ? layout.buildings.find((b) => b.file.id === selectedUnit.id)
        : undefined;
    if (selected) return { x: selected.x, z: selected.z };
    const mark = getKeyboardMark();
    const block = mark ? layout.blocks.find((b) => b.dir.path === mark.path) : undefined;
    if (block) return { x: block.x, z: block.z };
    return { x: layout.centre.x, z: layout.centre.z };
  }, [cityData, focusPath, selectedUnit]);

  const flyTo = useCallback(
    (x: number, z: number): void => {
      if (!cityData) return;
      const layout = getDirLayout(cityData, focusPath);
      requestFly({ x, z, distance: layout.bounds * 1.1 });
    },
    [cityData, focusPath, requestFly],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!cityData) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const layout = getDirLayout(cityData, focusPath);
      const { worldFromPixel } = geometry(layout);
      const world = worldFromPixel(e.clientX - rect.left, e.clientY - rect.top);
      setMarker(world);
      flyTo(world.x, world.z);
    },
    [cityData, focusPath, flyTo],
  );

  // WCAG 2.1.1: the click-to-fly minimap is keyboard-operable on the same terms
  // as the pointer — arrows aim a visible marker, Enter flies to THAT marker.
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!cityData) return;
      const layout = getDirLayout(cityData, focusPath);
      const { extent } = geometry(layout);
      const step = Math.max(2, extent / 10);
      const clamp = (v: number): number => Math.max(-extent, Math.min(extent, v));
      const at = marker ?? defaultMarker();

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (!at) return;
        setMarker(at);
        flyTo(at.x, at.z);
        return;
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (!at) return;
        setMarker({
          x: clamp(at.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0)),
          z: clamp(at.z + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0)),
        });
      }
    },
    [cityData, focusPath, marker, defaultMarker, flyTo],
  );

  if (!show || !cityData) return null;

  // The same layout the plate draws, counted here so the line under the map and
  // the map itself cannot disagree.
  const laidOut = getDirLayout(cityData, focusPath);
  const plots = laidOut.blocks.length;
  const alarmPlots = laidOut.blocks.filter((b) => b.dir.findingsBySeverity.P0 > 0).length;
  // A root with no districts has no plots to carry the alarm — but its own
  // files stand on the plaza and their beacons burn. "no plot carries a
  // critical finding" beside a red beacon is the contradiction the drei-ordner
  // drive caught on a three-file project; the plaza IS the carrier there.
  const plazaP0 = laidOut.buildings.reduce(
    (sum, b) => sum + b.file.findings.filter((f) => f.severity === "P0").length,
    0,
  );
  const alarmNone = alarmPlots === 0 && plazaP0 === 0;

  return (
    <div
      className="city-minimap absolute bottom-4 right-4 z-10 pointer-events-auto"
      /* The plate wears the shell's material instead of its own numbers. It
         carries two sentences — the title and the alarm line — so it takes the
         thick reading material, written as the one `background` the other plates
         use. Measured on the running screen before this changed (2026-10-25,
         1280×800 @2×, demo and the stored 77-finding scan): an inline
         `rgba(16, 16, 14, 0.85)` with `blur(4px)` kept its translucency and its
         blur while the rest of the shell went solid under
         `prefers-reduced-transparency: reduce` — a declaration no sheet can
         answer. With the tokens the same probe reads α 1 and `none`. */
      style={{
        background: "var(--glass-chrome-sheen), var(--material-read-bg)",
        border: "1px solid var(--glass-chrome-border)",
        backdropFilter: "var(--glass-chrome-blur)",
        padding: 4,
      }}
    >
      {/* The label of a surface is not an alarm. Half of the brand red measured
         1,83–1,92:1 over the plate's own fields and 2,2–2,8:1 in pixels — not a
         quiet word, an unreadable one. The shell's secondary label ink holds
         5,86:1 at its `:root` step and 11,07:1 as the shell scatters it
         (`tests/glas-chrome.test.ts`); the red stays where it carries meaning,
         in the plots below. */}
      <div
        className="font-mono text-[length:var(--fs-meta)] tracking-widest mb-1 px-0.5"
        style={{ color: "var(--meta-strong)" }}
      >
        {t(lang, "minimap.title")}{" "}
        {focusPath.length > 0 ? `· /${focusPath.join("/")}` : t(lang, "minimap.overview")}
      </div>
      {/* The wedge in the corner of an alarm plot is the shape carrier; this
          line is the word carrier — the two states differ by 1,54:1 on a 190 px
          canvas, which is not an answer a reader can see. Counted from the same
          layout the plate draws, so the number cannot disagree with the map. */}
      <p className="minimap-alarm" data-minimap-alarm={String(alarmPlots)} role="status">
        {alarmNone
          ? t(lang, "minimap.alarmNone")
          : alarmPlots === 0
            ? t(lang, "minimap.alarmPlaza")
            : t(lang, alarmPlots === 1 ? "minimap.alarmOne" : "minimap.alarm", {
                n: alarmPlots,
                total: plots,
              })}
      </p>
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ width: MAP_SIZE, height: MAP_SIZE, cursor: "crosshair", display: "block" }}
        onClick={handleClick}
        onKeyDown={handleKey}
        onFocus={() => {
          setFocused(true);
          setMarker((m) => m ?? defaultMarker());
        }}
        onBlur={() => setFocused(false)}
        data-key-owner="minimap"
        tabIndex={0}
        role="button"
        aria-label={resolve(lang, {
          key: "minimap.ariaKeyboard",
          en: "City map. Arrow keys move the marker, Enter flies the camera to it — the same as a click.",
          de: "Übersichtskarte. Pfeiltasten bewegen die Markierung, Enter fliegt dorthin — wie ein Klick.",
        })}
      />
      {focused && (
        <div className="minimap-keys">
          {resolve(lang, {
            key: "minimap.keys",
            en: "← → ↑ ↓ marker · Enter flies",
            de: "← → ↑ ↓ Markierung · Enter fliegt",
          })}
        </div>
      )}
    </div>
  );
}
