// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  findingKey,
  reviewKeyFor,
  projectKey,
  loadReviews,
  saveReviews,
  countOrphanedReviews,
} from "../src/reviews";

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

  it("counts verdicts it cannot reach, so the panel can say so", () => {
    const alt = projectKey({ owner: "local", name: "anderes" });
    saveReviews(alt, { "fp:1": "reviewed", "fp:2": "to-fix" });
    const eigen = projectKey({ owner: "local", name: "eigenes" });
    expect(countOrphanedReviews(eigen)).toBe(2);
    saveReviews(eigen, { "fp:3": "reviewed" });
    expect(countOrphanedReviews(eigen), "the current bucket is not an orphan").toBe(2);
  });

  it("ignores garbage in storage instead of throwing", () => {
    localStorage.setItem("codecity-reviews:kaputt", "{not json");
    expect(countOrphanedReviews(projectKey({ owner: "o", name: "n" }))).toBe(0);
    expect(loadReviews("kaputt")).toEqual({});
  });
});
