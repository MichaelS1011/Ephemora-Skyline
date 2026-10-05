// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  bucketKeyFor,
  identityIsGuessed,
  loadReviews,
  loadReviewsForCity,
  projectKey,
  projectShape,
  saveReviews,
} from "../src/reviews";
import { t } from "../src/i18n";
import { useStore } from "../src/stores/useStore";

/**
 * A local scan names a project after the folder's basename and hard-codes the
 * owner to `local`. Two checkouts called `backend` therefore shared one verdict
 * bucket, and the panel showed the other project's triage as if it belonged to
 * this one. The bucket key has to tell them apart without putting either path in
 * the key in plain text.
 */
const ROOT_KEY = "codecity.workspaceRoot";

type City = Parameters<typeof bucketKeyFor>[0];
const city = (name: string, children: string[]): City =>
  ({
    repo: { owner: "local", name, branch: "local" },
    tree: { children: children.map((c) => ({ name: c })) },
  }) as unknown as City;

describe("the project bucket", () => {
  beforeEach(() => localStorage.clear());

  it("separates two folders that share a basename", () => {
    const a = bucketKeyFor(city("backend", ["src", "db"]));
    const b = bucketKeyFor(city("backend", ["src", "api", "infra"]));
    expect(a).toMatch(/^p-[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("backend");
  });

  it("reads the same bucket on a re-scan, whatever order the walk returned", () => {
    expect(projectShape(city("p", ["src", "db"]) as never)).toEqual(["db", "src"]);
    expect(bucketKeyFor(city("backend", ["src", "db"]))).toBe(
      bucketKeyFor(city("backend", ["db", "src"])),
    );
  });

  it("prefers a configured root, and a new folder does not move the verdicts", () => {
    localStorage.setItem(`${ROOT_KEY}:local/backend`, "/Users/micha/proj-a/backend");
    const before = bucketKeyFor(city("backend", ["src"]));
    const after = bucketKeyFor(city("backend", ["src", "scripts"]));
    expect(after).toBe(before);
    // the root is read, never written into the key in the clear
    expect(after).not.toContain("micha");
  });

  it("keeps a flat folder on the key that already holds its verdicts", () => {
    // no subdirectories → nothing to distinguish by → must not silently strand
    expect(bucketKeyFor(city("solo", []))).toBe(projectKey({ owner: "local", name: "solo" }));
  });

  it("adopts the verdicts recorded while the bucket was the folder name", () => {
    const legacyKey = projectKey({ owner: "local", name: "backend" });
    saveReviews(legacyKey, { "fp:9f2c": "false-positive", "fp:abe": "to-fix" });

    const adopted = loadReviewsForCity(city("backend", ["src", "db"]));
    expect(Object.keys(adopted)).toHaveLength(2);
    expect(adopted["fp:9f2c"]).toBe("false-positive");

    const newKey = bucketKeyFor(city("backend", ["src", "db"]));
    expect(loadReviews(newKey)["fp:abe"]).toBe("to-fix");
    // the old bucket is left where it is: it may belong to the other `backend`
    expect(localStorage.getItem(`codecity-reviews:${legacyKey}`)).not.toBeNull();
  });

  it("knows when the identity is only inferred", () => {
    expect(identityIsGuessed(city("backend", ["src"]))).toBe(true);
    localStorage.setItem(`${ROOT_KEY}:local/backend`, "/Users/micha/proj-a/backend");
    expect(identityIsGuessed(city("backend", ["src"]))).toBe(false);
  });

  it("does not adopt anything when the new bucket already has verdicts", () => {
    const legacyKey = projectKey({ owner: "local", name: "backend" });
    const newKey = bucketKeyFor(city("backend", ["src", "db"]));
    saveReviews(legacyKey, { "fp:alt": "to-fix" });
    saveReviews(newKey, { "fp:neu": "false-positive" });

    const got = loadReviewsForCity(city("backend", ["src", "db"]));
    expect(got["fp:neu"]).toBe("false-positive");
    expect(got["fp:alt"]).toBeUndefined();
  });
});

/**
 * The marker has to appear exactly where a reader would otherwise conclude the
 * tool forgot their work: next to the project's name, and not on the demo city,
 * which has no verdict history to lose.
 */
describe("the header says when the identity is guessed", () => {
  const hud = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/HudOverlay.tsx"),
    "utf-8",
  );

  it("renders the marker guarded by the demo case", () => {
    expect(hud).toContain("identityIsGuessed(cityData)");
    expect(hud).toMatch(/apiStatus !== "demo" && identityIsGuessed\(cityData\)/);
    expect(hud).toContain('data-testid="project-identity-guess"');
    expect(hud).toContain('t(lang, "hud.identityGuessedTitle")');
    // a glyph is a sighted cue only, so the same fact needs a spoken form
    expect(hud).toContain('aria-hidden="true"');
    expect(hud).toContain('t(lang, "hud.identityGuessedAria")');
  });

  it("names the same fact in both languages for screen readers", () => {
    expect(t("en", "hud.identityGuessedAria")).toMatch(/inferred/i);
    expect(t("de", "hud.identityGuessedAria")).toMatch(/abgeleitet/);
  });

  it("explains it in both languages", () => {
    expect(t("en", "hud.identityGuessedTitle")).toMatch(/project root/i);
    expect(t("de", "hud.identityGuessedTitle")).toMatch(/Projektwurzel/);
    expect(t("de", "hud.identityGuessedTitle")).not.toBe(t("en", "hud.identityGuessedTitle"));
  });
});

/**
 * The two functions above are worthless if the store keeps reading and writing
 * the name-only bucket. This is that wiring.
 */
describe("the store", () => {
  const stadt = (name: string, children: string[]) =>
    ({
      repo: { owner: "local", name, branch: "local" },
      analysisId: "scan-1",
      totalFiles: 1,
      renderedFiles: 1,
      totalLines: 10,
      findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
      languages: { TypeScript: 10 },
      fileConnections: [],
      dirConnections: [],
      meta: {},
      tree: {
        name,
        path: "",
        children: children.map((c) => ({ name: c, path: c })),
        detailFiles: [],
        districtFiles: [],
        remainingFiles: 0,
      },
      additionalFiles: [],
    }) as never;

  beforeEach(() => {
    localStorage.clear();
    useStore.getState().resetToLanding();
  });

  it("writes a verdict into the folder-aware bucket, not the name-only one", () => {
    useStore.getState().setCityData(stadt("backend", ["src", "db"]));
    useStore.getState().setReview("fp:xyz", "false-positive");
    const key = bucketKeyFor(city("backend", ["src", "db"]));
    const raw = localStorage.getItem(`codecity-reviews:${key}`);
    expect(raw, "the shaped bucket was never written").toBeTruthy();
    expect(JSON.parse(raw!)["fp:xyz"]).toBe("false-positive");
    expect(
      localStorage.getItem(`codecity-reviews:${projectKey({ owner: "local", name: "backend" })}`),
      "the ambiguous bucket must stay empty",
    ).toBeNull();
  });

  it("does not let one backend borrow the other backend's triage", () => {
    useStore.getState().setCityData(stadt("backend", ["src", "db"]));
    useStore.getState().setReview("fp:xyz", "false-positive");
    useStore.getState().setCityData(stadt("backend", ["src", "api", "workers"]));
    expect(useStore.getState().reviews).toEqual({});
    expect(
      useStore.getState().orphanedReviews,
      "nothing of the other project may strand here",
    ).toBe(0);
  });
});
