// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../src/stores/useStore";
import {
  findingKey,
  reviewKeyFor,
  projectKey,
  bucketKeyFor,
  loadReviews,
  loadReviewsForCityRead,
  loadReviewsRead,
  saveReviews,
  countStrandedVerdicts,
} from "../src/reviews";
import { quarantineKeyFor } from "../src/storageRead";

/**
 * A verdict has to outlive the scan that produced it. Two things made that
 * impossible: the bucket was named after a per-scan uuid, and the key inside it
 * was a position (`f-<walk order>#<index>`). Both are replaced here — bucket by
 * project, key by fingerprint — and the old positional form is kept working for
 * payloads that carry no fingerprints, so an older city JSON still reads back.
 */
describe("review storage", () => {
  beforeEach(() => localStorage.clear());

  it("names the bucket after the project, not after the scan", () => {
    const a = projectKey({ owner: "local", name: "mein-repo" });
    expect(a).toMatch(/^p-[0-9a-f]{16}$/);
    expect(a).not.toContain("mein-repo");
    expect(projectKey({ owner: "local", name: "mein-repo" })).toBe(a);
    expect(projectKey({ owner: "local", name: "anderes-repo" })).not.toBe(a);
    expect(projectKey({ owner: "andere", name: "mein-repo" })).not.toBe(a);
  });

  it("keys a fingerprinted finding by its fingerprint", () => {
    expect(reviewKeyFor({ id: "f-abc" }, 2, { fingerprint: "9f2c" })).toBe("fp:9f2c");
  });

  it("falls back to the positional key when a payload has no fingerprint", () => {
    expect(reviewKeyFor({ id: "f-abc" }, 2, undefined)).toBe(findingKey("f-abc", 2));
    expect(reviewKeyFor({ id: "f-abc" }, 2, {})).toBe(findingKey("f-abc", 2));
  });

  it("reads back a verdict saved under the project bucket", () => {
    const key = projectKey({ owner: "local", name: "p" });
    saveReviews(key, { "fp:9f2c": "false-positive" });
    expect(loadReviews(key)["fp:9f2c"]).toBe("false-positive");
    // a different scan of the same project resolves the same bucket
    expect(loadReviews(projectKey({ owner: "local", name: "p" }))["fp:9f2c"]).toBe(
      "false-positive",
    );
  });

  it("counts verdicts that match no finding in the city on screen", () => {
    const stadt = {
      path: "src/db.ts",
      findings: [
        { line: 2, fingerprint: "aaa" },
        { line: 7, fingerprint: "bbb" },
      ],
      children: [{ path: "src/x.ts", findings: [{ line: 1, fingerprint: "ccc" }] }],
    };
    expect(countStrandedVerdicts({ "fp:aaa": "reviewed", "fp:ccc": "to-fix" }, stadt)).toBe(0);
    expect(
      countStrandedVerdicts(
        { "fp:aaa": "reviewed", "fp:xyz": "to-fix", "alt:1": "reviewed" },
        stadt,
      ),
    ).toBe(2);
  });

  it("S-P4: a positional verdict that a fingerprint-less payload resolves is NOT stranded", () => {
    // reviewKeyFor falls back to <fileId>#<index> when a finding carries no
    // fingerprint — the orphan count must mirror that resolution, otherwise
    // the project tally counts one verdict twice (judged AND stranded)
    const stadt = { id: "f-db", findings: [{ line: 2 }, { line: 7 }] };
    expect(countStrandedVerdicts({ "f-db#0": "reviewed" }, stadt)).toBe(0);
    // the same key against a city whose file id no longer holds it IS stranded
    expect(
      countStrandedVerdicts({ "f-db#0": "reviewed" }, { id: "f-other", findings: [{ line: 2 }] }),
    ).toBe(1);
    // and a fingerprint verdict strands when the fingerprint is gone
    expect(
      countStrandedVerdicts(
        { "fp:aaa": "reviewed" },
        { id: "f-db", findings: [{ line: 2, fingerprint: "bbb" }] },
      ),
    ).toBe(1);
  });

  it("reads garbage in storage as nothing rather than throwing", () => {
    localStorage.setItem("codecity-reviews:kaputt", "{not json");
    expect(loadReviews("kaputt")).toEqual({});
    expect(loadReviews("codecity-reviews:kaputt")).toEqual({});
  });
});

/**
 * The helper is not the feature — the panel reads `orphanedReviews`, and only
 * the store knows both the bucket and the city. This is the wiring test.
 */
describe("the store reports stranded verdicts when a city loads", () => {
  const stadt = (name: string) =>
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
      tree: { name, path: "", children: [], detailFiles: [], districtFiles: [], remainingFiles: 0 },
      additionalFiles: [
        {
          id: "f-abc",
          name: "db.ts",
          path: "src/db.ts",
          language: "TypeScript",
          linesOfCode: 10,
          cyclomaticComplexity: 1,
          threatLevel: "high",
          findings: [
            { type: "EVAL_USAGE", severity: "P0", line: 4, message: "m", fingerprint: "aaa" },
          ],
        },
      ],
    }) as never;

  it("counts the verdict that no finding carries", () => {
    localStorage.clear();
    useStore.getState().resetToLanding();
    const st = stadt("wiring-projekt");
    saveReviews(projectKey({ owner: "local", name: "wiring-projekt" }), {
      "fp:aaa": "to-fix",
      "fp:weg": "reviewed",
      "f-1#0": "false-positive",
    });
    useStore.getState().setCityData(st);
    const s = useStore.getState();
    expect(s.reviews["fp:aaa"], "the matching verdict is live").toBe("to-fix");
    expect(s.orphanedReviews).toBe(2);
  });

  it("reports nothing stranded for a city without verdicts", () => {
    localStorage.clear();
    useStore.getState().resetToLanding();
    useStore.getState().setCityData(stadt("frisch-projekt"));
    expect(useStore.getState().orphanedReviews).toBe(0);
  });
});

/**
 * Task #8, storage-read class: the browser bucket is the copy this screen
 * reads synchronously — the same case the saved pack selection had. Corrupt
 * bytes answer `unreadable` (kept verbatim under `<key>:unreadable`), never-
 * judged answers `absent`, and only `read` may look like an empty map without
 * a word. The legacy-adoption door must not trade the corrupt bytes: the
 * quarantine slot survives the adoption write.
 */
describe("the browser bucket answers three states", () => {
  const city = { repo: { owner: "local", name: "ehrlich-projekt" }, tree: undefined };
  const bucket = bucketKeyFor(city);
  const key = `codecity-reviews:${bucket}`;

  beforeEach(() => localStorage.clear());

  it("never-judged answers absent, honest bytes answer read", () => {
    expect(loadReviewsRead(bucket)).toEqual({ state: "absent" });
    saveReviews(bucket, { "fp:a": "reviewed" });
    expect(loadReviewsRead(bucket)).toEqual({ state: "read", value: { "fp:a": "reviewed" } });
    expect(localStorage.getItem(quarantineKeyFor(key))).toBeNull();
  });

  it("bytes that do not parse answer unreadable and are kept verbatim", () => {
    localStorage.setItem(key, '{"fp:a":"rev');
    expect(loadReviewsRead(bucket)).toEqual({ state: "unreadable" });
    expect(localStorage.getItem(quarantineKeyFor(key))).toBe('{"fp:a":"rev');
    expect(loadReviews(bucket)).toEqual({});
  });

  it("bytes that parse into the wrong shape are unreadable, not an empty verdict map", () => {
    localStorage.setItem(key, '"plain text"');
    expect(loadReviewsRead(bucket)).toEqual({ state: "unreadable" });
    expect(localStorage.getItem(quarantineKeyFor(key))).toBe('"plain text"');
  });

  it("entries that predate a schema are still a read, with the honoured subset", () => {
    localStorage.setItem(key, '{"fp:a":"reviewed","fp:b":"bogus-status"}');
    expect(loadReviewsRead(bucket)).toEqual({ state: "read", value: { "fp:a": "reviewed" } });
    expect(localStorage.getItem(quarantineKeyFor(key))).toBeNull();
  });

  it("the city door: corrupt bytes with no rescue answer unreadable", () => {
    localStorage.setItem(key, "{not json");
    expect(loadReviewsForCityRead(city)).toEqual({ state: "unreadable" });
  });

  it("the city door: a legacy rescue adopts, and the corrupt bytes survive the write", () => {
    // Same key for bucket and legacy here (no root, no shape) — so write the
    // corrupt copy under the bucket, then verify an adoption write keeps the
    // quarantine slot for the machine's own answer.
    localStorage.setItem(key, "{not json");
    expect(loadReviewsForCityRead(city).state).toBe("unreadable");
    saveReviews(bucket, { "fp:a": "to-fix" });
    expect(localStorage.getItem(quarantineKeyFor(key))).toBe("{not json");
    expect(loadReviewsForCityRead(city)).toEqual({ state: "read", value: { "fp:a": "to-fix" } });
  });
});
