// @vitest-environment jsdom
// The share result hands over the file and nothing else. The three suggested
// captions and the platform rows were removed on 2026-10-21: a caption posted
// in the user's voice is a liability, and every platform's own composer is a
// better place to write one. This guard keeps the removal in place.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareCard, codecLabel } from "../src/components/ShareCard";
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
