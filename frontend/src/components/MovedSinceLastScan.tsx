import { formatCount, t, type Lang } from "../i18n";
import { useStore } from "../stores/useStore";

/**
 * The findings the comparison paired across scans, where developers look.
 *
 * `compareScans` matches a vanished fingerprint to the first finding of the
 * same rule in the same file, and it cannot prove those two are one finding
 * that moved — a fix and an unrelated hit pair up just as well. So this list
 * does not announce "moved": it names both lines and says in the first line
 * that the pairing is a lead, not a fix. A gold left border was the first cut;
 * it took the one focus colour as decoration, so this block keeps the panel's
 * own edge and lets the words do the work.
 */
export function MovedSinceLastScan({ lang }: { lang: Lang }) {
  const verify = useStore((s) => s.verify);
  const moved = verify.status === "ran" ? verify.report.moved : [];
  if (moved.length === 0) return null;
  return (
    <section className="findings-moved" data-moved-since={moved.length}>
      <h3 className="findings-moved-title">
        {t(lang, "findings.movedTitle")}
        <span className="findings-moved-count">{formatCount(lang, moved.length)}</span>
      </h3>
      <p className="findings-moved-why">{t(lang, "findings.movedWhy")}</p>
      <ul className="findings-moved-list">
        {moved.map(({ from, to }) => (
          <li key={`${from.path}:${from.ruleId}:${from.line}`} title={from.ruleId}>
            <span className="findings-moved-path" dir="ltr">
              {from.path}
            </span>
            <span className="findings-moved-lines">
              {t(lang, "findings.movedLine", { from: from.line, to: to.line })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
