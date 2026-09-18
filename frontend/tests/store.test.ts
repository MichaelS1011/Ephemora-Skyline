import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../src/stores/useStore";
import type { CityData } from "../src/city/types";

/** Minimal city fixture: root with two districts, one building each */
function makeCity(): CityData {
  return {
    id: "test-city",
    repo: { owner: "test", name: "repo", branch: "main", cloneUrl: "", analyzedAt: "" },
    languages: { TypeScript: 100 },
    totalFiles: 2,
    renderedFiles: 2,
    threatScore: 0,
    findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
    tree: {
      name: "root",
      path: "",
      fileCount: 2,
      linesOfCode: 100,
      findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
      children: [
        {
          name: "src",
          path: "src",
          fileCount: 1,
          linesOfCode: 60,
          findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
          children: [],
          detailFiles: [
            {
              id: "file:src/evil.ts",
              name: "evil.ts",
              path: "src/evil.ts",
              language: "TypeScript",
              linesOfCode: 60,
              threatLevel: "critical",
              findings: [
                {
                  type: "EVAL_USAGE",
                  severity: "P0",
                  score: 9,
                  line: 1,
                  code: "eval(x)",
                  message: "eval",
                },
              ],
            },
          ],
        },
        {
          name: "lib",
          path: "lib",
          fileCount: 1,
          linesOfCode: 40,
          findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
          children: [],
          detailFiles: [
            {
              id: "file:lib/clean.ts",
              name: "clean.ts",
              path: "lib/clean.ts",
              language: "TypeScript",
              linesOfCode: 40,
              threatLevel: "clean",
              findings: [],
            },
          ],
        },
      ],
      detailFiles: [],
    },
  } as unknown as CityData;
}

describe("useStore", () => {
  beforeEach(() => {
    useStore.getState().setThreatFilter("all");
    useStore.getState().resetFocus();
    useStore.getState().setCityData(null);
  });

  it("threatFilter toggles and resets", () => {
    const s = useStore.getState();
    expect(s.threatFilter).toBe("all");
    s.setThreatFilter("P0");
    expect(useStore.getState().threatFilter).toBe("P0");
    s.setThreatFilter("all");
    expect(useStore.getState().threatFilter).toBe("all");
  });

  it("drillIn/drillOut walk the focus path", () => {
    const s = useStore.getState();
    s.setCityData(makeCity());
    s.drillIn("src");
    expect(useStore.getState().focusPath).toEqual(["src"]);
    s.drillIn("sub");
    expect(useStore.getState().focusPath).toEqual(["src", "sub"]);
    s.drillOut();
    expect(useStore.getState().focusPath).toEqual(["src"]);
    s.resetFocus();
    expect(useStore.getState().focusPath).toEqual([]);
  });

  it("city data roundtrip + selection", () => {
    const s = useStore.getState();
    const city = makeCity();
    s.setCityData(city);
    expect(useStore.getState().cityData?.totalFiles).toBe(2);
    s.setSelectedUnit({ kind: "file", id: "file:src/evil.ts" });
    const sel = useStore.getState().selectedUnit;
    expect(sel?.kind).toBe("file");
    if (sel?.kind === "file") expect(sel.id).toBe("file:src/evil.ts");
    s.setSelectedUnit(null);
    expect(useStore.getState().selectedUnit).toBeNull();
  });
});
