// @vitest-environment jsdom
// Anonymity is the load-bearing rule of the share lane.
//
// A city video is a picture of somebody's private folder tree: districts are
// their folders, buildings are their files. The recording captures the WebGL
// canvas, and every name the app shows is DOM (drei `<Html>` plates, panels,
// tooltips), so it cannot reach the file. That is the argument, and this file
// is the check: the compositor, which is the one thing allowed to put ink into
// a frame, is run against a city that carries real names, and the recorded
// answer must be that nothing was drawn.
//
// The same rule has a second surface, the name the browser saves under. A
// download name built from the picker would read like a path on the user's
// disk, so it is built from the project name and the date, and the test feeds
// it a project name that *is* a path to see that it stays one segment.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compositeFrame, drawCredit, type FrameCanvas } from "../src/share/capture";
import {
  downloadFileName,
  frameTexts,
  projectNames,
  mentionsProjectName,
} from "../src/share/privacy";
import { ShareStudio } from "../src/components/ShareStudio";
import { useStore } from "../src/stores/useStore";
import { OPEN_STUDIO_EVENT } from "../src/share/studioBus";
import type { CityData } from "../src/city/types";

const city = {
  repo: { owner: "local", name: "zahlungstools-backend", branch: "main" },
  analysisId: "scan-anon-1",
  totalFiles: 41,
  renderedFiles: 12,
  totalLines: 9800,
  codeLines: 8600,
  languages: { TypeScript: 8600, Markdown: 1200 },
  findingsBySeverity: { P0: 1, P1: 2, P2: 0 },
  fileConnections: [],
  dirConnections: [],
  meta: {},
  tree: {
    name: "zahlungstools-backend",
    path: "",
    fileCount: 41,
    linesOfCode: 9800,
    findingsBySeverity: { P0: 1, P1: 2, P2: 0 },
    children: [
      { name: "kassenkern", path: "kassenkern", children: [], detailFiles: [], districtFiles: [] },
      { name: "belegdruck", path: "belegdruck", children: [], detailFiles: [], districtFiles: [] },
    ],
    detailFiles: [
      {
        id: "f1",
        name: "SEPA_Ueberweisung.ts",
        path: "kassenkern/SEPA_Ueberweisung.ts",
        language: "TypeScript",
        linesOfCode: 410,
        cyclomaticComplexity: 22,
        threatLevel: "critical",
        findings: [],
      },
    ],
    remainingFiles: 0,
    districtFiles: [],
  },
} as unknown as CityData;

/** A 2D context that writes nothing but reports everything it was asked to. */
function recordingContext(): { ctx: FrameCanvas; drawn: string[] } {
  const drawn: string[] = [];
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: (text: string): void => {
      drawn.push(text);
    },
    measureText: (text: string): { width: number } => ({ width: text.length * 8 }),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
  } as unknown as FrameCanvas;
  return { ctx, drawn };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

function mountStudio(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  useStore.setState({ cityData: city, buildPhase: "built", focusPath: [] });
  root = createRoot(container);
  act(() => root.render(<ShareStudio />));
  act(() => window.dispatchEvent(new Event(OPEN_STUDIO_EVENT)));
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  useStore.setState({ cityData: null });
});

describe("a recorded city carries no names unless asked", () => {
  it("the optional product credit contains no project names", () => {
    const { ctx, drawn } = recordingContext();
    drawCredit(ctx, { width: 1280, height: 720 });
    expect(drawn).toEqual(["EPHEMORA  /  SKYLINE"]);
    expect(mentionsProjectName(drawn.join(" "), projectNames(city))).toBe(false);
  });
  it("knows names, so the empty answer below is not an empty test", () => {
    const names = projectNames(city);
    expect(names).toContain("SEPA_Ueberweisung.ts");
    expect(names).toContain("kassenkern");
    expect(names).toContain("zahlungstools-backend");
  });

  it("draws no text at all into a frame while the opt-in is off", () => {
    const texts = frameTexts(city, [], false);
    expect(texts).toEqual([]);
    const { ctx, drawn } = recordingContext();
    const telemetry = {
      drawnTexts: new Set<string>(),
      frames: 0,
      scale: { x: 0, y: 0, skew: 1 },
      cropped: 0,
    };
    compositeFrame(
      ctx,
      { width: 1280, height: 720 },
      { width: 1280, height: 720 },
      texts,
      telemetry,
    );
    expect(drawn).toEqual([]);
    expect([...telemetry.drawnTexts]).toEqual([]);
  });

  it("draws nothing on a drilled level either", () => {
    const texts = frameTexts(city, ["kassenkern", "belegdruck"], false);
    const { ctx, drawn } = recordingContext();
    compositeFrame(ctx, { width: 960, height: 960 }, { width: 960, height: 960 }, texts);
    expect(texts).toEqual([]);
    expect(drawn).toEqual([]);
  });

  it("does draw them once the user opts in, and only what the switch promised", () => {
    const texts = frameTexts(city, [], true);
    expect(texts.map((t) => t.text)).toContain("zahlungstools-backend");
    expect(texts.some((t) => t.text.includes("kassenkern"))).toBe(true);
    const { ctx, drawn } = recordingContext();
    compositeFrame(ctx, { width: 1280, height: 720 }, { width: 1280, height: 720 }, texts);
    expect(mentionsProjectName(drawn.join(" "), projectNames(city))).toBe(true);
    // File titles stay out: the opt-in names the project and its districts,
    // not every building in it.
    expect(drawn.join(" ")).not.toContain("SEPA_Ueberweisung.ts");
  });

  it("keeps the names switch unchecked when the studio opens", () => {
    mountStudio();
    const box = container.querySelector<HTMLInputElement>('.share-names input[type="checkbox"]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(false);
    const disclosure = container.querySelector(".share-names-disclosure");
    expect(disclosure?.textContent).toContain("project name");
  });
});

describe("the saved file is named after the project, never the disk", () => {
  const taken = new Date(2026, 9, 8, 23, 41, 12);

  it("uses a generic name by default", () => {
    expect(downloadFileName("zahlungstools-backend", taken)).toBe("ephemora-city-2026-10-08.webm");
  });

  it("carries project and date only when names are enabled", () => {
    expect(downloadFileName("zahlungstools-backend", taken, true)).toBe(
      "ephemora-zahlungstools-backend-2026-10-08.webm",
    );
  });

  it("is one name even when the project name is a path", () => {
    const name = downloadFileName("/home/dev/Dokumente/vertraulich/projekt", taken, true);
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
    expect(name.split("/")).toHaveLength(1);
    expect(name.startsWith("ephemora-")).toBe(true);
  });

  it("drops the characters an operating system would reinterpret", () => {
    const name = downloadFileName('a<b>c:d?"e|f*g', taken, true);
    expect(name).not.toMatch(/[\\/<>:"|?*]/);
  });

  it("still has a name when the project has none", () => {
    expect(downloadFileName("", taken)).toBe("ephemora-city-2026-10-08.webm");
  });

  it("is local-date, not UTC, so it matches the day on the user's screen", () => {
    expect(downloadFileName("p", new Date(2026, 0, 1, 0, 5))).toContain("2026-01-01");
  });
});
