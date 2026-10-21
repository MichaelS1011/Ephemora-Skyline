/**
 * The studio: choose the shot, record it, read what came out.
 *
 * Nothing here is a blocker. The panel opens on a menu item or on the once per
 * city nudge, it closes on Escape or on its own close button, and it never
 * interrupts a scan, a triage or a camera move. The name opt-in is unchecked
 * because a recording that shows folder titles is a publication, and a
 * pre-ticked box would make that publication the default.
 */

import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { formatCount } from "../i18n";
import { CAPTURE_FORMATS, FORMAT_ORDER, type FormatId } from "../share/formats";
import { tx, type ShareKey } from "../share/fallbackCopy";
import { OPEN_STUDIO_EVENT } from "../share/studioBus";
import { useCityCapture, type LengthMode } from "../hooks/useCityCapture";
import { ShareCard } from "./ShareCard";
import { ShareImageCard } from "./ShareImageCard";
import { captureCityImage, type CityImage } from "../share/image";
import { CREDIT_TEXT } from "../share/capture";
import { getDirLayout } from "../city/layout";
import { surfaceForLayout } from "../city/worldSurface";
import { defaultOverviewPath } from "../city/overview";
import { shareHeroShot } from "../share/heroShot";
import "../design/share.css";

const LENGTHS: Array<{
  id: string;
  seconds: number | null;
  mode: LengthMode;
  label: ShareKey;
}> = [
  { id: "build", seconds: null, mode: { kind: "build" }, label: "length.build" },
  { id: "15", seconds: 15, mode: { kind: "seconds", seconds: 15 }, label: "length.15" },
  { id: "30", seconds: 30, mode: { kind: "seconds", seconds: 30 }, label: "length.30" },
  { id: "manual", seconds: null, mode: { kind: "manual" }, label: "length.manual" },
];

/**
 * A mounted studio says so on the document element. The city menu opens it;
 * the marker also lets CSS keep its recording state scoped to this panel.
 */
function markStudioMounted(mounted: boolean): void {
  if (typeof document === "undefined") return;
  if (mounted) document.documentElement.dataset.shareStudio = "mounted";
  else delete document.documentElement.dataset.shareStudio;
}

export function ShareStudio() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const buildPhase = useStore((s) => s.buildPhase);
  const capture = useCityCapture();

  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<"image" | "video">("image");
  const [format, setFormat] = useState<FormatId>("16x9");
  const [lengthId, setLengthId] = useState<string>("build");
  const [showNames, setShowNames] = useState(false);
  const [imageResult, setImageResult] = useState<{ image: CityImage; previewUrl: string } | null>(
    null,
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageUrlRef = useRef<string | null>(null);
  const imageJobRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const clearImage = (): void => {
    imageJobRef.current += 1;
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = null;
    setImageResult(null);
    setImageError(false);
    setImageBusy(false);
  };

  useEffect(
    () => () => {
      imageJobRef.current += 1;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    const onOpen = (): void => setOpen(true);
    window.addEventListener(OPEN_STUDIO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STUDIO_EVENT, onOpen);
  }, []);

  useEffect(() => {
    markStudioMounted(open && !!cityData);
    return () => markStudioMounted(false);
  }, [open, cityData]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if ((capture.result || imageResult) && panelRef.current) panelRef.current.scrollTop = 0;
  }, [capture.result, imageResult]);

  if (!open || !cityData) return null;

  const preset = CAPTURE_FORMATS[format];
  const length = LENGTHS.find((l) => l.id === lengthId) ?? LENGTHS[1]!;
  const canBuild = buildPhase === "constructing" || buildPhase === "built";
  const recording = capture.phase === "recording";
  const seconds = Math.round(capture.elapsedMs / 1000);

  const start = (): void => {
    if (length.mode.kind === "build" && !canBuild) return;
    // The build replay resets to the project level, so its hook and reveal
    // must frame that level; a free take keeps the level the reader is in.
    const path = length.mode.kind === "build" ? defaultOverviewPath(cityData) : focusPath;
    const layout = getDirLayout(cityData, path);
    const hero = shareHeroShot(layout, surfaceForLayout(layout, path.length > 0), preset.aspect);
    capture.start({
      city: cityData,
      focusPath: path,
      format,
      showNames,
      length: length.mode,
      hero,
      hook: length.mode.kind === "build",
    });
  };

  const makeImage = async (): Promise<void> => {
    const job = ++imageJobRef.current;
    setImageBusy(true);
    setImageError(false);
    try {
      const image = await captureCityImage(cityData, focusPath, format, showNames);
      if (job !== imageJobRef.current) return;
      const previewUrl = URL.createObjectURL(image.blob);
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = previewUrl;
      setImageResult({ image, previewUrl });
    } catch {
      if (job === imageJobRef.current) setImageError(true);
    } finally {
      if (job === imageJobRef.current) setImageBusy(false);
    }
  };

  const close = (): void => {
    capture.reset();
    clearImage();
    setOpen(false);
    document.getElementById("city-more-button")?.focus();
  };

  return (
    <div
      ref={panelRef}
      className={`panel-share-studio${capture.result || imageResult ? " is-result" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="share-studio-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // The app owns Escape for deselect, drill-out and re-framing. While a
        // dialog is open the dialog answers it first and nothing else moves.
        event.stopPropagation();
        close();
      }}
    >
      <header className="share-head">
        <h2 id="share-studio-title">{tx(lang, "studio.title")}</h2>
        <button
          type="button"
          className="share-close"
          onClick={close}
          aria-label={tx(lang, "studio.close")}
        >
          ×
        </button>
      </header>

      <p className="share-intro">{tx(lang, "studio.intro")}</p>

      <fieldset
        className="share-group share-media"
        disabled={recording || capture.phase === "finalizing" || imageBusy}
      >
        <legend>{tx(lang, "studio.media")}</legend>
        <div className="share-chips">
          {(["image", "video"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`share-media-button${media === kind ? " is-on" : ""}`}
              aria-pressed={media === kind}
              onClick={() => {
                capture.reset();
                clearImage();
                setMedia(kind);
              }}
            >
              {tx(lang, kind === "image" ? "studio.image" : "studio.video")}
            </button>
          ))}
        </div>
      </fieldset>

      {media === "video" &&
        capture.phase === "idle" &&
        capture.result === null &&
        !capture.canRecord && (
          <p className="share-blocked" role="status">
            {tx(lang, "studio.errorNoRecorder")}
          </p>
        )}

      <fieldset className="share-group" disabled={recording || imageBusy}>
        <legend>{tx(lang, "studio.format")}</legend>
        <div className="share-chips" role="radiogroup" aria-label={tx(lang, "studio.format")}>
          {FORMAT_ORDER.map((id) => {
            const p = CAPTURE_FORMATS[id];
            return (
              <label key={id} className={`share-chip${format === id ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="share-format"
                  value={id}
                  checked={format === id}
                  onChange={() => setFormat(id)}
                />
                <span>{id.replace("x", ":")}</span>
                <span className="share-chip-sub">
                  {p.width}×{p.height}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {media === "video" && (
        <fieldset className="share-group" disabled={recording}>
          <legend>{tx(lang, "studio.length")}</legend>
          <div className="share-chips" role="radiogroup" aria-label={tx(lang, "studio.length")}>
            {LENGTHS.map((l) => {
              const blocked = l.mode.kind === "build" && !canBuild;
              return (
                <label
                  key={l.id}
                  className={`share-chip${lengthId === l.id ? " is-on" : ""}${blocked ? " is-blocked" : ""}`}
                  title={blocked ? tx(lang, "length.buildWaiting") : undefined}
                >
                  <input
                    type="radio"
                    name="share-length"
                    value={l.seconds === null ? l.mode.kind : String(l.seconds)}
                    checked={lengthId === l.id}
                    disabled={blocked}
                    onChange={() => setLengthId(l.id)}
                  />
                  <span>{tx(lang, l.label)}</span>
                </label>
              );
            })}
          </div>
          {lengthId === "build" && !canBuild && (
            <p className="share-note">{tx(lang, "length.buildWaiting")}</p>
          )}
        </fieldset>
      )}

      {media === "video" && (
        <dl className="share-quality">
          <div>
            <dt>{tx(lang, "quality.resolution")}</dt>
            <dd>
              {preset.width} × {preset.height} px
            </dd>
          </div>
          <div>
            <dt>{tx(lang, "quality.fps")}</dt>
            <dd>{preset.fps} fps</dd>
          </div>
          <div>
            <dt>{tx(lang, "quality.bitrate")}</dt>
            <dd>{formatCount(lang, Math.round(preset.bitsPerSecond / 1000))} kbit/s</dd>
          </div>
          <div>
            <dt>{tx(lang, "quality.codec")}</dt>
            <dd className="share-mono">{capture.mimeType ?? tx(lang, "studio.unsupported")}</dd>
          </div>
        </dl>
      )}

      <label className="share-names">
        <input
          type="checkbox"
          checked={showNames}
          disabled={recording || imageBusy}
          onChange={(e) => setShowNames(e.target.checked)}
        />
        <span className="share-names-title">{tx(lang, "studio.names")}</span>
        <span className="share-names-disclosure">{tx(lang, "studio.namesDisclosure")}</span>
        <span className="share-names-disclosure">{tx(lang, "studio.namesFileNote")}</span>
      </label>

      <p className="share-mark">
        <span>{tx(lang, "studio.credit")}</span>
        <span className="share-mark-text">{CREDIT_TEXT}</span>
      </p>

      {capture.error && (
        <p className="share-error" role="alert">
          {tx(lang, capture.error.key, capture.error.vars)}
        </p>
      )}

      {imageError && (
        <p className="share-error" role="alert">
          {tx(lang, "image.error")}
        </p>
      )}

      {media === "image" ? (
        <button
          type="button"
          className="share-record"
          onClick={() => void makeImage()}
          disabled={imageBusy}
        >
          ◇ {imageBusy ? tx(lang, "image.preparing") : tx(lang, "image.create")}
        </button>
      ) : recording || capture.phase === "finalizing" ? (
        <button
          type="button"
          className="share-stop"
          onClick={capture.stop}
          disabled={capture.framing || capture.phase === "finalizing"}
        >
          ■ {tx(lang, "studio.stop")}
        </button>
      ) : (
        <button
          type="button"
          className="share-record"
          onClick={start}
          disabled={!capture.canRecord || (lengthId === "build" && !canBuild)}
        >
          ● {tx(lang, "studio.record")}
        </button>
      )}

      {recording && capture.framing && <p className="share-live">{tx(lang, "studio.preparing")}</p>}

      {recording && !capture.framing && (
        <p className="share-live" role="status" aria-live="polite">
          {tx(lang, "studio.elapsed", { s: seconds })} ·{" "}
          {tx(lang, "studio.written", {
            bytes: formatCount(lang, capture.bytes),
          })}{" "}
          · {formatCount(lang, capture.frames)}
        </p>
      )}

      {capture.phase === "finalizing" && (
        <p className="share-live">{tx(lang, "studio.finalizing")}</p>
      )}

      {media === "video" && capture.result && (
        <ShareCard
          result={capture.result}
          lang={lang}
          showNames={showNames}
          onAgain={() => {
            capture.reset();
          }}
        />
      )}
      {media === "image" && imageResult && (
        <ShareImageCard
          image={imageResult.image}
          previewUrl={imageResult.previewUrl}
          lang={lang}
          showNames={showNames}
          onAgain={clearImage}
        />
      )}
    </div>
  );
}
