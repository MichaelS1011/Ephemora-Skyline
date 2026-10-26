"use client";

/**
 * The three resident roles in one place (Z-07).
 *
 * Until now the roles were only legible one figure at a time: click a body and
 * its card says which job it carries. The target frame asks the other question —
 * "what kinds of resident are there at all" — and that answer was nowhere.
 *
 * Every row is bound to the code that decides the job: `ROLE_NOTES` names the
 * function behind each sentence and `role-notes.test.ts` fails when the
 * function is gone, so the panel cannot drift into invented biography. The
 * glyph is the crowd's own badge shape, so the reader meets the same mark on
 * the figure as in the list.
 *
 * It stands behind the project card's colour-key disclosure, next to the layer
 * view: both answer "what is this picture made of", and neither is on the screen
 * at arrival, where the word budget lives.
 */
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
import { ROLE_GLYPH } from "../city/epheRoles";
import { ROLE_NOTES } from "../city/epheRoleNotes";
import "../design/stadt-ui.css";

export function RoleNotes() {
  const lang = useStore((s) => s.prefs.lang);
  return (
    <div className="ctx-roles" aria-label={t(lang, "roles.title")}>
      <div className="ctx-layers-head">
        <span className="ctx-layers-title">{t(lang, "roles.title")}</span>
        <span className="ctx-layers-note">{t(lang, "roles.explainer")}</span>
      </div>
      <ul className="ctx-role-list">
        {ROLE_NOTES.map((n) => (
          <li
            key={n.role}
            className="ctx-role"
            title={`${t(lang, n.nameKey)} · ${t(lang, n.flaecheKey)}`}
          >
            <span className="ctx-role-glyph" aria-hidden="true">
              {ROLE_GLYPH[n.role]}
            </span>
            <span className="ctx-role-name">{t(lang, n.nameKey)}</span>
            <span className="ctx-role-note">{t(lang, n.noteKey)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
