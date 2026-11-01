// @vitest-environment jsdom
/**
 * The teaching plates are painted into the 3D picture and have no DOM, so a
 * screen reader reaches none of their words. `TeachBoardsReading` mirrors them.
 *
 * What this holds the mirror to:
 *  - the same words as `boardCopy()`, in the same order the picture carries;
 *  - only the boards that actually stand — `taughtBoards` is the painted set,
 *    and on a real project the honesty board regularly finds no ground;
 *  - the reader's verdicts, because the finding board's copy depends on them.
 *
 * jsdom applies no stylesheet, so "hidden from sight" is asserted here as the
 * class the app's own hidden-text pattern uses, and proven in a real browser.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardCopy } from "../src/city/teachBoards";
import { reviewKeyFor } from "../src/reviews";
import { city, dir, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import { TeachBoardsReading } from "../src/components/TeachBoardsReading";

const CITY = city({
  totalFiles: 74,
  findingsBySeverity: { P0: 3, P1: 2, P2: 3 },
  scanProvenance: {
    regex: false,
    gitleaks: false,
    semgrep: false,
    dependencies: false,
    osv: false,
    ruff: false,
    churn: false,
    duplicates: false,
    coverage: false,
  } as never,
  tree: dir({
    path: "",
    detailFiles: [
      file("services/database.ts", "TypeScript", [
        finding({ severity: "P0", ruleId: "SQL_INJECTION", line: 141 }),
      ]),
    ],
    children: [
      dir({ path: "frontend", detailFiles: [file("frontend/app.tsx", "TypeScript", [])] }),
    ],
  }),
});

const ALL = boardCopy(CITY, "en");
const HONESTY = ALL.find((b) => b.id === "honesty")!.text.title;
const FILE = ALL.find((b) => b.id === "file")!.text.title;
const FINDING = ALL.find((b) => b.id === "finding")!.text.title;

let host: HTMLDivElement;
let root: Root;

function render(): string {
  act(() => root.render(<TeachBoardsReading />));
  return host.textContent ?? "";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const store = useStore.getState();
  act(() => {
    store.setCityData(CITY);
    useStore.setState({
      taughtBoards: ["file", "finding", "honesty"],
      reviews: {},
      prefs: { ...useStore.getState().prefs, lang: "en" },
    });
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the boards are spoken", () => {
  it("carries every word of every standing board", () => {
    const spoken = render();
    for (const board of ALL) {
      expect(spoken, `${board.id}: title missing`).toContain(board.text.title);
      for (const line of board.text.lines) {
        expect(spoken, `${board.id}: line missing`).toContain(line);
      }
    }
  });

  it("keeps the order the picture carries", () => {
    const spoken = render();
    expect(spoken.indexOf(FILE)).toBeLessThan(spoken.indexOf(FINDING));
    expect(spoken.indexOf(FINDING)).toBeLessThan(spoken.indexOf(HONESTY));
  });

  it("stays silent about a board that found no ground", () => {
    // The real-project case: `planBoardPlacements` paints two of three.
    act(() => useStore.setState({ taughtBoards: ["file", "finding"] }));
    const spoken = render();
    expect(spoken).toContain(FILE);
    expect(spoken, "the mirror named a board nobody can see").not.toContain(HONESTY);
  });

  it("says exactly what the plates would say after the reader's verdict", () => {
    const target = CITY.tree.detailFiles?.[0];
    const firstFinding = target?.findings?.[0];
    if (!target || !firstFinding) throw new Error("the fixture lost its file or its finding");
    const key = reviewKeyFor(target, 0, firstFinding);
    act(() => useStore.setState({ reviews: { [key]: "to-fix" } }));
    // The same rule the plates and the mirror both use, applied independently
    // here: if the two channels ever disagree about a verdict, this fails.
    const expected = boardCopy(CITY, "en", (f, i, fnd) => reviewKeyFor(f, i, fnd) === key);
    const spoken = render();
    for (const board of expected) {
      expect(spoken, `${board.id}: title drifted`).toContain(board.text.title);
      for (const line of board.text.lines) {
        expect(spoken, `${board.id}: line drifted after a verdict`).toContain(line);
      }
    }
    expect(spoken).not.toContain(ALL.find((b) => b.id === "finding")!.text.lines[1]);
  });

  it("renders nothing while no board stands", () => {
    act(() => useStore.setState({ taughtBoards: [] }));
    render();
    expect(host.innerHTML).toBe("");
  });

  it("is hidden by the app's own pattern, not by a private style", () => {
    render();
    const region = host.querySelector("[data-teach-boards-reading]");
    expect(region).not.toBeNull();
    expect(region!.getAttribute("class")).toContain("sr-only");
    expect(host.querySelectorAll('[role="note"]').length).toBe(ALL.length);
  });
});
