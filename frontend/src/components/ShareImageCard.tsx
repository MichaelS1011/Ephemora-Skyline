import { useState } from "react";
import type { Lang } from "../i18n";
import type { CityImage } from "../share/image";
import { imageCaptionFor, type MeasuredFacts } from "../share/captions";
import { SHARE_LINK } from "../share/config";
import { tx } from "../share/fallbackCopy";

export function ShareImageCard({
  image,
  previewUrl,
  lang,
  showNames,
  facts,
  onAgain,
}: {
  image: CityImage;
  previewUrl: string;
  lang: Lang;
  showNames: boolean;
  facts: MeasuredFacts;
  onAgain: () => void;
}) {
  const [shareFailed, setShareFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const caption = imageCaptionFor(facts, lang, SHARE_LINK);
  const file = new File([image.blob], image.fileName, { type: "image/png" });
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
    a.href = previewUrl;
    a.download = image.fileName;
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
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };
  return (
    <section className="share-card" aria-label={tx(lang, "image.ready")}>
      <h3>{tx(lang, "image.ready")}</h3>
      <p className="share-sub">{tx(lang, "image.preview")}</p>
      <img className="share-player" src={previewUrl} alt={tx(lang, "image.alt")} />
      {image.cropped > 0.05 && (
        <p className="share-note">
          {tx(lang, "image.crop", { n: Math.round(image.cropped * 100) })}
        </p>
      )}
      <button type="button" className="share-save" onClick={save}>
        ↓ {tx(lang, "image.download")}
      </button>
      {canShareFile && (
        <button type="button" className="share-save" onClick={() => void share()}>
          ↗ {tx(lang, "image.share")}
        </button>
      )}
      {shareFailed && (
        <p className="share-error" role="alert">
          {tx(lang, "card.shareFailed")}
        </p>
      )}
      <p className="share-names-result">
        {showNames
          ? tx(lang, "card.namesOn", { names: image.drawnTexts.join(", ") })
          : tx(lang, "card.namesOff")}
      </p>
      <p className="share-subtle">
        {image.width} × {image.height} PNG · {image.fileName}
      </p>
      <div className="share-captions">
        <div className="share-caption-head">
          <h4>{tx(lang, "card.captions")}</h4>
          <button type="button" className="share-copy" onClick={() => void copy()}>
            {copied ? tx(lang, "card.copied") : tx(lang, "card.copy")}
          </button>
        </div>
        <p className="share-caption-text">{caption}</p>
        {copyFailed && (
          <p className="share-error" role="alert">
            {tx(lang, "card.copyFailed")}
          </p>
        )}
      </div>
      <p className="share-subtle">{tx(lang, "card.privacy")}</p>
      <button type="button" className="share-again" onClick={onAgain}>
        {tx(lang, "image.again")}
      </button>
    </section>
  );
}
