import { FORGE_TEMPLATES } from "../templates";
import { useForgeStore } from "../store";
import { useStore } from "../../stores/useStore";
import { forgeText } from "../i18n";
import { ForgeLanguageSwitch } from "./ForgeLanguageSwitch";

export function ForgeStarter() {
  const loadTemplate = useForgeStore((state) => state.loadTemplate);
  const startBlank = useForgeStore((state) => state.startBlank);
  const lang = useStore((state) => state.prefs.lang);

  return (
    <section
      className="forge-starter"
      data-testid="forge-starter"
      aria-labelledby="forge-starter-title"
    >
      <div className="forge-starter-tools">
        <ForgeLanguageSwitch />
      </div>
      <div className="forge-starter-head">
        <p className="forge-starter-eyebrow">{forgeText(lang, "starter.kicker")}</p>
        <h1 id="forge-starter-title">{forgeText(lang, "starter.title")}</h1>
        <p>{forgeText(lang, "starter.body")}</p>
      </div>
      <div className="forge-starter-grid">
        {FORGE_TEMPLATES.map((template, index) => (
          <button
            key={template.id}
            type="button"
            className="forge-template-card"
            style={{ "--template-accent": template.accent } as React.CSSProperties}
            onClick={() => loadTemplate(template.id, lang)}
            data-testid={`forge-template-${template.id}`}
          >
            <span className="forge-template-index">
              0{index + 1} / {template.eyebrow[lang]}
            </span>
            <span className="forge-template-mini" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <strong>{template.name[lang]}</strong>
            <span>{template.description[lang]}</span>
            <span className="forge-template-result">→ {template.result[lang]}</span>
          </button>
        ))}
      </div>
      <div className="forge-starter-foot">
        <span>{forgeText(lang, "starter.local")}</span>
        <button type="button" onClick={() => startBlank(lang)} data-testid="forge-template-blank">
          {forgeText(lang, "starter.blank")}
        </button>
      </div>
    </section>
  );
}
