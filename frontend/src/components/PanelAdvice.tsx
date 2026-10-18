import { formatCount, t, type DictKey, type Lang } from "../i18n";
import type { CityFile } from "../city/types";

type StructureNote = NonNullable<CityFile["advice"]>[number];

const NOTE_KEY: Record<StructureNote["kind"], DictKey> = {
  monolith: "panel.adviceMonolith",
  deep: "panel.adviceDeep",
  longline: "panel.adviceLongline",
};

/**
 * The card's teaching block: what the tower's height already showed, said in
 * words. Notes travel on the file record — never as findings, the triage
 * queue stays about risks — and speak the UI language.
 */
export function PanelAdvice({ advice, lang }: { advice?: StructureNote[]; lang: Lang }) {
  if (!advice || advice.length === 0) return null;
  return (
    <section
      className="panel-advice mb-3"
      data-structure-advice
      aria-label={t(lang, "panel.adviceTitle")}
    >
      <h4
        className="font-jetbrains text-[length:var(--fs-meta)] tracking-widest mb-1"
        style={{ color: "#d8c9a3" }}
      >
        {t(lang, "panel.adviceTitle")}
      </h4>
      {advice.map((note) => (
        <p
          key={note.kind}
          className="font-jetbrains text-[length:var(--fs-meta)] leading-relaxed mb-1"
          style={{ color: "var(--meta-strong)" }}
        >
          {t(lang, NOTE_KEY[note.kind], { n: formatCount(lang, note.value) })}
        </p>
      ))}
    </section>
  );
}
