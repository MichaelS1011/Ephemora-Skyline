// @vitest-environment jsdom
// Anonymity is the load-bearing rule of the share lane.
//
// A city video is a picture of somebody's private folder tree: districts are
// their folders, buildings are their files. The recording captures the WebGL
// canvas, and every name the app shows is DOM (drei `<Html>` plates, panels,
// tooltips), so it cannot reach the file. That is the argument, and this file
// is the check: the compositor, which is the one thing allowed to put ink into
// a frame, is run against a city that carries real names, and the recorded
// answer must be that no project ink was drawn. The one string that is always
// drawn is the product mark, and it names the tool, never the project.
//
// The same rule has a second surface, the name the browser saves under. A
// download name built from the picker would read like a path on the user's
// disk, so it is built from the project name and the date, and the test feeds
// it a project name that *is* a path to see that it stays one segment.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CREDIT_TEXT, compositeFrame, drawCredit, type FrameCanvas } from "../src/share/capture";
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

interface InkedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A context that also reports the plates it was asked to fill, and measures
 * like the monospace the compositor asks for: one glyph is 0.6 em wide. So a
 * layout claim in this file is a claim about real pixel widths, not about a
 * stub that agrees with whatever the code did.
 */
function inkingContext(): { ctx: FrameCanvas; drawn: string[]; plates: InkedRect[] } {
  const drawn: string[] = [];
  const plates: InkedRect[] = [];
  const glyph = (): number => {
    const size = Number(/(\d+)px/.exec(String(ctx.font))?.[1] ?? "16");
    return size * 0.6;
  };
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
    measureText: (text: string): { width: number } => ({ width: text.length * glyph() }),
    beginPath: vi.fn(),
    roundRect: (x: number, y: number, width: number, height: number): void => {
      plates.push({ x, y, width, height });
    },
    fill: vi.fn(),
  } as unknown as FrameCanvas;
  return { ctx, drawn, plates };
}

function overlaps(a: InkedRect, b: InkedRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
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
  it("the product mark is one fixed line and names no project", () => {
    const { ctx, drawn } = recordingContext();
    drawCredit(ctx, { width: 1280, height: 720 });
    expect(drawn.join("")).toBe(CREDIT_TEXT);
    expect(mentionsProjectName(drawn.join(""), projectNames(city))).toBe(false);
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

describe("the mark is on the file whatever the rest of the frame says", () => {
  it("burns into a frame that carries no project ink at all", () => {
    const { ctx, drawn } = inkingContext();
    compositeFrame(ctx, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, []);
    drawCredit(ctx, { width: 1920, height: 1080 });
    expect(drawn.join("")).toBe(CREDIT_TEXT);
  });

  it("offers the studio no control that could switch it off", () => {
    mountStudio();
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.closest(".share-names")).not.toBeNull();
    expect(container.querySelector(".share-mark-text")?.textContent).toBe(CREDIT_TEXT);
  });
});

describe("the mark and a names band share the lower edge without colliding", () => {
  const longLevel =
    "kassenkern / belegdruck / archivkern / zahlungskern / belegdruck / kassenkern / archiv";
  for (const [width, height] of [
    [1920, 1080],
    [1080, 1080],
    [1080, 1920],
  ] as const) {
    it(`keeps both plates inside the frame and apart at ${width}×${height}`, () => {
      const { ctx, drawn, plates } = inkingContext();
      compositeFrame(ctx, { width, height }, { width, height }, [
        { text: "zahlungstools-backend", slot: "project" },
        { text: longLevel, slot: "level" },
      ]);
      drawCredit(ctx, { width, height });
      const mark = plates[plates.length - 1]!;
      const bands = plates.slice(0, -1);
      expect(bands).toHaveLength(2);
      expect(mark.x + mark.width).toBeLessThanOrEqual(width);
      expect(mark.y + mark.height).toBeLessThanOrEqual(height);
      for (const band of bands) {
        expect(overlaps(band, mark), "a names plate runs under the mark").toBe(false);
        expect(band.x + band.width).toBeLessThanOrEqual(width);
      }
      // The level text sits inside its own plate: no ink runs past its edge.
      const level = drawn[1]!;
      const plate = bands[1]!;
      const size = plate.height / 2;
      expect(level.length * 0.6 * size + size).toBeLessThanOrEqual(plate.width + 1);
      expect(level.length).toBeLessThanOrEqual(longLevel.length);
    });
  }
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

  it("wears the extension of the container the recorder actually opened", () => {
    expect(downloadFileName("city", taken, false, "mp4")).toBe("ephemora-city-2026-10-08.mp4");
  });

  it("is local-date, not UTC, so it matches the day on the user's screen", () => {
    expect(downloadFileName("p", new Date(2026, 0, 1, 0, 5))).toContain("2026-01-01");
  });
});
