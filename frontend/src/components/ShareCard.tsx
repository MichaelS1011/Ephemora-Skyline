/**
 * The release card: the file, the two ways out, and what was measured.
 *
 * There is deliberately no suggested post text and no platform row. The card
 * hands over the video file and nothing else: a caption written by the tool
 * would be posted in the user's voice, and a bad one is worse than none. The
 * system share dialog receives the file alone; the privacy note and the name
 * opt-in state stay on the card because they describe what the file contains.
 *
 * Every figure on it was measured while the encoder was open, so a re-scan
 * behind the panel cannot quietly change what this card claims about a
 * finished file.
 */

import { useState } from "react";
import type { Lang } from "../i18n";
import { formatCount, formatDecimal } from "../i18n";
import type { CaptureResult } from "../hooks/useCityCapture";
import { tx } from "../share/fallbackCopy";
import { CREDIT_TEXT } from "../share/capture";

/** The container and codec in a developer's words, from the encoder's own string. */
export function codecLabel(mime: string): string {
  const type = mime.toLowerCase();
  if (type.includes("mp4")) return type.includes("avc1") ? "MP4 · H.264" : "MP4";
  if (type.includes("webm")) {
    if (type.includes("vp9")) return "WebM · VP9";
    if (type.includes("vp8")) return "WebM · VP8";
    return "WebM";
  }
  return mime;
}

export function ShareCard({
  result,
  lang,
  showNames,
  onAgain,
}: {
  result: CaptureResult;
  lang: Lang;
  showNames: boolean;
  onAgain: () => void;
}) {
  const [shareFailed, setShareFailed] = useState(false);
  const file = new File([result.blob], result.fileName, {
    type: result.blob.type || result.recorderMime.split(";")[0] || "video/mp4",
  });
  const canShareFile = (() => {
    try {
      return (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      );
    } catch {
      return false;
    }
  })();
  const save = (): void => {
    const a = document.createElement("a");
    a.href = result.previewUrl;
    a.download = result.fileName;
    a.click();
  };

  const share = async (): Promise<void> => {
    try {
      await navigator.share({ files: [file] });
      setShareFailed(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareFailed(true);
    }
  };

  return (
    <section className="share-card" aria-label={tx(lang, "card.title")}>
      <h3>{tx(lang, "card.title")}</h3>
      <p className="share-sub">{tx(lang, "card.sub")}</p>

      <video
        className="share-player"
        src={result.previewUrl}
        poster={result.posterDataUrl}
        controls
        playsInline
        muted
        loop
      />

      <button type="button" className="share-save" onClick={save}>
        ↓ {tx(lang, "card.download")}
      </button>
      {canShareFile && (
        <button type="button" className="share-save" onClick={() => void share()}>
          ↗ {tx(lang, "card.share")}
        </button>
      )}
      {canShareFile && <p className="share-subtle">{tx(lang, "card.shareFileOnly")}</p>}
      {shareFailed && (
        <p className="share-error" role="alert">
          {tx(lang, "card.shareFailed")}
        </p>
      )}

      <table className="share-facts">
        <caption>{tx(lang, "card.facts")}</caption>
        <tbody>
          <Fact label={tx(lang, "card.size")} value={byteLine(result.bytes, lang)} />
          <Fact
            label={tx(lang, "card.duration")}
            value={`${formatDecimal(lang, result.durationMs / 1000)} s`}
          />
          <Fact label={tx(lang, "card.resolution")} value={`${result.width} × ${result.height}`} />
          <Fact label={tx(lang, "card.fpsSet")} value={`${result.fps} fps`} />
          <Fact label={tx(lang, "card.codec")} value={codecLabel(result.recorderMime)} />
          <Fact label={tx(lang, "card.frames")} value={formatCount(lang, result.frames)} />
          <Fact
            label={tx(lang, "card.crop")}
            value={`${formatCount(lang, Math.round(result.cropped * 1000) / 10)} %`}
          />
          <Fact label={tx(lang, "card.fileName")} value={result.fileName} mono />
        </tbody>
      </table>

      <p className="share-names-result">
        {showNames
          ? tx(lang, "card.namesOn", { names: result.drawnTexts.join(", ") })
          : tx(lang, "card.namesOff")}
      </p>

      <p className="share-subtle">{tx(lang, "card.mark", { mark: CREDIT_TEXT })}</p>

      <p className="share-subtle">{tx(lang, "card.privacy")}</p>

      <button type="button" className="share-again" onClick={onAgain}>
        {tx(lang, "card.again")}
      </button>
    </section>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={mono ? "share-mono" : undefined}>{value}</td>
    </tr>
  );
}

/** Bytes as counted, plus the same number in megabytes for the eye. */
function byteLine(bytes: number, lang: Lang): string {
  // one door, not a hand-rolled comma swap beside it
  return `${formatCount(lang, bytes)} bytes (${formatDecimal(lang, bytes / 1_048_576)} MB)`;
}
