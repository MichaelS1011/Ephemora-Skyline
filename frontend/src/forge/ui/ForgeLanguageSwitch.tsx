import { useStore } from "../../stores/useStore";
import { forgeText, type ForgeLang } from "../i18n";

export function ForgeLanguageSwitch() {
  const lang = useStore((state) => state.prefs.lang);
  const setPref = useStore((state) => state.setPref);

  return (
    <div
      className="forge-language-switch"
      role="group"
      aria-label={forgeText(lang, "language.label")}
    >
      {(["en", "de"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          aria-label={forgeText(lang, code === "en" ? "language.english" : "language.german")}
          onClick={() => setPref("lang", code as ForgeLang)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
