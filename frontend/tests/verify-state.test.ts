// @vitest-environment jsdom
/**
 * Two states that must not survive each other: a comparison of scan A shown
 * on scan B's card, and a question asked twice on one scan.
 *
 * The first is the dangerous one. "3 gone" is a sentence about a specific
 * pair of scans; painted over a different city it is plausible and false —
 * the same failure class as the minimap that named a plaza while the plaza
 * burned. So a new scan clears it, and a second ask on the same scan is the
 * same question, not a new one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir } from "../src/city/types";

function dir(path: string, files: string[]): CityDir {
  return {
    name: path,
    path,
    fileCount: files.length,
    linesOfCode: 10,
    languages: { TypeScript: 10 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    detailFiles: files.map((p, i) => ({
      id: `f${i}`,
      name: p.split("/").pop() ?? p,
      path: p,
      language: "TypeScript",
      linesOfCode: 10,
      cyclomaticComplexity: 1,
      threatLevel: "safe",
      findings: [],
    })),
    children: [],
  } as unknown as CityDir;
}
const city = (id: string): CityData =>
  ({
    analysisId: id,
    projectName: "p",
    rootPath: "",
    repo: { owner: "me", name: "p", url: "" },
    totalFiles: 1,
    totalLines: 10,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree: dir("root", ["src/a.ts"]),
    districts: [],
  }) as unknown as CityData;

describe("the comparison's own state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStore.setState({ cityData: null, verify: { status: "idle" } });
  });

  it("is cleared when a different scan arrives", () => {
    useStore.setState({ cityData: city("scan-A") });
    useStore.setState({ verify: { status: "aged-out" } });
    useStore.getState().setCityData(city("scan-B"));
    expect(useStore.getState().verify).toEqual({ status: "idle" });
  });

  it("says there is nothing to compare when no earlier scan of this folder exists", async () => {
    useStore.getState().setCityData(city("scan-A"));
    // the negative branch is only meaningful if the scan itself was recorded:
    // with no anchor written, "none" would be the answer for the wrong reason
    expect(
      JSON.parse(window.localStorage.getItem("codecity-verify-anchor:v1") ?? "[]"),
    ).toHaveLength(1);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await useStore.getState().runVerify();
    expect(useStore.getState().verify).toEqual({ status: "none" });
    expect(fetchSpy, "no question is asked without a counterpart").not.toHaveBeenCalled();
  });

  it("keeps a comparison the reader asked for when the history re-enters the city", () => {
    useStore.getState().setCityData(city("scan-A"));
    useStore.setState({ verify: { status: "aged-out" } });
    // App's popstate calls setCityData again with the SAME city
    useStore.getState().setCityData(useStore.getState().cityData!);
    expect(useStore.getState().verify).toEqual({ status: "aged-out" });
  });

  it("calls a broken connection failed, not aged out", async () => {
    useStore.getState().setCityData(city("scan-1"));
    useStore.getState().setCityData(city("scan-2"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    await useStore.getState().runVerify();
    expect(useStore.getState().verify).toEqual({ status: "failed" });
  });

  it("carries the answer of the pair it asked about", async () => {
    useStore.getState().setCityData(city("scan-1"));
    useStore.getState().setCityData(city("scan-2"));
    const report = {
      before: "scan-1",
      after: "scan-2",
      checked: 2,
      present: [],
      gone: [
        {
          fingerprint: "x",
          path: "src/a.ts",
          line: 1,
          type: "SQL_INJECTION",
          ruleId: "r",
          severity: "P0",
        },
      ],
      moved: [],
      unknown: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await useStore.getState().runVerify();
    const v = useStore.getState().verify;
    expect(v.status).toBe("ran");
    if (v.status === "ran") {
      expect(v.beforeId).toBe("scan-1");
      expect(v.report.gone).toHaveLength(1);
    }
  });

  it("says the earlier scan aged out when the server no longer holds it", async () => {
    useStore.getState().setCityData(city("scan-1"));
    useStore.getState().setCityData(city("scan-2"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 404 }));
    await useStore.getState().runVerify();
    expect(useStore.getState().verify).toEqual({ status: "aged-out" });
  });
});
