/**
 * Recording state for the share studio.
 *
 * Owns the recorder, the clock, the automatic stops and the object URL, and
 * reports only what was measured: elapsed wall time since the encoder opened,
 * bytes in the chunks that arrived, frames that were composited. The caption
 * numbers are frozen when the recording starts, so the release card describes
 * the city the shot came from even if another scan lands behind the panel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CityData } from "../city/types";
import { useStore } from "../stores/useStore";
import {
  CityRecorder,
  RecorderUnavailable,
  findScene,
  type RecordingMeasurement,
} from "../share/capture";
import {
  CAPTURE_FORMATS,
  MAX_SKEW,
  MIME_CANDIDATES,
  extensionForMime,
  pickMimeType,
  type FormatId,
} from "../share/formats";
import { downloadFileName, frameTexts } from "../share/privacy";

export type LengthMode =
  { kind: "build" } | { kind: "seconds"; seconds: number } | { kind: "manual" };

export type CapturePhase = "idle" | "recording" | "finalizing" | "ready" | "failed";

export type CaptureErrorKey =
  "studio.errorNoCanvas" | "studio.errorNoRecorder" | "studio.errorEmpty" | "studio.errorSkew";

export interface CaptureResult extends RecordingMeasurement {
  fileName: string;
  previewUrl: string;
}

export interface StartOptions {
  city: CityData;
  focusPath: string[];
  format: FormatId;
  showNames: boolean;
  includeCredit: boolean;
  length: LengthMode;
  /** The fitted start/end pose for this output aspect. */
  hero?: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
  /** Open on the finished city for a beat before replaying the build. */
  hook?: boolean;
}

/** How often the live counters are read while a shot runs. */
const TICK_MS = 200;
/** Result-first hook: long enough to read the city, short enough to keep. */
const HOOK_MS = 700;

export function useCityCapture() {
  const buildPhase = useStore((s) => s.buildPhase);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [frames, setFrames] = useState(0);
  const [framing, setFraming] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<{
    key: CaptureErrorKey;
    vars?: Record<string, string>;
  } | null>(null);

  const recorderRef = useRef<CityRecorder | null>(null);
  const pendingRef = useRef<{ fileName: string } | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const hookTimerRef = useRef<number | null>(null);
  const lengthRef = useRef<LengthMode>({ kind: "manual" });
  const sawConstructionRef = useRef(false);
  const runIdRef = useRef(0);

  // The codec this browser will actually be handed, asked once. Null means no
  // WebM profile is offered here and recording is not possible.
  const mimeType = useMemo(() => pickMimeType(MIME_CANDIDATES), []);

  const clearTimers = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (hookTimerRef.current !== null) {
      window.clearTimeout(hookTimerRef.current);
      hookTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (recorder: CityRecorder): void => {
      const runId = runIdRef.current;
      setPhase("finalizing");
      clearTimers();
      void recorder.stop().then(
        (measurement) => {
          if (runId !== runIdRef.current) return;
          recorderRef.current = null;
          useStore.getState().setShareHero(null);
          const pending = pendingRef.current;
          if (measurement.bytes === 0 || !pending) {
            setPhase("failed");
            setError({ key: "studio.errorEmpty" });
            return;
          }
          if (measurement.scale.skew > MAX_SKEW) {
            setPhase("failed");
            setError({
              key: "studio.errorSkew",
              vars: { skew: `${(measurement.scale.skew * 100).toFixed(2)} %` },
            });
            return;
          }
          const previewUrl = URL.createObjectURL(measurement.blob);
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = previewUrl;
          setResult({ ...measurement, ...pending, previewUrl });
          setPhase("ready");
        },
        () => {
          if (runId !== runIdRef.current) return;
          recorder.dispose();
          recorderRef.current = null;
          useStore.getState().setShareHero(null);
          setPhase("failed");
          setError({ key: "studio.errorNoRecorder" });
        },
      );
    },
    [clearTimers],
  );

  const stop = useCallback((): void => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    finish(recorder);
  }, [finish]);

  const start = useCallback(
    (options: StartOptions): void => {
      if (recorderRef.current) return;
      if (!mimeType) {
        setPhase("failed");
        setError({ key: "studio.errorNoRecorder" });
        return;
      }
      const scene = findScene();
      if (!scene) {
        setPhase("failed");
        setError({ key: "studio.errorNoCanvas" });
        return;
      }
      // The hero is fitted for the output aspect before the canvas takes that
      // aspect, so the projection and the pose agree by the time the encoder
      // opens. duration 0 is a cut: the take starts on the finished city.
      if (options.hero) {
        useStore.getState().setShareHero(options.hero);
        useStore.getState().requestFly({
          position: options.hero.position,
          target: options.hero.target,
          duration: 0,
        });
      }
      let recorder: CityRecorder | null = null;
      try {
        recorder = new CityRecorder({
          format: CAPTURE_FORMATS[options.format],
          mimeType,
          canvas: scene.canvas,
          wrapper: scene.wrapper,
          frameTexts: () => frameTexts(options.city, options.focusPath, options.showNames),
          includeCredit: options.includeCredit,
          onEncoderStarted: () => {
            if (options.length.kind !== "build") return;
            if (options.hook) {
              hookTimerRef.current = window.setTimeout(() => {
                hookTimerRef.current = null;
                useStore.getState().replayConstruction();
              }, HOOK_MS);
            } else {
              useStore.getState().replayConstruction();
            }
          },
        });
        recorder.start();
      } catch (cause) {
        recorder?.dispose();
        useStore.getState().setShareHero(null);
        setPhase("failed");
        setError({
          key:
            cause instanceof RecorderUnavailable
              ? "studio.errorNoRecorder"
              : "studio.errorNoCanvas",
        });
        return;
      }
      recorderRef.current = recorder;
      runIdRef.current += 1;
      pendingRef.current = {
        fileName: downloadFileName(
          options.city.repo.name,
          new Date(),
          options.showNames,
          extensionForMime(mimeType),
        ),
      };
      lengthRef.current = options.length;
      sawConstructionRef.current = useStore.getState().buildPhase === "constructing";
      setResult(null);
      setError(null);
      setBytes(0);
      setFrames(0);
      setElapsedMs(0);
      setPhase("recording");
      timerRef.current = window.setInterval(() => {
        const live = recorderRef.current;
        if (!live) return;
        setElapsedMs(live.elapsedMs);
        setBytes(live.recordedBytes);
        setFrames(live.frames);
        setFraming(live.framing);
      }, TICK_MS);
      if (options.length.kind === "seconds") {
        autoStopRef.current = window.setTimeout(stop, options.length.seconds * 1000);
      }
    },
    [mimeType, stop],
  );

  // Leave the camera's final overview glide in the file. The city finishes
  // building before its reveal flight ends, so an immediate stop would cut the
  // shot just as the project becomes legible.
  useEffect(() => {
    if (phase !== "recording" || lengthRef.current.kind !== "build") return;
    if (buildPhase === "constructing") {
      sawConstructionRef.current = true;
      return;
    }
    if (buildPhase !== "built" || !sawConstructionRef.current || autoStopRef.current !== null)
      return;
    autoStopRef.current = window.setTimeout(stop, 3400);
  }, [buildPhase, phase, stop]);

  const reset = useCallback((): void => {
    runIdRef.current += 1;
    clearTimers();
    recorderRef.current?.dispose();
    recorderRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    pendingRef.current = null;
    useStore.getState().setShareHero(null);
    setResult(null);
    setError(null);
    setBytes(0);
    setFrames(0);
    setElapsedMs(0);
    setFraming(false);
    setPhase("idle");
  }, [clearTimers]);

  // A panel closed mid-shot must not leave the encoder open or the canvas
  // boxed into the recording frame, and a Blob without a revoked URL is held
  // memory for the rest of the session.
  useEffect(
    () => () => {
      clearTimers();
      recorderRef.current?.dispose();
      recorderRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [clearTimers],
  );

  return {
    phase,
    framing,
    elapsedMs,
    bytes,
    frames,
    result,
    error,
    mimeType,
    canRecord: mimeType !== null,
    start,
    stop,
    reset,
  };
}
