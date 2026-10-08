import { useEffect, useRef, useState } from "react";
import { useStore, triageList, openTriageCount } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import {
  bracketStep,
  districtMarked,
  explain,
  noteInput,
  resolve,
  type Press,
  type World,
} from "./shortcuts";
import { clearKeyboardMark, getKeyboardMark, setKeyboardMark } from "./keyboardMark";
import "../design/griff.css";

/**
 * The answer to a key press.
 *
 * Two jobs, one component: it says the sentence when a bound key cannot be
 * applied in this state, and it performs the one walk `App.tsx` never did — the
 * bracket pair over a level that holds districts instead of buildings. Mounted
 * from KeyboardHints, which App renders unconditionally, so it is listening even
 * while the shortcut list is closed.
 *
 * Why a listener here rather than a change in App.tsx: `App.tsx` belongs to Lane
 * STAAT this wave (plan.md §4), and the request to fold both halves into
 * `bracketStep()` is filed in `devteam/requests/welt-griff.md`. Until that lands
 * the split is exact — App acts on every level that has buildings, this component
 * acts on the ones that have none — so no key is ever handled twice.
 */

/** How long a sentence stays: 6 s, the audit's own reading beat for 90-char lines. */
const NOTICE_MS = 6000;
/** App re-frames the overview on a second Escape inside this window. */
const ESCAPE_WINDOW_MS = 500;

const LOST_VIEW = {
  key: "keys.cityLostView",
  en: "The city is out of your frame — ◎ brings it back, twice Esc does the same",
  de: "Die Stadt ist außerhalb deines Bildes — ◎ bringt sie zurück, zweimal Esc ebenso",
};

const LIFT_MARK = {
  key: "keys.markLifted",
  en: "Mark lifted — [ ] marks a district or a building again",
  de: "Markierung aufgehoben — [ ] markiert wieder Bezirk oder Gebäude",
};

const LEVEL_ENTERED = {
  key: "keys.levelEntered",
  en: "District {name} — {buildings} building(s) on its plaza, [ ] steps through them",
  de: "Bezirk {name} — {buildings} Gebäude auf der Plaza, [ ] schaltet sie durch",
};

const LEVEL_DISTRICTS = {
  key: "keys.levelDistricts",
  en: "District {name} — no buildings of its own, {children} district(s) below, [ ] steps them",
  de: "Bezirk {name} — keine eigenen Gebäude, {children} Unterbezirke, [ ] schaltet sie durch",
};

const ORBIT_STARTED = {
  key: "keys.orbitStarted",
  en: "Circling {name} — Esc frees the camera",
  de: "{name} wird umkreist — Esc gibt die Kamera frei",
};

const EXIT_ORBIT = {
  key: "keys.orbitReleased",
  en: "Camera released — it flies free again",
  de: "Kamera wieder frei",
};

function readWorld(): World {
  const s = useStore.getState();
  const city = s.cityData;
  const layout = city ? getDirLayout(city, s.focusPath) : null;
  const list = city ? triageList(city, s.threatFilter, s.ruleFilter) : [];
  return {
    hasCity: !!city,
    focusPath: s.focusPath,
    buildings: layout?.buildings.length ?? 0,
    blocks: layout?.blocks.length ?? 0,
    selectedFileId: s.selectedUnit?.kind === "file" ? s.selectedUnit.id : null,
    markedDistrict: getKeyboardMark()?.path ?? null,
    cameraMode: s.cameraMode,
    triageActive: s.triageActive,
    triageSize: list.length,
    triageOpen: openTriageCount(list, s.reviews),
    tourActive: s.tourActive,
    constructing: s.buildPhase === "constructing",
    primerVisible: !!document.querySelector(".city-coach"),
    hasSearchField: !!document.querySelector("input[data-search-input]"),
  };
}

function readPress(e: KeyboardEvent): Press {
  const el = (e.target ?? document.body) as HTMLElement;
  const typing =
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
  return {
    key: e.key,
    code: e.code,
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    typing,
    modalOpen: !!document.querySelector('[aria-modal="true"]'),
    // The 3D view owns Enter and Space: it is the one focusable thing that is
    // not a control. A press that lands on a button belongs to that button.
    onCanvas: el === document.body || !!el.closest?.(".city-canvas"),
  };
}

export function KeyEcho() {
  const lang = useStore((s) => s.prefs.lang);
  const focusPath = useStore((s) => s.focusPath);
  const cityData = useStore((s) => s.cityData);
  const lostView = useStore((s) => s.cityLostView);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEscapeAt = useRef(0);

  const say = (text: string | null): void => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(text);
    if (text) {
      timer.current = setTimeout(() => setNotice(null), NOTICE_MS);
    }
  };

  // The rescue is a button the pilot has already flown past — and while a panel
  // holds the keyboard trap, Tab cannot reach it (measured: 30 Tab steps, the
  // focus stayed in the file panel). The state change therefore speaks for
  // itself, in the same live region as every other answer.
  //
  // Held back for 800 ms, because a long flight crosses the threshold on the
  // way: measured, `n` flying to a tower 200 m off triggered the sentence mid
  // flight, where the city was simply not arrived at yet.
  useEffect(() => {
    if (!lostView) return;
    const at = setTimeout(() => say(resolve(lang, LOST_VIEW)), 800);
    return () => clearTimeout(at);
  }, [lostView, lang]);

  // Leaving a level drops the mark: the block list is a different one, and a
  // marker for a plot that is no longer on screen would be a lie.
  useEffect(() => {
    const mark = getKeyboardMark();
    if (!mark) return;
    clearKeyboardMark();
    const s = useStore.getState();
    if (s.hoveredId === `block:${mark.path}`) s.setHoveredId(null);
    setNotice(null);
  }, [focusPath, cityData]);

  useEffect(() => {
    const onPointerDown = (): void => noteInput("pointer");
    const onKeyDown = (e: KeyboardEvent): void => {
      noteInput("keyboard");
      const press = readPress(e);
      if (press.typing) return;
      const world = readWorld();
      const store = useStore.getState();
      let acted = false;
      // Every press starts from silence. Whatever this key ends up doing — an
      // action in App, an action here, or a sentence — the line must never show
      // what the PREVIOUS press said: measured, an Escape that drilled a level
      // out left the sentence about the level being left on screen.
      if (!e.repeat) say(null);

      if (press.key === "Escape" && !press.modalOpen) {
        if (world.markedDistrict && world.cameraMode === "free") {
          // Escape on a marked district lifts the mark — the level chain in
          // App.tsx has nothing to do there (no selection, no drill-out at the
          // root), and a mark that survives its own dismissal key is a lie.
          clearKeyboardMark();
          if (store.hoveredId?.startsWith("block:")) store.setHoveredId(null);
          e.preventDefault();
          acted = true;
          say(resolve(lang, LIFT_MARK));
        }
        const nothingToClose =
          world.hasCity &&
          !world.constructing &&
          !world.triageActive &&
          !world.tourActive &&
          !world.selectedFileId &&
          !world.markedDistrict &&
          world.focusPath.length === 0 &&
          world.cameraMode === "free";
        if (nothingToClose) {
          const now = Date.now();
          const repeat = now - lastEscapeAt.current < ESCAPE_WINDOW_MS;
          lastEscapeAt.current = now;
          if (repeat) {
            // App re-frames on this one — the camera flight is the answer, and
            // the sentence that armed it must not sit there calling itself.
            say(null);
          } else {
            const text = explain(press, world);
            say(text ? resolve(lang, text) : null);
          }
          return;
        }
        lastEscapeAt.current = 0;
      }

      if (press.key === "[" || press.key === "]") {
        const city = store.cityData;
        if (press.modalOpen || world.tourActive || !city) {
          // App's gate declines these too — the refusal is what gets explained.
        } else if (world.buildings === 0) {
          const step = bracketStep({
            cityData: city,
            focusPath: world.focusPath,
            currentFileId: world.selectedFileId,
            currentDirPath: world.markedDistrict,
            forward: press.key === "]",
          });
          if (step.kind === "district" && step.dirPath && step.dirName) {
            const layout = getDirLayout(city, world.focusPath);
            const block = layout.blocks.find((b) => b.dir.path === step.dirPath);
            setKeyboardMark({ kind: "district", path: step.dirPath });
            store.setHoveredId(`block:${step.dirPath}`);
            e.preventDefault();
            acted = true;
            if (block) {
              const findings = Object.values(block.dir.findingsBySeverity).reduce(
                (a, n) => a + n,
                0,
              );
              say(
                districtMarked(lang, {
                  name: block.dir.name,
                  files: block.dir.fileCount,
                  findings,
                  children: block.dir.children.length,
                }),
              );
            }
          }
        }
      }

      if (!acted && (press.key === "Enter" || press.key === " ") && press.onCanvas) {
        if (world.cameraMode === "orbit") {
          store.exitOrbit();
          e.preventDefault();
          acted = true;
          say(resolve(lang, EXIT_ORBIT));
        } else if (world.markedDistrict) {
          const name = world.markedDistrict.split("/").pop() ?? world.markedDistrict;
          clearKeyboardMark();
          store.setHoveredId(null);
          store.drillIn(name);
          e.preventDefault();
          acted = true;
          // The line says what the new level holds — the level's own count, read
          // from its layout, so the sentence is a measurement and not a greeting.
          if (store.cityData) {
            const next = getDirLayout(store.cityData, [...world.focusPath, name]);
            const children = next.blocks.length;
            say(
              resolve(
                lang,
                children > 0 && next.buildings.length === 0 ? LEVEL_DISTRICTS : LEVEL_ENTERED,
                {
                  name,
                  buildings: String(next.buildings.length),
                  children: String(children),
                },
              ),
            );
          }
        } else if (world.selectedFileId && store.cityData) {
          store.focusBuilding(world.selectedFileId);
          e.preventDefault();
          acted = true;
          const b = getDirLayout(store.cityData, world.focusPath).buildings.find(
            (x) => x.file.id === world.selectedFileId,
          );
          say(resolve(lang, ORBIT_STARTED, { name: b?.file.name ?? world.selectedFileId }));
        }
      }

      if (!acted) {
        const text = explain(press, world);
        say(text ? resolve(lang, text) : null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [lang, cityData, focusPath]);

  return (
    <div className="key-echo" data-key-echo={notice ?? ""} role="status" aria-live="polite">
      {notice}
    </div>
  );
}
