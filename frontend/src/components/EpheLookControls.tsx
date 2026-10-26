import {
  EPHE_MARKS,
  EPHE_PALETTE,
  EPHE_VARIANTS,
  epheOutfit,
  type EpheMark,
} from "../city/palette";
import { t, type DictKey, type Lang } from "../i18n";
import { useStore } from "../stores/useStore";

/**
 * MASTER-2027 §04.05/§04.06/§04.07, placed for §04.10/§04.11 — the two choices
 * that dress a resident: which jacket column, and which mark.
 *
 * One component, two homes: the vitrine (where a resident is created) and the
 * resident card (where a resident already in the project can be restyled, which
 * is §04.11's "nachträglich umgestalten"). Both write the same store field, and
 * the store writes the same browser key (§04.09), so there is no second copy of
 * the choice to fall out of date — and the crowd recolours from it (§04.10).
 *
 * A chip is painted from the pair it stands for, never from a colour someone
 * could mix by hand: coat on top, its own sleeve beneath. Free mixing measured
 * 1,53:1 arm against coat, under the 1,78:1 the same arm holds on the floor.
 *
 * No `title` on any of them: the chip already shows what it is, and a browser
 * tooltip paints over the figure at exactly the moment someone is deciding what
 * the figure should wear (measured: 618 pixels of the vitrine's stage given to
 * "…te jacket").
 */

/** Named rather than numbered; a new index without a name does not compile. */
const VARIANT_LABELS: Record<(typeof EPHE_VARIANTS)[number], DictKey> = {
  0: "landing.previewVariantSlate",
  1: "landing.previewVariantSerpentine",
  7: "landing.previewVariantSandstone",
};

export const EPHE_LOOK_VARIANTS = EPHE_VARIANTS.map((index) => ({
  index,
  outfit: epheOutfit(index),
  label: VARIANT_LABELS[index],
}));

const MARK_LABELS: Record<EpheMark, DictKey> = {
  none: "landing.previewMarkNone",
  dot: "landing.previewMarkDot",
  diamond: "landing.previewMarkDiamond",
};

export const EPHE_LOOK_MARKS = EPHE_MARKS;

export function EpheLookControls({ lang }: { lang: Lang }) {
  const look = useStore((s) => s.epheLook);
  const choose = useStore((s) => s.applyEpheLook);
  return (
    <div className="ephe-preview-choices">
      <div
        className="ephe-preview-variants"
        role="group"
        aria-label={t(lang, "landing.previewVariantAria")}
      >
        {EPHE_LOOK_VARIANTS.map(({ index, outfit, label }) => (
          <button
            key={index}
            type="button"
            className="ephe-variant"
            aria-pressed={index === look.jacket}
            aria-label={t(lang, label)}
            onClick={() => choose({ jacket: index })}
            style={{
              backgroundImage: `linear-gradient(155deg, ${outfit.coat} 58%, ${outfit.sleeve} 58%)`,
            }}
          />
        ))}
      </div>
      <div
        className="ephe-preview-marks"
        role="group"
        aria-label={t(lang, "landing.previewMarkAria")}
        style={{ color: EPHE_PALETTE.helmet }}
      >
        {EPHE_LOOK_MARKS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="ephe-mark"
            aria-pressed={kind === look.mark}
            aria-label={t(lang, MARK_LABELS[kind])}
            onClick={() => choose({ mark: kind })}
          >
            <span className={`ephe-mark-shape ephe-mark-${kind}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
