// @vitest-environment jsdom
// The missions are derived from the payload and nothing else: every challenge
// names a building that exists, every reason quotes a measured field, and a
// capture mark only appears after a real image of that selected file.
import { beforeEach, describe, expect, it } from "vitest";
import {
  POSTCARD_CAPTURED_EVENT,
  clearPostcardMarks,
  derivePostcardChallenges,
  loadPostcardMarks,
  loadPostcardMarksRead,
  markPostcardCaptured,
  markChallengeCaptured,
  postcardStorageKey,
  type PostcardChallenge,
} from "../src/city/postcardChallenges";
import { postcardText } from "../src/components/postcardCopy";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityData, CityFile } from "../src/city/types";

const code = (path: string, id: string, overrides: Partial<CityFile> = {}): CityFile =>
  file(path, "TypeScript", [], undefined, { id, ...overrides });

const TALL = code("src/tall.ts", "f-tall", {
  linesOfCode: 900,
  cyclomaticComplexity: 20,
  importCount: 10,
  unverifiedBy: ["semgrep"],
});
const SHORT_UNCHECKED = code("src/short.ts", "f-short", {
  linesOfCode: 80,
  unverifiedBy: ["semgrep"],
});
const LOOP = code("src/loop.ts", "f-loop", { linesOfCode: 300, inCycle: true });
const CORE = code("src/core.ts", "f-core", { linesOfCode: 200 });
const OLD = code("src/old.ts", "f-old", { linesOfCode: 150, coveragePct: 12 });
const DUP = code("src/dup.ts", "f-dup", {
  linesOfCode: 120,
  clonePartners: [{ id: "f-partner", path: "src/partner.ts", lines: 42 }],
});
const PARTNER = code("src/partner.ts", "f-partner", { linesOfCode: 110 });
const A = code("src/a.ts", "f-a", { linesOfCode: 30 });
const B = code("src/b.ts", "f-b", { linesOfCode: 25 });
const C = code("src/c.ts", "f-c", { linesOfCode: 20 });

const ALL = [TALL, SHORT_UNCHECKED, LOOP, CORE, OLD, DUP, PARTNER, A, B, C];

function probeCity(overrides: Partial<CityData> = {}): CityData {
  return city({
    repo: { owner: "local", name: "postcards", branch: "main" },
    analysisId: "scan-postcards-1",
    files: ALL,
    tree: dir({
      path: "",
      children: [
        dir({ path: "src", name: "src", detailFiles: ALL }),
        dir({ path: "lib", name: "lib", detailFiles: [code("lib/tiny.ts", "f-tiny")] }),
      ],
    }),
    fileConnections: [
      { from: "f-a", to: "f-core", weight: 1 },
      { from: "f-b", to: "f-core", weight: 1 },
      { from: "f-c", to: "f-core", weight: 1 },
    ],
    ...overrides,
  });
}

const reason = (challenge: PostcardChallenge): string => postcardText("en", challenge.reason);
const kinds = (list: readonly PostcardChallenge[]): string[] => list.map((c) => c.kind);

beforeEach(() => {
  window.localStorage.clear();
});

describe("postcard challenge derivation", () => {
  it("derives the five supported missions from measured fields", () => {
    const list = derivePostcardChallenges(probeCity());

    expect(list).toHaveLength(5);
    expect(kinds(list)).toEqual(["unshielded", "cycle", "blast", "coverage", "clone"]);
  });

  it("picks the tallest unchecked tower and says how it was measured", () => {
    const tower = derivePostcardChallenges(probeCity())[0]!;

    expect(tower.target.fileId).toBe("f-tall");
    expect(tower.target.path).toBe("src/tall.ts");
    expect(reason(tower)).toContain("900");
    expect(reason(tower)).toContain("semgrep");
    expect(tower.action.key).toBeTruthy();
  });

  it("picks the circular file, the most-imported file and the least-covered file", () => {
    const list = derivePostcardChallenges(probeCity());

    expect(list.find((c) => c.kind === "cycle")?.target.fileId).toBe("f-loop");
    expect(list.find((c) => c.kind === "blast")?.target.fileId).toBe("f-core");
    expect(reason(list.find((c) => c.kind === "blast")!)).toContain("3");
    expect(list.find((c) => c.kind === "coverage")?.target.fileId).toBe("f-old");
    expect(reason(list.find((c) => c.kind === "coverage")!)).toContain("12");
  });

  it("uses a clone pair as the fallback and names the duplicated file", () => {
    const list = derivePostcardChallenges(probeCity());
    const clone = list.find((c) => c.kind === "clone")!;

    expect(clone.target.fileId).toBe("f-dup");
    expect(reason(clone)).toContain("42");
    expect(reason(clone)).toContain("src/partner.ts");
  });

  it("never names a target that is not in the city", () => {
    const probe = probeCity();
    const ids = new Set(ALL.map((f) => f.id));

    for (const challenge of derivePostcardChallenges(probe)) {
      expect(ids.has(challenge.target.fileId), challenge.target.fileId).toBe(true);
      expect(challenge.target.path).not.toBe("");
    }
  });

  it("derives fewer than five when the payload supports fewer", () => {
    const plain = city({
      analysisId: "scan-plain",
      files: [code("src/a.ts", "f-a"), code("src/b.ts", "f-b")],
      tree: dir({
        path: "",
        children: [dir({ path: "src", name: "src", detailFiles: [A, B] })],
      }),
    });

    const list = derivePostcardChallenges(plain);
    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe("district");
  });

  it("offers no challenge when the payload has no target", () => {
    const empty = city({ analysisId: "scan-empty", files: [] });
    expect(derivePostcardChallenges(empty)).toEqual([]);
  });

  it("only claims coverage or age when the payload carries the field", () => {
    const noCoverage = city({
      analysisId: "scan-no-coverage",
      files: [LOOP, CORE, A, B, C],
      fileConnections: [{ from: "f-a", to: "f-core", weight: 1 }],
    });

    const list = derivePostcardChallenges(noCoverage);
    expect(kinds(list)).not.toContain("coverage");
  });

  it("describes an old file from the commit age the payload carries", () => {
    const oldFile = code("src/ancient.ts", "f-ancient", {
      linesOfCode: 140,
      lastCommitAt: Date.parse("2022-01-01T00:00:00Z"),
    });
    const oldCity = city({
      analysisId: "scan-old",
      createdAt: "2026-01-01T00:00:00Z",
      files: [oldFile],
      tree: dir({
        path: "",
        children: [dir({ path: "src", name: "src", detailFiles: [oldFile] })],
      }),
    });

    const coverage = derivePostcardChallenges(oldCity).find((c) => c.kind === "coverage")!;
    expect(coverage.target.fileId).toBe("f-ancient");
    expect(reason(coverage)).toContain("1461");
  });

  it("falls back to the largest district when no clone pair is reported", () => {
    const districtCity = city({
      analysisId: "scan-district",
      files: [A, B],
      tree: dir({
        path: "",
        children: [
          dir({ path: "small", name: "small", detailFiles: [A] }),
          dir({ path: "big", name: "big", detailFiles: [B] }),
        ],
      }),
    });

    const list = derivePostcardChallenges(districtCity);
    expect(list[0]?.kind).toBe("district");
    expect(postcardText("en", list[0]!.reason)).toContain("big");
  });
});

describe("postcard completion marks", () => {
  it("persists a captured challenge per analysis id", () => {
    const probe = probeCity();
    const challenge = derivePostcardChallenges(probe)[0]!;

    expect(markPostcardCaptured(probe, challenge.target.fileId)).toEqual(challenge);
    expect(loadPostcardMarksRead("scan-postcards-1")).toEqual({
      state: "read",
      value: { [challenge.id]: true },
    });
    expect(loadPostcardMarks("scan-postcards-1")).toEqual({ [challenge.id]: true });
    expect(loadPostcardMarksRead("another-scan")).toEqual({ state: "absent" });
  });

  it("does not mark a file that is not a mission target", () => {
    const probe = probeCity();

    expect(markPostcardCaptured(probe, "f-a")).toBeNull();
    expect(loadPostcardMarksRead("scan-postcards-1")).toEqual({ state: "absent" });
  });

  it("cannot persist without an analysis id", () => {
    const noId = probeCity({ analysisId: undefined });
    const challenge = derivePostcardChallenges(noId)[0]!;

    expect(markPostcardCaptured(noId, challenge.target.fileId)).toBeNull();
    expect(markChallengeCaptured("", challenge.id)).toBe(false);
  });

  it("keeps unreadable bytes verbatim and says the read failed", () => {
    const key = postcardStorageKey("scan-broken")!;
    window.localStorage.setItem(key, "{not json");

    expect(loadPostcardMarksRead("scan-broken")).toEqual({ state: "unreadable" });
    expect(window.localStorage.getItem(`${key}:unreadable`)).toBe("{not json");
  });

  it("clears the live bucket when asked", () => {
    const probe = probeCity();
    const challenge = derivePostcardChallenges(probe)[0]!;
    markPostcardCaptured(probe, challenge.target.fileId);

    expect(clearPostcardMarks("scan-postcards-1")).toBe(true);
    expect(loadPostcardMarksRead("scan-postcards-1")).toEqual({ state: "absent" });
  });

  it("announces a real capture so the open panel can re-read the marks", () => {
    const probe = probeCity();
    const challenge = derivePostcardChallenges(probe)[0]!;
    let seen: string | null = null;
    const listener = (event: Event): void => {
      seen = (event as CustomEvent<{ challengeId: string }>).detail.challengeId;
    };
    window.addEventListener(POSTCARD_CAPTURED_EVENT, listener);
    try {
      markPostcardCaptured(probe, challenge.target.fileId);
    } finally {
      window.removeEventListener(POSTCARD_CAPTURED_EVENT, listener);
    }

    expect(seen).toBe(challenge.id);
  });
});
