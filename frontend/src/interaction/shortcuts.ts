/**
 * The keyboard, in one place.
 *
 * Measured before this file existed (headless Chrome 1600×1000, demo city,
 * `protokoll-vorher.log`): five bracket presses on a level that holds only
 * districts changed 3, 5, 3, 3 and 3 of 1000 screen cells against an idle floor
 * of 5 — five presses, zero answers. `p` outside a triage, `Escape` at the
 * root and `Enter` on a focused canvas were equally mute. The shortcut list
 * that is supposed to teach those keys carried 20 rows and named none of the
 * six bindings that live in the components instead of App.tsx (minimap Enter,
 * search arrows, "•••"-menu arrows, Escape = skip the build, Escape = close
 * the primer, the skip button's own key).
 *
 * So this module holds three things and nothing else:
 * - `ROWS` — every binding that actually exists, each one naming the file that
 *   implements it. `tests/keyboardRegistry.test.ts` reads those files and fails
 *   if a key is handled anywhere but listed here, or listed here but handled
 *   nowhere.
 * - `explain()` — the sentence for a press the program cannot apply. A key that
 *   is bound but inapplicable is a defect, not a no-op.
 * - `bracketStep()` — the stepping rule itself: buildings on a level that has
 *   them, districts on a level that has none, which is what makes the bracket
 *   pair work from the root down to a single file without a mouse.
 *
 * Texts carry the i18n key Lane TEXT will give them plus the sentence this lane
 * ships in the meantime (`resolve()` prefers the dictionary the moment the key
 * exists), because §6 forbids inventing keys and forbids silence harder.
 */

import { DICT, plural, t, type Lang } from "../i18n";
import { getDirLayout } from "../city/layout";
import type { CityData } from "../city/types";

// ── Text ────────────────────────────────────────────────────────────────────
export interface Text {
  /** The key the dictionary will carry; falls back to the local pair until then. */
  key: string;
  en: string;
  de: string;
}

function fill(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    raw,
  );
}

export function resolve(lang: Lang, text: Text, vars?: Record<string, string | number>): string {
  const known = Object.prototype.hasOwnProperty.call(DICT, text.key);
  return known ? t(lang, text.key as keyof typeof DICT, vars) : fill(text[lang], vars);
}

// ── The registry ────────────────────────────────────────────────────────────
export type GroupId = "nav" | "camera" | "map" | "triage" | "tour" | "build" | "panels";

export interface Row {
  id: string;
  /** What the keycap shows. */
  keys: string[];
  /** Machine names, matched against the handlers by the registry test. */
  codes: string[];
  group: GroupId;
  /** Frequency in the user's day, not the order the bindings were built in. */
  rank: number;
  text: Text;
  /** File under frontend/src that implements it. Omitted for mouse gestures. */
  owner?: string;
}

const T = (key: string, en: string, de: string): Text => ({ key, en, de });

export const GROUP_LABELS: Record<GroupId, Text> = {
  nav: T("hints.catNavigation", "Reading the city", "Die Stadt lesen"),
  camera: T("hints.catCamera", "Camera", "Kamera"),
  map: T("hints.catMap", "Minimap", "Übersichtskarte"),
  triage: T("hints.catTriage", "Triage", "Triage"),
  tour: T("hints.catTour", "Security Tour", "Security-Tour"),
  build: T("hints.catBuild", "Build & primer", "Bau & Einführung"),
  panels: T("hints.catPanels", "Panels & menus", "Panels & Menüs"),
};

/**
 * Existing keys are reused only where the shipped sentence is still exactly
 * true; everything this lane changed or added carries a requested key.
 */
export const ROWS: Row[] = [
  // ── Reading the city ──────────────────────────────────────────────────────
  {
    id: "search",
    keys: ["/"],
    codes: ["/"],
    group: "nav",
    rank: 1,
    text: T("hints.searchFocus", "Search a file or a language", "Nach Datei oder Sprache suchen"),
    owner: "App.tsx",
  },
  {
    id: "searchCmdK",
    keys: ["⌘/Ctrl", "K"],
    codes: ["K"],
    group: "nav",
    rank: 2,
    text: T(
      "hints.searchFocusCmdK",
      "Search — also while you are typing somewhere",
      "Suche — auch beim Schreiben",
    ),
    owner: "App.tsx",
  },
  {
    id: "stepNext",
    keys: ["]"],
    codes: ["]"],
    group: "nav",
    rank: 3,
    text: T(
      "hints.stepNext",
      "Next building — or the next district on a level without buildings",
      "Nächstes Gebäude — auf einer Ebene ohne Gebäude der nächste Bezirk",
    ),
    owner: "App.tsx",
  },
  {
    id: "stepPrev",
    keys: ["["],
    codes: ["["],
    group: "nav",
    rank: 4,
    text: T(
      "hints.stepPrev",
      "Previous building — or the previous district",
      "Vorheriges Gebäude — oder der vorherige Bezirk",
    ),
    owner: "App.tsx",
  },
  {
    id: "enterTarget",
    keys: ["Enter"],
    codes: ["Enter"],
    group: "nav",
    rank: 5,
    text: T(
      "hints.enterTarget",
      "Enter what is marked: walk into a district, circle a building",
      "Das Markierte öffnen: in einen Bezirk gehen, ein Gebäude umkreisen",
    ),
    owner: "interaction/KeyEcho.tsx",
  },
  {
    id: "escapeChain",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "nav",
    rank: 6,
    text: T(
      "hints.esc",
      "Close panel → up one district → twice at the overview re-frames",
      "Panel schließen → eine Ebene nach oben → zweimal: Übersicht neu einrahmen",
    ),
    owner: "App.tsx",
  },
  {
    id: "hintsToggle",
    keys: ["?"],
    codes: ["?"],
    group: "nav",
    rank: 7,
    text: T("hints.toggle", "Show or hide this list", "Diese Liste ein- oder ausblenden"),
    owner: "App.tsx",
  },
  {
    id: "callResident",
    keys: ["C"],
    codes: ["C"],
    group: "nav",
    rank: 8,
    text: T(
      "hints.callResident",
      "Call a resident and ask for the way",
      "Einen Bewohner rufen und nach dem Weg fragen",
    ),
    owner: "App.tsx",
  },
  // X: the X-ray state. Held down, the raw numbers that shaped the aimed
  // tower stand on one plate — released, the plate is gone. It stays in the
  // reading group because it is how you read a building, not a camera trick;
  // the handler lives in the HUD that paints the plate.
  {
    id: "xrayRaw",
    keys: ["X"],
    codes: ["X"],
    group: "nav",
    rank: 9,
    text: T(
      "hints.xrayRaw",
      "Hold — the raw numbers of the tower you aim at",
      "Halten — die Rohzahlen des Turms, den du ansiehst",
    ),
    owner: "components/HudOverlay.tsx",
  },

  // ── Camera ────────────────────────────────────────────────────────────────
  {
    id: "camTurn",
    keys: ["←", "→"],
    codes: ["ArrowLeft", "ArrowRight"],
    group: "camera",
    rank: 10,
    text: T(
      "hints.camTurn",
      "Turn around the city — the view stays framed",
      "Um die Stadt herum — der Ausschnitt bleibt im Bild",
    ),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camElevation",
    keys: ["↑", "↓"],
    codes: ["ArrowUp", "ArrowDown"],
    group: "camera",
    rank: 11,
    text: T("hints.camElevation", "Raise / lower the viewpoint", "Blickpunkt heben / senken"),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camPan",
    keys: ["W", "A", "S", "D"],
    codes: ["W", "A", "S", "D"],
    group: "camera",
    rank: 12,
    text: T("hints.camPan", "Pan through the city", "Durch die Stadt schwenken"),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camHeight",
    keys: ["Q", "E"],
    codes: ["Q", "E"],
    group: "camera",
    rank: 13,
    text: T("hints.camHeight", "Rise / descend", "Höher / tiefer"),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camZoom",
    keys: ["Wheel"],
    codes: [],
    group: "camera",
    rank: 14,
    text: T(
      "hints.camZoom",
      "Zoom — from the overview down to street level",
      "Zoomen — von der Übersicht bis auf Straßenniveau",
    ),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camDrag",
    keys: ["Drag"],
    codes: [],
    group: "camera",
    rank: 15,
    text: T("hints.camDrag", "Drag — look around freely", "Ziehen — frei umsehen"),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camRightPan",
    keys: ["RMB", "Drag"],
    codes: [],
    group: "camera",
    rank: 16,
    text: T("hints.camRightPan", "Right mouse button — pan", "Rechte Maustaste — schwenken"),
    owner: "components/CameraRig.tsx",
  },
  {
    id: "camOrbit",
    keys: ["2×", "Click"],
    codes: [],
    group: "camera",
    rank: 17,
    text: T(
      "hints.camOrbit",
      "Double-click a building — circle it to inspect (Enter does the same)",
      "Doppelklick auf ein Gebäude — umkreisen und inspizieren (Enter ebenso)",
    ),
    owner: "App.tsx",
  },
  {
    id: "camOrbitExit",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "camera",
    rank: 18,
    text: T("hints.camOrbitExit", "Esc — back to free camera", "Esc — zurück zur freien Kamera"),
    owner: "App.tsx",
  },

  // ── Minimap ───────────────────────────────────────────────────────────────
  {
    id: "mapTake",
    keys: ["Tab"],
    // Reaching the map is the browser's own tab order, not a handler.
    codes: [],
    group: "map",
    rank: 20,
    text: T(
      "hints.mapFocus",
      "Tab reaches the minimap in the corner",
      "Tab erreicht die Übersichtskarte in der Ecke",
    ),
  },
  {
    id: "mapAim",
    keys: ["←", "→", "↑", "↓"],
    codes: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
    group: "map",
    rank: 21,
    text: T("hints.mapAim", "Move the marker on the map", "Die Markierung auf der Karte bewegen"),
    owner: "components/Minimap.tsx",
  },
  {
    id: "mapFly",
    keys: ["Enter", "Space"],
    codes: ["Enter", "Space"],
    group: "map",
    rank: 22,
    text: T(
      "hints.mapFly",
      "Fly to the marker — the same place a click flies to",
      "Zum Marker fliegen — dieselbe Stelle wie per Klick",
    ),
    owner: "components/Minimap.tsx",
  },
  {
    id: "mapClick",
    keys: ["Click"],
    codes: [],
    group: "map",
    rank: 23,
    text: T(
      "hints.mapClick",
      "Click the map — moves the marker and flies there",
      "Klick auf die Karte — setzt den Marker und fliegt hin",
    ),
    owner: "components/Minimap.tsx",
  },

  // ── Triage ────────────────────────────────────────────────────────────────
  {
    id: "triageNext",
    keys: ["N"],
    codes: ["N"],
    group: "triage",
    rank: 30,
    text: T(
      "hints.triageNext",
      "Next finding without a verdict (Triage)",
      "Nächster Fund ohne Urteil (Triage)",
    ),
    owner: "App.tsx",
  },
  {
    id: "triagePrev",
    keys: ["P"],
    codes: ["P"],
    group: "triage",
    rank: 31,
    text: T(
      "hints.triagePrev",
      "Previous finding without a verdict (Triage)",
      "Vorheriger Fund ohne Urteil (Triage)",
    ),
    owner: "App.tsx",
  },
  {
    id: "triageEnd",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "triage",
    rank: 32,
    text: T("hints.triageEsc", "End the triage round", "Triage-Reihe beenden"),
    owner: "App.tsx",
  },

  // ── Security tour ─────────────────────────────────────────────────────────
  {
    id: "tourNav",
    keys: ["←", "→"],
    codes: ["ArrowLeft", "ArrowRight"],
    group: "tour",
    rank: 40,
    text: T("hints.tourNav", "Previous / next finding (Tour)", "Vorheriger / nächster Fund (Tour)"),
    owner: "components/SecurityTour.tsx",
  },
  {
    id: "tourEnter",
    keys: ["Enter"],
    codes: ["Enter"],
    group: "tour",
    rank: 41,
    text: T("hints.tourEnter", "Next finding (Tour)", "Nächster Fund (Tour)"),
    owner: "components/SecurityTour.tsx",
  },
  {
    id: "tourEsc",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "tour",
    rank: 42,
    text: T("hints.tourEsc", "Exit the tour", "Tour beenden"),
    owner: "components/SecurityTour.tsx",
  },

  // ── Build & primer ────────────────────────────────────────────────────────
  {
    id: "skipBuild",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "build",
    rank: 50,
    text: T(
      "hints.skipBuild",
      "Skip the build animation (the button under it has no key of its own)",
      "Bau-Animation überspringen (der Knopf darunter hat keine eigene Taste)",
    ),
    owner: "App.tsx",
  },
  {
    id: "skipPrimer",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "build",
    rank: 51,
    text: T(
      "hints.primerEsc",
      "Hide the intro primer on the first visit",
      "Einführungs-Panel beim ersten Besuch ausblenden",
    ),
    owner: "components/CoachMarks.tsx",
  },

  // ── Panels & menus ────────────────────────────────────────────────────────
  {
    id: "searchWalk",
    keys: ["↑", "↓"],
    codes: ["ArrowUp", "ArrowDown"],
    group: "panels",
    rank: 60,
    text: T(
      "hints.searchResults",
      "In the search field: walk the results",
      "Im Suchfeld: Ergebnisse durchgehen",
    ),
    owner: "components/SearchBar.tsx",
  },
  {
    id: "searchOpen",
    keys: ["Enter"],
    codes: ["Enter"],
    group: "panels",
    rank: 61,
    text: T(
      "hints.searchOpen",
      "In the search field: open the marked result",
      "Im Suchfeld: das markierte Ergebnis öffnen",
    ),
    owner: "components/SearchBar.tsx",
  },
  {
    id: "searchClose",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "panels",
    rank: 62,
    text: T(
      "hints.searchClose",
      "In the search field: close the results",
      "Im Suchfeld: Ergebnisliste schließen",
    ),
    owner: "components/SearchBar.tsx",
  },
  {
    id: "menuOpen",
    keys: ["Enter", "Space", "↓"],
    codes: ["ArrowDown", "ArrowUp"],
    group: "panels",
    rank: 63,
    text: T(
      "hints.menuOpen",
      "On the „•••“-button: open the menu",
      "Auf dem „•••“-Knopf: Menü öffnen",
    ),
    owner: "components/ActionBar.tsx",
  },
  {
    id: "menuWalk",
    keys: ["↑", "↓", "Home", "End"],
    codes: ["ArrowUp", "ArrowDown", "Home", "End"],
    group: "panels",
    rank: 64,
    text: T(
      "hints.menuWalk",
      "In the „•••“-menu: walk the entries",
      "Im „•••“-Menü: Einträge durchgehen",
    ),
    owner: "components/ActionBar.tsx",
  },
  {
    id: "menuClose",
    keys: ["Esc", "Tab"],
    codes: ["Escape", "Tab"],
    group: "panels",
    rank: 65,
    text: T("hints.menuClose", "Close the „•••“-menu", "„•••“-Menü schließen"),
    owner: "components/ActionBar.tsx",
  },
  {
    id: "settingsEsc",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "panels",
    rank: 66,
    text: T(
      "hints.settingsEsc",
      "Close the scan-settings panel",
      "Panel für Scan-Einstellungen schließen",
    ),
    owner: "components/AnalyzePanel.tsx",
  },
  {
    id: "findingsEsc",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "panels",
    rank: 67,
    text: T("hints.findingsEsc", "Close the findings list", "Fundliste schließen"),
    owner: "components/FindingsPanel.tsx",
  },
  // Two dialogs the first pass of the list missed whole: both close on one
  // Escape, both were proven in the browser (Menü → „Stadtbild oder -video" →
  // ein Esc-Druck schließt das Studio), and neither had a row naming its file.
  {
    id: "shareStudioEsc",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "panels",
    rank: 69,
    text: T("hints.shareStudioEsc", "Close the share studio", "Share-Studio schließen"),
    owner: "components/ShareStudio.tsx",
  },
  {
    id: "profileConfirmEsc",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "panels",
    rank: 70,
    text: T(
      "hints.profileConfirmEsc",
      "Discard the project card being confirmed",
      "Zu bestätigende Profil-Karte verwerfen",
    ),
    owner: "components/ProfileConfirmDialog.tsx",
  },
  {
    id: "hintsEsc",
    keys: ["Esc"],
    codes: ["Escape"],
    group: "panels",
    rank: 68,
    text: T(
      "hints.hintsDialogEsc",
      "Close this list (Tab stays inside it while it is open)",
      "Diese Liste schließen (Tab bleibt, solange sie offen ist)",
    ),
    owner: "components/KeyboardHints.tsx",
  },
  // Z: the Celeste door. The access options live in ONE named section of the
  // ••• menu; this key opens the menu with the caret already inside it, so
  // asking for a calmer or clearer city costs one deliberate press and never
  // a hunt. Implemented in the dock itself, beside the menu it opens.
  {
    id: "accessField",
    keys: ["Z"],
    codes: ["Z"],
    group: "panels",
    rank: 71,
    text: T(
      "hints.accessField",
      "Open the access options — effects, color-safe palette, language",
      "Zugangsoptionen öffnen — Effekte, farbsichere Palette, Sprache",
    ),
    owner: "components/ActionBar.tsx",
  },
];

export function rowsByRank(rows: Row[] = ROWS): Row[] {
  return [...rows].sort((a, b) => a.rank - b.rank);
}

/** Groups in the order their most frequent row lands. */
export function groupOrder(rows: Row[] = ROWS): GroupId[] {
  const seen: GroupId[] = [];
  for (const r of rowsByRank(rows)) if (!seen.includes(r.group)) seen.push(r.group);
  return seen;
}

// ── Keyboard vs. mouse: which one drove last ────────────────────────────────
let lastInputKeyboard = false;

export function noteInput(modality: "keyboard" | "pointer"): void {
  lastInputKeyboard = modality === "keyboard";
}

/**
 * The tooltip is a pointer instrument; a keyboard user has no pointer to sit
 * still on. It follows the selection only while the keyboard was the last hand
 * on the machine, so a mouse reader never gets a panel pinned over the city.
 */
export function inputIsKeyboard(): boolean {
  return lastInputKeyboard;
}

// ── Stepping through a level ────────────────────────────────────────────────
export interface StepTarget {
  kind: "file" | "district" | "none";
  fileId?: string;
  /** District branch: the child directory name to drill into. */
  dirName?: string;
  dirPath?: string;
  reason?: "no-city" | "empty-level";
}

export interface StepInput {
  cityData: CityData | null;
  focusPath: string[];
  /** The selected file id, or null. */
  currentFileId: string | null;
  /** The district currently marked, or null. */
  currentDirPath: string | null;
  forward: boolean;
}

/**
 * The bracket pair's whole rule. A level either has file buildings (the plaza)
 * or it does not (a level that only holds child districts) — and the audit's
 * silent case was exactly the second kind: `App.tsx` returned without a word.
 * Walking the districts is the honest fix: it makes the level operable and
 * leaves the file walk byte-identical, so the camera flight, InfoPanel and
 * focus-tier dimming keep working through the same `navigateToFile`.
 */
export function bracketStep(input: StepInput): StepTarget {
  const { cityData, focusPath, currentFileId, currentDirPath, forward } = input;
  if (!cityData) return { kind: "none", reason: "no-city" };
  const layout = getDirLayout(cityData, focusPath);

  if (layout.buildings.length > 0) {
    const at = currentFileId ? layout.buildings.findIndex((b) => b.file.id === currentFileId) : -1;
    const last = layout.buildings.length - 1;
    const next = forward ? (at >= last ? 0 : at + 1) : at <= 0 ? last : at - 1;
    const b = layout.buildings[next];
    return b ? { kind: "file", fileId: b.file.id } : { kind: "none", reason: "empty-level" };
  }

  if (layout.blocks.length === 0) return { kind: "none", reason: "empty-level" };
  const at = currentDirPath ? layout.blocks.findIndex((b) => b.dir.path === currentDirPath) : -1;
  const last = layout.blocks.length - 1;
  const next = forward ? (at >= last ? 0 : at + 1) : at <= 0 ? last : at - 1;
  const block = layout.blocks[next];
  if (!block) return { kind: "none", reason: "empty-level" };
  return {
    kind: "district",
    dirName: block.dir.name,
    dirPath: block.dir.path,
  };
}

// ── The press, and what the world looks like when it lands ──────────────────
export interface Press {
  key: string;
  code: string;
  meta: boolean;
  ctrl: boolean;
  /** True when the event target is a field the person is writing into. */
  typing: boolean;
  /** True when an `aria-modal` dialog holds the keyboard. */
  modalOpen: boolean;
  /** True when the press landed on the 3D view (or nowhere in particular). */
  onCanvas: boolean;
}

export interface World {
  hasCity: boolean;
  focusPath: string[];
  buildings: number;
  blocks: number;
  selectedFileId: string | null;
  markedDistrict: string | null;
  cameraMode: "free" | "orbit";
  triageActive: boolean;
  /** Findings the current filters put in the triage queue. */
  triageSize: number;
  /** Findings in that queue still without a verdict. */
  triageOpen: number;
  tourActive: boolean;
  constructing: boolean;
  primerVisible: boolean;
  hasSearchField: boolean;
}

/**
 * Keys whose whole subject is a city. Enter and Space are NOT in here: on the
 * landing they belong to whichever button has focus, and taking that away from
 * it would be a worse defect than the silence this answers.
 */
const CITY_KEYS = new Set(["[", "]", "/", "n", "p"]);

/**
 * The keyboard half of the camera group, read off the registry itself rather
 * than typed in again: `camOrbitExit` is Escape, which answers for itself, and
 * the mouse rows carry no code. A camera key added to ROWS joins this set on its
 * own — which is the point, because the defect this closes was five of these
 * keys moving the landing's picture without saying a word (measured: 26, 20,
 * 137, 134 and 40 of 1000 screen cells against an idle spread of at most 4).
 */
const CAMERA_KEYS = new Set(
  ROWS.filter((r) => r.group === "camera" && r.id !== "camOrbitExit")
    .flatMap((r) => r.codes)
    .map((c) => c.toLowerCase()),
);

const isPalette = (press: Press): boolean =>
  (press.key.toLowerCase() === "k" || press.code === "KeyK") && (press.meta || press.ctrl);

/**
 * The one question this answers: the person pressed a key this program knows,
 * and in this state it cannot use it. Returning null is only right when the key
 * DID something, or when a field / dialog / the tour owns it and answered it in
 * its own way. A key that is simply not bound is not a defect — the audit
 * counted the app ignoring stray letters as correct behaviour, and answering
 * every mis-hit would be its own noise.
 */
export function explain(press: Press, world: World): Text | null {
  if (press.typing) return null;
  const key = press.key;

  if (world.hasCity && world.primerVisible && key === "Escape") {
    // CoachMarks swallows this one in capture phase — it does answer, silently.
    return null;
  }

  if (!world.hasCity && (CITY_KEYS.has(key) || isPalette(press))) {
    return T(
      "keys.noCity",
      "No city yet — pick a folder first; [ ] and / work inside a city",
      "Noch keine Stadt — erst einen Ordner öffnen; [ ] und / arbeiten in der Stadt",
    );
  }

  // The landing's picture is the same canvas as the city, so the camera keys
  // really do move it here. Silence made that look like a broken city; the
  // sentence says what moved and what is still missing.
  if (!world.hasCity && CAMERA_KEYS.has(key.toLowerCase())) {
    return T(
      "keys.cameraNoCity",
      "These keys steer the camera — over the land in front of the first city, until a folder has been read",
      "Diese Tasten steuern die Kamera — über das Land vor der ersten Stadt, bis ein Ordner gelesen ist",
    );
  }

  if (!world.hasCity && key === "x") {
    // X belongs to a building, and the landing has none; the HUD that would
    // answer is not even mounted here. Say what the key is for before it can
    // read as broken.
    return T(
      "keys.xrayNoCity",
      "No city yet — X lays the raw numbers over a tower you aim at; pick a folder first",
      "Noch keine Stadt — X legt die Rohzahlen über einen anvisierten Turm; erst einen Ordner öffnen",
    );
  }

  if (
    press.modalOpen &&
    (key === "[" || key === "]" || key === "n" || key === "p" || key === "x")
  ) {
    return T(
      "keys.modalHolds",
      "The shortcut list holds the keys now — Esc closes it",
      "Die Kürzelliste hält die Tasten — Esc schließt sie",
    );
  }

  if (world.tourActive && (key === "[" || key === "]")) {
    return T(
      "keys.tourHolds",
      "The tour is driving — ← → go finding to finding, Esc ends it",
      "Die Tour führt gerade — ← → gehen von Fund zu Fund, Esc beendet sie",
    );
  }

  if (key === "p" && !world.triageActive) {
    return T(
      "keys.triageNotRunning",
      "No triage is running — n starts the round of open findings",
      "Es läuft keine Triage-Reihe — n startet die Reihe der offenen Funde",
    );
  }

  if (key === "n") {
    if (world.triageActive && world.triageOpen === 0) {
      return T(
        "keys.triageAllJudged",
        "Every finding in this list has a verdict — p steps back, Esc ends the round",
        "Jeder Fund dieser Liste hat ein Urteil — p geht zurück, Esc beendet die Reihe",
      );
    }
    if (!world.triageActive && world.triageSize === 0) {
      return T(
        "keys.triageEmpty",
        "This filter leaves no findings to judge — n starts on a list with entries",
        "Diese Filterung lässt keine Funde zum Urteilen — n startet mit einer Liste, die Einträge hat",
      );
    }
  }

  if ((key === "Enter" || key === " ") && press.onCanvas) {
    if (world.cameraMode === "orbit") return null; // KeyEcho ends the orbit
    if (world.markedDistrict || world.selectedFileId) return null; // KeyEcho acts
    return T(
      "keys.noTarget",
      "Nothing is marked yet — [ ] marks a district or a building, Enter opens it",
      "Noch ist nichts markiert — [ ] markiert Bezirk oder Gebäude, Enter öffnet es",
    );
  }

  if (key === "[" || key === "]") {
    if (!world.hasCity) return null; // answered above
    if (world.buildings === 0 && world.blocks === 0) {
      return T(
        "keys.emptyLevel",
        "Nothing stands on this level — Esc goes up a district, / searches a file",
        "Auf dieser Ebene steht nichts — Esc geht eine Ebene hoch, / sucht eine Datei",
      );
    }
    // With districts on the level the brackets step them (KeyEcho), so this is
    // an action, not a refusal.
    return null;
  }

  if (key === "Escape" && world.hasCity && !world.constructing) {
    const nothingToClose =
      !world.selectedFileId &&
      world.focusPath.length === 0 &&
      !world.triageActive &&
      !world.tourActive &&
      !world.markedDistrict &&
      world.cameraMode === "free";
    if (nothingToClose) {
      return T(
        "keys.escapeArmed",
        "Once more within half a second — Esc Esc re-frames the overview",
        "Nochmal innerhalb einer halben Sekunde — Esc Esc rahmt die Übersicht neu",
      );
    }
  }

  return null;
}

/**
 * What a newly marked district is worth: the number the marker stands for, and
 * the key that acts on it. The sentence carries the measurement, because a
 * marker that says only "selected" teaches nothing about the plot it sits on.
 *
 * Each number carries its own noun, agreed with the count: the sentence used to
 * put the noun in the template and the number in the gap, which read "1 Funde"
 * and "1 Unterbezirke" in German and hid behind "finding(s)" in English.
 */
export function districtMarked(
  lang: Lang,
  mark: { name: string; files: number; findings: number; children: number },
): string {
  const de = lang === "de";
  const vars = {
    name: mark.name,
    files: plural(lang, mark.files, de ? "Datei" : "file", de ? "Dateien" : "files"),
    findings: plural(lang, mark.findings, de ? "Fund" : "finding", de ? "Funde" : "findings"),
    children: plural(
      lang,
      mark.children,
      de ? "Unterbezirk" : "sub-district",
      de ? "Unterbezirke" : "sub-districts",
    ),
  };
  if (mark.findings > 0) {
    return resolve(
      lang,
      T(
        "keys.districtMarkedAlarm",
        "District {name} — {findings} here, {files}, Enter walks in",
        "Bezirk {name} — {findings} hier, {files}, Enter geht hinein",
      ),
      vars,
    );
  }
  return resolve(
    lang,
    T(
      "keys.districtMarked",
      "District {name} — {files}, {children}, Enter walks in",
      "Bezirk {name} — {files}, {children}, Enter geht hinein",
    ),
    vars,
  );
}
