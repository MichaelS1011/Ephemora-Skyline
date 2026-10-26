"use client";

/**
 * Z-05 — the layer view: four bars, one per layer the city is drawn from.
 *
 * It stands in the colour key, not in the project card. That is a budget
 * decision with a number behind it: the arrival word budget is 171 words
 * (`arrival-budget.test.tsx`, two thirds of the 2026-10-18 census of 256), the
 * standing card held 171 of them, and the four rows plus their two lines of
 * framing add 17 — 188 on the screen a first-time reader gets. The legend is
 * one of the surfaces the budget folds away at arrival, so the same 17 words
 * arrive when the reader asks what the picture is made of instead of being
 * poured in with the city. The budget is not raised here; the block is placed
 * where the rule says there is room.
 */
import { useMemo } from "react";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
import { resolveDir } from "../city/layout";
import { LAYER_LABEL, layerShares, plazaFiles } from "../city/layerShares";
import "../design/stadt-ui.css";

export function LayerView() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const lang = useStore((s) => s.prefs.lang);

  const layers = useMemo(
    () => layerShares(cityData ? plazaFiles(resolveDir(cityData.tree, focusPath)) : []),
    [cityData, focusPath],
  );
  // No city yet, or a plaza that draws no files: there is no denominator, and
  // four zeroes would be four answers to questions nobody asked.
  const total = layers[0]?.total ?? 0;
  if (!cityData || total === 0) return null;

  return (
    <div className="ctx-layers" aria-label={t(lang, "ctx.layerTitle")}>
      <div className="ctx-layers-head">
        <span className="ctx-layers-title">{t(lang, "ctx.layerTitle")}</span>
        <span className="ctx-layers-note">{t(lang, "ctx.layerExplainer")}</span>
      </div>
      {layers.map((l) => (
        <div
          key={l.key}
          className="ctx-layer"
          title={
            l.pct === null
              ? t(lang, "ctx.layer.none")
              : t(lang, "ctx.layer.count", { answered: l.answered, total: l.total })
          }
        >
          <span className="ctx-layer-name">{t(lang, LAYER_LABEL[l.key])}</span>
          <span className="ctx-layer-bar" aria-hidden="true">
            <i style={{ width: `${l.pct ?? 0}%` }} />
          </span>
          {/* A layer that never ran gets a dash, not a zero: "0 %" would report
              a measurement that says nothing is covered. */}
          <span className="ctx-layer-pct">{l.pct === null ? "–" : `${l.pct}%`}</span>
        </div>
      ))}
    </div>
  );
}
