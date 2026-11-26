/** First gate after arrival. No dashboard, no form: a game-style choice. */
import "../forge.css";
import { useForgeStore } from "../store";
import { useStore } from "../../stores/useStore";
import { forgeText } from "../i18n";
import { ForgeLanguageSwitch } from "./ForgeLanguageSwitch";

export function ModeSelect() {
  const setMode = useForgeStore((state) => state.setMode);
  const lang = useStore((state) => state.prefs.lang);

  return (
    <div className="forge-mode-select" data-testid="forge-mode-select">
      <div className="forge-mode-tools">
        <ForgeLanguageSwitch />
      </div>
      <div className="forge-mode-inner">
        <p className="forge-mode-eyebrow">EPHEMORA SKYLINE · 0.4.13</p>
        <h1>{forgeText(lang, "mode.title")}</h1>
        <p className="forge-mode-sub">{forgeText(lang, "mode.sub")}</p>
        <div className="forge-mode-cards">
          <button
            type="button"
            className="forge-mode-card"
            data-testid="forge-mode-explore"
            onClick={() => setMode("explore")}
          >
            <span className="forge-mode-card-index">{forgeText(lang, "mode.exploreIndex")}</span>
            <span className="forge-mode-card-title">{forgeText(lang, "mode.exploreTitle")}</span>
            <span className="forge-mode-card-body">{forgeText(lang, "mode.exploreBody")}</span>
            <span className="forge-mode-card-cta">{forgeText(lang, "mode.exploreCta")}</span>
          </button>
          <button
            type="button"
            className="forge-mode-card forge-mode-card-build"
            data-testid="forge-mode-build"
            onClick={() => setMode("build")}
          >
            <span className="forge-mode-card-index">{forgeText(lang, "mode.buildIndex")}</span>
            <span className="forge-mode-card-title">{forgeText(lang, "mode.buildTitle")}</span>
            <span className="forge-mode-card-body">{forgeText(lang, "mode.buildBody")}</span>
            <span className="forge-mode-card-cta">{forgeText(lang, "mode.buildCta")}</span>
          </button>
        </div>
        <p className="forge-mode-foot">{forgeText(lang, "mode.local")}</p>
      </div>
    </div>
  );
}
