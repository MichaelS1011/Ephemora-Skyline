import { useEffect, useMemo, useRef } from "react";
import { useStore, triageList, nextOpenTriageIndex } from "../stores/useStore";
import { findFileById, getDirLayout } from "../city/layout";
import { parseEpheKey } from "../city/epheIdentity";
import { isDurableAddress, loadEpheNamesRead, NAME_MAX } from "../epheNames";
import { t } from "../i18n";
import type { EpheRole } from "../city/epheRoles";
import "../design/stadt-ui.css";

/** The role names the badge already uses — one word per role, not a second list. */
const ROLE_KEY: Record<EpheRole, "guide.badge" | "guide.securityBadge" | "guide.maintenanceBadge"> =
  {
    explorer: "guide.badge",
    security: "guide.securityBadge",
    maintenance: "guide.maintenanceBadge",
  };

/**
 * The one thing the reader can ask a resident: show me the highest open risk.
 *
 * The card is deliberately not a chat. It knows the current city's triage
 * order, points the resident at that building, then lets the existing camera
 * flight open the file. The resident never invents a finding, never writes a
 * verdict, and the card disappears the moment the city is left.
 */
export function ResidentCard() {
  const lang = useStore((s) => s.prefs.lang);
  const cityData = useStore((s) => s.cityData);
  const reviews = useStore((s) => s.reviews);
  const selected = useStore((s) => s.selectedResident);
  const selectResident = useStore((s) => s.selectResident);
  const pointResidentAt = useStore((s) => s.pointResidentAt);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);

  const list = useMemo(() => (cityData ? triageList(cityData, "all", null) : []), [cityData]);
  const openIndex = cityData ? nextOpenTriageIndex(list, reviews, 0, 1) : -1;
  const target = openIndex >= 0 ? list[openIndex] : undefined;
  const finding = target?.file.findings[target.index];

  const building = useMemo(() => {
    if (!cityData || !target) return null;
    const hit = findFileById(cityData, target.file.id);
    if (!hit) return null;
    return (
      getDirLayout(cityData, hit.chain).buildings.find((b) => b.file.id === target.file.id) ?? null
    );
  }, [cityData, target]);

  const identityKey = useStore((s) => s.residentIdentity);
  const role = useStore((s) => s.residentRole);
  const names = useStore((s) => s.residentNames);
  const nameResident = useStore((s) => s.nameResident);
  const namesBlocked = useStore((s) => s.residentNamesBlocked);
  const guideErrand = useStore((s) => s.guide);
  const guidePhase = useStore((s) => s.guidePhase);
  // A names bucket that could not be read is not "this project has no names"
  // — the card that shows an unnamed resident owes the reader that fact, and
  // the bytes are kept in the `:unreadable` slot until a re-naming replaces
  // the live copy (`storageRead.ts`).
  const namesUnreadable = useMemo(
    () => loadEpheNamesRead(cityData).state === "unreadable",
    [cityData],
  );
  const name = identityKey ? (names[identityKey] ?? "") : "";
  const home = useMemo(() => {
    if (!cityData || !identityKey) return null;
    const plot = parseEpheKey(identityKey)?.plot;
    if (!plot) return null;
    const hit = findFileById(cityData, plot);
    return hit ? { name: hit.file.name, path: hit.file.path } : null;
  }, [cityData, identityKey]);

  useEffect(() => {
    (target ? primaryRef.current : closeRef.current)?.focus();
  }, [selected, target]);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (selected === null) return null;

  // The errand of THIS figure: the guide slot names the role that is on it, and
  // a card that showed another resident's task would hand one body's work to a
  // stranger.
  const task =
    role && guideErrand && guideErrand.role === role
      ? t(lang, guidePhase === "arrived" ? "resident.taskPointing" : "resident.taskWalking", {
          file: cityData ? (findFileById(cityData, guideErrand.targetFileId)?.file.name ?? "") : "",
        })
      : t(lang, "resident.taskNone");

  const close = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    selectResident(null);
    document.querySelector<HTMLElement>(".city-canvas")?.focus();
  };

  const guide = (): void => {
    if (!target || !finding || timerRef.current !== null) return;
    // The resident turns first; the camera leaves after a short beat so the
    // reader sees who pointed the way.
    if (building) pointResidentAt(building.x, building.z, Date.now() + 1400);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      navigateToFile(target.file.id);
      selectResident(null);
      document.querySelector<HTMLElement>(".city-canvas")?.focus();
    }, 1400);
  };

  return (
    <div className="resident-card" role="region" aria-label={t(lang, "resident.region")}>
      <div className="resident-card-head">
        <span className="resident-kicker">{t(lang, "resident.kicker")}</span>
        <button
          ref={closeRef}
          type="button"
          className="resident-close"
          onClick={close}
          aria-label={t(lang, "resident.close")}
          title={t(lang, "resident.close")}
        >
          ✕
        </button>
      </div>
      <p className="resident-title">{name || t(lang, "resident.title")}</p>
      {home && (
        // EPHE-AI EA-01 — who this is, in terms that outlive the level. The
        // reader clicked one body; the address says which door it belongs to,
        // so a name or a job can be given to the same resident tomorrow.
        <p className="resident-target" title={home.path}>
          {t(lang, "resident.home")} · {home.name}
        </p>
      )}
      <p className="resident-role">
        {t(lang, "resident.roleLabel")} ·{" "}
        {role ? t(lang, ROLE_KEY[role]) : t(lang, "resident.roleNone")}
        {" · "}
        {t(lang, "resident.taskLabel")} · {task}
      </p>
      {identityKey && (
        // EA-02 — the card keeps its one verb. A name is not a second action,
        // it is the reader deciding that this figure is theirs, so it is a
        // field that commits as it is typed, not a button that competes.
        //
        // §04.03 — the field's own limit counts UTF-16 code units while the
        // model's counts characters, so it is set to twice NAME_MAX: at 24 the
        // browser cut an emoji name in half before `normaliseName` ever saw it
        // (measured: 30 residents came back as 12). The character rule lives in
        // one place, and this attribute only stops the field running away.
        <div className="resident-claim">
          <label className="resident-claim-label" htmlFor="ephe-name">
            {t(lang, "resident.claim")}
          </label>
          <input
            id="ephe-name"
            className="resident-claim-input"
            type="text"
            maxLength={NAME_MAX * 2}
            value={name}
            placeholder={t(
              lang,
              identityKey.startsWith("plot:") ? "resident.claimHint" : "resident.claimLevel",
            )}
            onChange={(event) => nameResident(identityKey, event.target.value)}
          />
          {namesBlocked && isDurableAddress(identityKey) && (
            // The field's own hint promises the project, and the write was
            // refused. Saying nothing here would let the promise stand.
            <p className="resident-role">{t(lang, "resident.claimBlocked")}</p>
          )}
          {namesUnreadable && (
            // The other half of the same promise: the names this project has
            // on the machine could not be read. Word and glyph, never colour.
            <p className="resident-role" role="status" data-resident-names-unreadable="true">
              ⚠ {t(lang, "resident.namesUnreadable")}
            </p>
          )}
        </div>
      )}
      {target && finding ? (
        <p className="resident-target" title={`${target.file.path}:${finding.line}`}>
          {t(lang, "resident.highest")} · {target.file.path}:{finding.line}
        </p>
      ) : (
        <p className="resident-target">{t(lang, "resident.allReviewed")}</p>
      )}
      <button
        ref={primaryRef}
        type="button"
        className="resident-action"
        onClick={guide}
        disabled={!target || !finding}
      >
        {t(lang, "resident.risk")}
      </button>
    </div>
  );
}
