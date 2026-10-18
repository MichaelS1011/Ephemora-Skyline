/**
 * The release card: what the file is, the file itself, and a text to go with
 * it.
 *
 * Every figure on it was measured while the encoder was open, and the caption
 * numbers were frozen when the recording started, so a re-scan behind the panel
 * cannot quietly change what this card claims about a finished file.
 *
 * The call to action is one block and it is conditional on the operator having
 * set `SHARE_LINK`. While that constant is empty the card names no destination,
 * hints at no repository and asks for no star; an ask that points at a 404 is
 * not a kind ask.
 */

import { useState } from "react";
import type { Lang } from "../i18n";
import { formatCount, formatDecimal } from "../i18n";
import type { CaptureResult } from "../hooks/useCityCapture";
import { captionsFor, type CaptionTone } from "../share/captions";
import { SharePlatforms } from "../share/Platforms";
import { SHARE_LINK } from "../share/config";
import { tx } from "../share/fallbackCopy";

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
  const [copied, setCopied] = useState<CaptionTone | null>(null);
  // The platform row needs to know which text the user chose. Without a choice
  // it carries the dry caption, and it says so by using the same string the
  // card shows above it.
  const [chosen, setChosen] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const captions = captionsFor(result.facts, lang, SHARE_LINK);
  const file = new File([result.blob], result.fileName, { type: result.blob.type || "video/webm" });
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

  const copy = async (tone: CaptionTone, text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tone);
      setChosen(text);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
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
          <Fact label={tx(lang, "card.codec")} value={result.recorderMime} mono />
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

      <div className="share-captions">
        <h4>{tx(lang, "card.captions")}</h4>
        {captions.map((caption) => (
          <div className="share-caption" key={caption.tone}>
            <div className="share-caption-head">
              <span className="share-tone">{tx(lang, `card.tone.${caption.tone}`)}</span>
              <button
                type="button"
                className="share-copy"
                onClick={() => void copy(caption.tone, caption.text)}
              >
                {copied === caption.tone ? tx(lang, "card.copied") : tx(lang, "card.copy")}
              </button>
            </div>
            <p className="share-caption-text">{caption.text}</p>
          </div>
        ))}
        {copyFailed && (
          <p className="share-error" role="alert">
            {tx(lang, "card.copyFailed")}
          </p>
        )}
      </div>

      <SharePlatforms lang={lang} caption={chosen ?? captions[0]!.text} />

      {SHARE_LINK ? (
        <p className="share-cta">
          {tx(lang, "card.cta")}{" "}
          <a className="share-link" href={SHARE_LINK} target="_blank" rel="noreferrer">
            {SHARE_LINK}
          </a>
        </p>
      ) : (
        <p className="share-subtle">{tx(lang, "card.noLink")}</p>
      )}

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
