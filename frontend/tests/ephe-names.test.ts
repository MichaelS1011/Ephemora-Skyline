// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import {
  isDurableAddress,
  loadEpheNames,
  loadEpheNamesRead,
  NAME_MAX,
  normaliseName,
  NAMES_CAP,
  saveEpheName,
} from "../src/epheNames";
import { bucketKeyFor } from "../src/reviews";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";

/**
 * EPHE-AI EA-03 — a name that outlives the session.
 *
 * The card gave a resident a name in memory (EA-02); this file holds what makes
 * it come back: one localStorage bucket per project, only addresses that name a
 * plot, and an honest answer when the browser refuses the write. The bucket is
 * `bucketKeyFor`, the same function verdicts are stored under, so "this
 * project" means one thing in both stores.
 */

const BUCKET_CITY = city({
  repo: { owner: "local", name: "auth-app", branch: "main" },
  files: [file("src/db.ts", "TypeScript")],
  tree: dir({ path: "", detailFiles: [file("src/db.ts", "TypeScript")] }),
});

const OTHER_CITY = city({
  repo: { owner: "local", name: "other-app", branch: "main" },
  files: [file("src/db.ts", "TypeScript")],
  tree: dir({ path: "", detailFiles: [file("src/db.ts", "TypeScript")] }),
});

const ATLAS = "plot:f-src/db.ts#0";
const KEY = (c: typeof BUCKET_CITY): string => `codecity-ephe-names:${bucketKeyFor(c)}`;

/** Make the next write fail the way a full quota fails. */
function refuseOneWrite(): () => void {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("QuotaExceededError");
  });
  return () => spy.mockRestore();
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), cityData: BUCKET_CITY }, true);
});

afterEach(() => {
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
  vi.restoreAllMocks();
});

describe("the one shape a name takes", () => {
  it("trims and cuts, and the store keeps what the disk will hold", () => {
    expect(normaliseName("  Atlas  ")).toBe("Atlas");
    expect(normaliseName("x".repeat(60))).toHaveLength(NAME_MAX);
    expect(normaliseName(null)).toBe("");
    // The card shows the map and the reload reads the disk; if only one of them
    // normalised, the name would come back as a different word.
    useStore.getState().nameResident(ATLAS, "  Atlas  ");
    expect(useStore.getState().residentNames[ATLAS]).toBe("Atlas");
    expect(loadEpheNames(BUCKET_CITY)[ATLAS]).toBe("Atlas");
  });
});

/**
 * MASTER-2027 §04.03 — the charset and the length of a name.
 *
 * Measured before the rule existed: `U+0000`, `U+200B` and a trailing `U+202E`
 * (right-to-left override) all survived `normaliseName`, an interior newline and
 * a tab survived it too, and `slice(0, 24)` counted UTF-16 code units — so it cut
 * an emoji family in half and left the joiner holding nothing. A name is drawn on
 * a line the reader did not choose; characters that rearrange or hide that line
 * are not letters.
 */
describe("what a name is allowed to contain", () => {
  const invisible = [
    ["nul", "a\u0000b"],
    ["zero-width space", "a\u200bb"],
    ["zero-width joiner alone", "a\u200db"],
    ["non-joiner", "a\u200cb"],
    ["left-to-right mark", "a\u200eb"],
    ["right-to-left override", "a\u202eb"],
    ["first strong isolate", "a\u2068b"],
    ["byte order mark", "a\ufeffb"],
    ["escape", "a\u001bb"],
    ["delete", "a\u007fb"],
  ] as const;

  for (const [label, raw] of invisible) {
    it(`keeps nothing of the ${label}`, () => {
      expect(normaliseName(raw)).toBe("ab");
    });
  }

  it("keeps a family emoji whole, because the joiner is what holds it together", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"; // man ZWJ woman ZWJ girl
    expect(normaliseName(family)).toBe(family);
    expect([...family]).toHaveLength(5); // three faces and two joiners, none of them dropped
  });

  it("never ends on a joiner with nothing left to join", () => {
    // 24 code points of this run end on U+200D; the tail has to go.
    const cut = "\u{1F468}\u200D".repeat(20) + "x";
    const kept = normaliseName(cut);
    expect([...kept].length).toBeLessThanOrEqual(NAME_MAX);
    expect(kept.endsWith("\u200D")).toBe(false);
  });

  it("counts characters, not code units", () => {
    const thirty = "🧑".repeat(30);
    const kept = normaliseName(thirty);
    expect([...kept]).toHaveLength(NAME_MAX);
    // no lone surrogate anywhere: the string still decodes as whole emoji
    expect(kept).toBe("🧑".repeat(NAME_MAX));
  });

  it("collapses whitespace an interior newline or tab would have broken the line with", () => {
    expect(normaliseName("line1\nline2")).toBe("line1 line2");
    expect(normaliseName("a\t\tb")).toBe("a b");
    expect(normaliseName("  many   spaces  ")).toBe("many spaces");
  });

  it("writes and reads the same word, whatever it is made of", () => {
    const name = "🧑".repeat(NAME_MAX); // 24 characters, 48 code units
    useStore.getState().nameResident(ATLAS, name);
    expect(useStore.getState().residentNames[ATLAS]).toBe(name);
    // the reader used to measure `length <= NAME_MAX` in code units and would
    // have dropped exactly this name on the next reload
    expect(loadEpheNames(BUCKET_CITY)[ATLAS]).toBe(name);
  });

  it("empties to nothing, so a name made only of invisible characters is no name", () => {
    expect(normaliseName("\u200b\u200e\u202e")).toBe("");
    useStore.getState().nameResident(ATLAS, "\u200b");
    expect(ATLAS in useStore.getState().residentNames).toBe(false);
  });
});

describe("the name reaches the screen as text", () => {
  it("has no HTML surface anywhere in the app", () => {
    const SRC = path.resolve(import.meta.dirname, "../src");
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e)) {
          const text = readFileSync(full, "utf-8");
          if (/dangerouslySetInnerHTML\s*=|\.innerHTML\s*=|\.outerHTML\s*=/.test(text))
            hits.push(e);
        }
      }
    };
    walk(SRC);
    // `findings/fixes.ts` only *names* the pattern in its advice text; the
    // assertion above matches assignments and props, not prose.
    expect(hits).toEqual([]);
  });

  it("binds the card's field to the value, and takes its limit from the model", () => {
    const card = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/ResidentCard.tsx"),
      "utf-8",
    );
    expect(card).toContain("value={name}");
    expect(card).toContain("maxLength={NAME_MAX * 2}");
    expect(card).not.toContain("maxLength={24}");
  });
});

describe("what is kept", () => {
  it("comes back for the same project", () => {
    expect(saveEpheName(BUCKET_CITY, ATLAS, "Atlas")).toBe(true);
    expect(loadEpheNames(BUCKET_CITY)).toEqual({ [ATLAS]: "Atlas" });
  });

  it("stays out of another project", () => {
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    expect(loadEpheNames(OTHER_CITY)).toEqual({});
    // Two buckets, so the isolation is real storage and not one map read twice.
    expect(bucketKeyFor(OTHER_CITY)).not.toBe(bucketKeyFor(BUCKET_CITY));
  });

  it("keeps several residents apart inside one project", () => {
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    saveEpheName(BUCKET_CITY, "plot:f-src/api.ts#0", "Pi");
    expect(loadEpheNames(BUCKET_CITY)).toEqual({
      [ATLAS]: "Atlas",
      "plot:f-src/api.ts#0": "Pi",
    });
  });

  it("forgets when the field is emptied", () => {
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    saveEpheName(BUCKET_CITY, ATLAS, "");
    expect(loadEpheNames(BUCKET_CITY)).toEqual({});
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    saveEpheName(BUCKET_CITY, ATLAS, null);
    expect(loadEpheNames(BUCKET_CITY)).toEqual({});
    // Deleting the last name leaves an empty bucket, not a stale one.
    expect(window.localStorage.getItem(KEY(BUCKET_CITY))).toBe("{}");
  });
});

describe("what is refused", () => {
  it("never stores a name whose address is only a crowd number", () => {
    expect(isDurableAddress("street:3")).toBe(false);
    // Nothing durable was asked for, so nothing was lost: the caller keeps the
    // session copy and the card keeps its "only here" wording.
    expect(saveEpheName(BUCKET_CITY, "street:3", "Atlas")).toBe(true);
    expect(loadEpheNames(BUCKET_CITY)).toEqual({});
    expect(window.localStorage.getItem(KEY(BUCKET_CITY))).toBeNull();
  });

  it("trims a name and cuts it to what the field accepts", () => {
    saveEpheName(BUCKET_CITY, ATLAS, "  Atlas  ");
    expect(loadEpheNames(BUCKET_CITY)[ATLAS]).toBe("Atlas");
    saveEpheName(BUCKET_CITY, ATLAS, "x".repeat(60));
    expect(loadEpheNames(BUCKET_CITY)[ATLAS]).toHaveLength(NAME_MAX);
  });

  it("drops the oldest name once the cap is reached", () => {
    for (let i = 0; i <= NAMES_CAP; i++) {
      saveEpheName(BUCKET_CITY, `plot:f-src/x${i}.ts#0`, `n${i}`);
    }
    const kept = loadEpheNames(BUCKET_CITY);
    expect(Object.keys(kept).length).toBe(NAMES_CAP);
    expect(kept["plot:f-src/x0.ts#0"]).toBeUndefined();
    expect(kept[`plot:f-src/x${NAMES_CAP}.ts#0`]).toBe(`n${NAMES_CAP}`);
  });

  it("reads garbage as nothing, and drops entries it would not have written", () => {
    window.localStorage.setItem(KEY(BUCKET_CITY), "{not json");
    expect(loadEpheNames(BUCKET_CITY)).toEqual({});
    window.localStorage.setItem(
      KEY(BUCKET_CITY),
      JSON.stringify({ "street:1": "No", "plot:f-a#0": 7, "plot:f-b#0": "ok", "plot:f-c#0": "  " }),
    );
    expect(loadEpheNames(BUCKET_CITY)).toEqual({ "plot:f-b#0": "ok" });
  });

  it("says so when the browser will not take it", () => {
    const undo = refuseOneWrite();
    expect(saveEpheName(BUCKET_CITY, ATLAS, "Atlas")).toBe(false);
    undo();
  });
});

describe("the app reads it back", () => {
  it("adopts the stored names when a city arrives", () => {
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    // Merged, not replaced: `setState(obj, true)` would drop the actions too.
    useStore.setState({ cityData: null, residentNames: {} });
    useStore.getState().setCityData(BUCKET_CITY);
    expect(useStore.getState().residentNames).toEqual({ [ATLAS]: "Atlas" });
    expect(useStore.getState().residentNamesBlocked).toBe(false);
  });

  it("writes a typed name through, and reports a refused write", () => {
    useStore.getState().nameResident(ATLAS, "Atlas");
    expect(loadEpheNames(BUCKET_CITY)).toEqual({ [ATLAS]: "Atlas" });
    expect(useStore.getState().residentNamesBlocked).toBe(false);

    const undo = refuseOneWrite();
    useStore.getState().nameResident("plot:f-src/api.ts#0", "Pi");
    undo();
    // The screen keeps what the reader typed; the promise of durability is
    // taken back by the flag instead of pretending the write happened.
    expect(useStore.getState().residentNames["plot:f-src/api.ts#0"]).toBe("Pi");
    expect(useStore.getState().residentNamesBlocked).toBe(true);
  });
});

/**
 * MASTER-2027 §04.11 — „nachträglich umgestalten" darf funktionieren, aber nicht,
 * indem die Karte zum Charaktereditor wird. Der Auftrag schließt „riesige
 * Charaktereditoren" aus und `arrival-budget.test.tsx` hält die Karte an ihrem
 * einen Verb. Was Umgestalten später wirklich möglich macht, ist §04.09 (die
 * Wahl bleibt auf dem Rechner) und §04.10 (die Stadt trägt sie). Diese Karte
 * muss also genau ihre Form behalten — die Chips dürfen hier nicht stehen.
 */
describe("die Bewohnerkarte behält ihr ein Verb", () => {
  const card = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/ResidentCard.tsx"),
    "utf-8",
  );

  it("trägt kein Aussehen-Feld, das die Vitrine schon hat", () => {
    expect(card).not.toContain("EpheLookControls");
    expect(card.match(/EPHE_VARIANTS/g) ?? []).toHaveLength(0);
    expect((card.match(/className="resident-action"/g) ?? []).length).toBe(1);
  });
});

/**
 * Task #8, storage-read class: the names bucket is the reader's copy — when
 * its bytes cannot be read that is NOT "you never named anyone", and the
 * bytes themselves outlive the next save in the `:unreadable` slot
 * (`storageRead.ts`), so the class answer rides the ONE mechanism, per
 * project bucket.
 */
describe("corrupt bytes are not 'no names yet'", () => {
  const QUARANTINE = `${KEY(BUCKET_CITY)}:unreadable`;

  it("never-named answers absent, and nothing is quarantined", () => {
    expect(loadEpheNamesRead(BUCKET_CITY)).toEqual({ state: "absent" });
    expect(localStorage.getItem(QUARANTINE)).toBeNull();
  });

  it("honest bytes answer read", () => {
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    expect(loadEpheNamesRead(BUCKET_CITY)).toEqual({ state: "read", value: { [ATLAS]: "Atlas" } });
  });

  it("bytes that do not parse answer unreadable and are kept verbatim", () => {
    localStorage.setItem(KEY(BUCKET_CITY), `{"${ATLAS}":"At`);
    expect(loadEpheNamesRead(BUCKET_CITY)).toEqual({ state: "unreadable" });
    expect(localStorage.getItem(QUARANTINE)).toBe(`{"${ATLAS}":"At`);
    // The screen copy is still the empty map — it is no longer the whole answer.
    expect(loadEpheNames(BUCKET_CITY)).toEqual({});
  });

  it("bytes that parse into the wrong shape are unreadable too, not empty", () => {
    localStorage.setItem(KEY(BUCKET_CITY), '[["plot:a","X"]]');
    expect(loadEpheNamesRead(BUCKET_CITY)).toEqual({ state: "unreadable" });
    expect(localStorage.getItem(QUARANTINE)).toBe('[["plot:a","X"]]');
  });

  it("naming a resident next writes over the live bucket but not the quarantine", () => {
    localStorage.setItem(KEY(BUCKET_CITY), "{not json");
    loadEpheNamesRead(BUCKET_CITY);
    saveEpheName(BUCKET_CITY, ATLAS, "Atlas");
    expect(localStorage.getItem(QUARANTINE)).toBe("{not json");
    expect(loadEpheNames(BUCKET_CITY)).toEqual({ [ATLAS]: "Atlas" });
  });
});
