import { useMemo } from "react";
import { useStore } from "../stores/useStore";
import { getDirLayout, allFiles } from "../city/layout";
import { planBlastRadius, type BlastNode } from "../city/blastRadius";
import { formatCount, t } from "../i18n";
import "../design/city-funktion.css";

/**
 * 005 Teil A — the dossier's answer to "who would have to be re-read".
 *
 * One door, one list, one caveat. The relation comes from the city's own
 * directed edges (`from` imports `to`), so this component states nothing the
 * payload does not: it names the files on the other end of an INCOMING edge and
 * says out loud that a static import is not a runtime guarantee.
 */
export function BlastRadiusBlock() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const selected = useStore((s) => s.selectedUnit);
  const on = useStore((s) => s.blastOn);
  const setOn = useStore((s) => s.setBlastOn);
  const navigateToFile = useStore((s) => s.navigateToFile);

  const selectedId = selected?.kind === "file" ? selected.id : null;

  const blast = useMemo(
    () =>
      cityData && selectedId && on
        ? planBlastRadius(
            cityData.fileConnections,
            new Map<string, BlastNode>(
              allFiles(cityData).map(({ file }) => [
                file.id,
                { id: file.id, name: file.name, path: file.path },
              ]),
            ),
            new Set(getDirLayout(cityData, focusPath).buildings.map((b) => b.file.id)),
            selectedId,
          )
        : null,
    [cityData, selectedId, on, focusPath],
  );

  if (!selectedId || !cityData) return null;

  return (
    <section className="cf-blast">
      <button
        type="button"
        className="cf-blast-toggle"
        aria-pressed={on}
        onClick={() => setOn(!on)}
        title={t(lang, on ? "blast.hideTitle" : "blast.showTitle")}
      >
        {t(lang, on ? "blast.hide" : "blast.show")}
      </button>

      {blast && (
        <div className="cf-blast-panel">
          {blast.files.length === 0 ? (
            <p className="cf-blast-empty">{t(lang, "blast.none")}</p>
          ) : (
            <>
              <p className="cf-blast-count">
                {t(lang, blast.files.length === 1 ? "blast.one" : "blast.many", {
                  count: formatCount(lang, blast.files.length),
                })}
              </p>
              <ul className="cf-blast-list">
                {blast.files.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="cf-blast-file"
                      onClick={() => navigateToFile(f.id)}
                      title={f.path}
                    >
                      {/* The shape word is the 3D mark's own name, so the list
                          and the plaza say the same thing in two media. */}
                      <span aria-hidden="true" className="cf-blast-square">
                        ▣
                      </span>
                      {f.name}
                      {!f.drawn && (
                        <span className="cf-blast-summarised">{t(lang, "blast.summarised")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {blast.summarised.length > 0 && (
                <p className="cf-blast-shown">
                  {t(lang, "blast.shown", {
                    drawn: formatCount(lang, blast.drawn.length),
                    total: formatCount(lang, blast.files.length),
                  })}
                </p>
              )}
            </>
          )}
          <p className="cf-blast-caveat">{t(lang, "blast.static")}</p>
        </div>
      )}
    </section>
  );
}
