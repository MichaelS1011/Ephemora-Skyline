// @vitest-environment jsdom
// The share result hands over the file and nothing else. The three suggested
// captions and the platform rows were removed on 2026-10-21: a caption posted
// in the user's voice is a liability, and every platform's own composer is a
// better place to write one. This guard keeps the removal in place.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareCard } from "../src/components/ShareCard";
import { ShareStudio } from "../src/components/ShareStudio";
import { codecLabel } from "../src/share/formats";
import { OPEN_STUDIO_EVENT } from "../src/share/studioBus";
import { useStore } from "../src/stores/useStore";
import type { CityData } from "../src/city/types";
import type { CaptureResult } from "../src/hooks/useCityCapture";

const result: CaptureResult = {
  blob: new Blob(["mp4"], { type: "video/mp4" }),
  posterDataUrl: undefined,
  bytes: 5_447_863,
  durationMs: 15_000,
  frames: 450,
  width: 1920,
  height: 1080,
  fps: 30,
  mimeType: "video/mp4;codecs=avc1.42E01E",
  scale: { x: 1, y: 1, skew: 0 },
  drawnTexts: [],
  shotCssSize: { width: 1600, height: 900 },
  recorderMime: "video/mp4;codecs=avc1.420028",
  framed: true,
  cropped: 0,
  fileName: "ephemora-city-2026-10-21.mp4",
  previewUrl: "blob:preview",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(navigator, "share", { value: vi.fn(), configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
  vi.unstubAllGlobals();
});

const text = (): string => (container.textContent ?? "").replace(/\s+/g, " ");

describe("the share result is a file, not a draft", () => {
  it("offers save and the system share dialog, and says what the dialog receives", async () => {
    await act(async () =>
      root.render(
        createElement(ShareCard, { result, lang: "de", showNames: false, onAgain: () => {} }),
      ),
    );
    expect(text()).toContain("Video speichern");
    expect(text()).toContain("Video teilen");
    expect(text()).toContain("nur die Videodatei übergeben");
  });

  it("carries no suggested caption and no platform row", async () => {
    await act(async () =>
      root.render(
        createElement(ShareCard, { result, lang: "de", showNames: false, onAgain: () => {} }),
      ),
    );
    expect(text()).not.toContain("Text dazu");
    expect(text()).not.toContain("Selbst posten");
    expect(text()).not.toContain("Trocken");
    expect(text()).not.toContain("Freundlich");
    expect(text()).not.toContain("Neugierig");
    expect(container.querySelector(".share-captions, .share-platforms")).toBeNull();
  });

  it("names the container and codec the encoder actually used", async () => {
    await act(async () =>
      root.render(
        createElement(ShareCard, { result, lang: "de", showNames: false, onAgain: () => {} }),
      ),
    );
    expect(text()).toContain("MP4 · H.264");
    expect(text()).toContain("1920 × 1080");
    expect(text()).toContain("ephemora-city-2026-10-21.mp4");
  });
});

describe("codecLabel", () => {
  it("translates the recorder's strings without inventing a format", () => {
    expect(codecLabel("video/mp4;codecs=avc1.420028")).toBe("MP4 · H.264");
    expect(codecLabel("video/webm;codecs=vp9")).toBe("WebM · VP9");
    expect(codecLabel("video/webm;codecs=vp8")).toBe("WebM · VP8");
    expect(codecLabel("video/quicktime")).toBe("video/quicktime");
  });
});

/**
 * The same dialog answers the same question twice: the result card names the
 * file's codec as "MP4 · H.264", while the quality row above it printed the
 * encoder's raw string. One dialog, one vocabulary — and the raw profile stays
 * reachable in the title, because which H.264 level was asked for is not
 * something the label can carry.
 *
 * The studio is mounted for real here, not the helper alone: the guard is about
 * what a person sees in the dl.
 */
const studioCity = {
  repo: { owner: "local", name: "zahlungstools-backend", branch: "main" },
  analysisId: "scan-codec-row-1",
  totalFiles: 2,
  renderedFiles: 2,
  tree: {
    name: "zahlungstools-backend",
    path: "",
    children: [],
    detailFiles: [],
    districtFiles: [],
  },
} as unknown as CityData;

/** The profile a Chromium browser answers with: raw, codecs parameter and all. */
const RAW_MP4 = "video/mp4;codecs=avc1.42E01E";

/** Open the studio and switch to the video tab, where the quality dl lives. */
async function mountVideoStudio(lang: "en" | "de"): Promise<void> {
  useStore.setState({
    cityData: studioCity,
    buildPhase: "built",
    focusPath: [],
    prefs: { ...useStore.getInitialState().prefs, lang },
  });
  await act(async () => root.render(createElement(ShareStudio)));
  await act(async () => {
    window.dispatchEvent(new Event(OPEN_STUDIO_EVENT));
  });
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>(".share-media-button"));
  const video = tabs[1];
  if (!video) throw new Error("the studio offers no video tab to switch to");
  await act(async () => {
    video.click();
  });
}

/** The quality row whose `dt` reads `label`, or undefined when there is none. */
function qualityRow(label: string): { dt: HTMLElement; dd: HTMLElement } | undefined {
  const rows = Array.from(container.querySelectorAll<HTMLElement>(".share-quality > div"));
  for (const row of rows) {
    const dt = row.querySelector<HTMLElement>("dt");
    const dd = row.querySelector<HTMLElement>("dd");
    if (dt && dd && (dt.textContent ?? "").trim() === label) return { dt, dd };
  }
  return undefined;
}

describe("the studio's quality row speaks the card's vocabulary", () => {
  beforeEach(() => {
    // pickMimeType asks the browser one candidate at a time, so the row has a
    // real raw string to translate rather than an assumption about the machine.
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (type: string): boolean => type === RAW_MP4,
    });
  });

  afterEach(() => {
    // In act(): the studio is still mounted here, so dropping the city is a
    // render it has to answer, not a bare store write.
    act(() => {
      useStore.setState({ cityData: null });
    });
  });

  it("shows MP4 · H.264 in English and keeps the raw profile in the title", async () => {
    await mountVideoStudio("en");
    const row = qualityRow("Codec");
    if (!row) throw new Error("the quality dl has no English Codec row");
    expect(row.dd.textContent).toBe("MP4 · H.264");
    expect(row.dd.getAttribute("title")).toBe(RAW_MP4);
  });

  it("shows the same value in German, where only the row label is translated", async () => {
    await mountVideoStudio("de");
    const row = qualityRow("Video-Codec");
    if (!row) throw new Error("the quality dl has no German Video-Codec row");
    expect(row.dt.textContent).toBe("Video-Codec");
    expect(row.dd.textContent).toBe("MP4 · H.264");
    expect(row.dd.getAttribute("title")).toBe(RAW_MP4);
  });

  it("keeps the raw MIME string out of every visible quality value", async () => {
    await mountVideoStudio("de");
    const visible = Array.from(container.querySelectorAll<HTMLElement>(".share-quality dd"))
      .map((dd) => dd.textContent ?? "")
      .join(" ");
    expect(visible).toContain("MP4 · H.264");
    expect(visible).not.toMatch(/video\/|codecs=/);
  });
});
