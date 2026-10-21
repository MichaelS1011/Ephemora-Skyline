import { useState } from "react";
import type { Lang } from "../i18n";
import type { CityImage } from "../share/image";
import { tx } from "../share/fallbackCopy";
import { CREDIT_TEXT } from "../share/capture";

export function ShareImageCard({
  image,
  previewUrl,
  lang,
  showNames,
  onAgain,
}: {
  image: CityImage;
  previewUrl: string;
  lang: Lang;
  showNames: boolean;
  onAgain: () => void;
}) {
  const [shareFailed, setShareFailed] = useState(false);
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
      {canShareFile && <p className="share-subtle">{tx(lang, "image.shareFileOnly")}</p>}
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
      <p className="share-subtle">{tx(lang, "card.mark", { mark: CREDIT_TEXT })}</p>
      <p className="share-subtle">
        {image.width} × {image.height} PNG · {image.fileName}
      </p>
      <p className="share-subtle">{tx(lang, "card.privacy")}</p>
      <button type="button" className="share-again" onClick={onAgain}>
        {tx(lang, "image.again")}
      </button>
    </section>
  );
}
