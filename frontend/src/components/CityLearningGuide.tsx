import { useId, useLayoutEffect, useRef, useState } from "react";
import { allFiles, resolveDir, tourStops } from "../city/layout";
import { findingKey } from "../reviews";
import { formatCount } from "../i18n";
import { useStore } from "../stores/useStore";
import { learningCopy as copy } from "./learningCopy";
import "../design/learning.css";

/** Opt-in, grounded in this level's data; no timer, modal or completion claim. */
export function CityLearningGuide() {
  const city = useStore((s) => s.cityData);
  const lang = useStore((s) => s.prefs.lang);
  const focusPath = useStore((s) => s.focusPath);
  const setFocusPath = useStore((s) => s.setFocusPath);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const setFocusedFindingKey = useStore((s) => s.setFocusedFindingKey);
  const [step, setStep] = useState(0);
  const contentId = useId();
  const summaryRef = useRef<HTMLElement>(null);
  const returnFocus = useRef(false);
  useLayoutEffect(() => {
    if (!returnFocus.current) return;
    returnFocus.current = false;
    summaryRef.current?.focus();
  }, [focusPath]);
  if (!city) return null;

  const dir = resolveDir(city.tree, focusPath);
  const largest = [...dir.children].sort(
    (a, b) => b.fileCount - a.fileCount || a.path.localeCompare(b.path),
  )[0];
  const inScope = (path: string) => !dir.path || path.startsWith(`${dir.path}/`);
  const example = allFiles(city)
    .filter(({ file }) => inScope(file.path))
    .sort(
      (a, b) =>
        b.file.cyclomaticComplexity - a.file.cyclomaticComplexity ||
        a.file.path.localeCompare(b.file.path),
    )[0];
  const evidence = tourStops(city).find(({ file }) => inScope(file.path));
  const demo = city.scanProvenance?.regex === false;
  const labels = ["structure", "shape", "evidence"] as const;
  const number = (n: number) => formatCount(lang, n);

  const openEvidence = () => {
    if (!evidence) return;
    // Use the existing focus channel so the source opens on the actual finding.
    navigateToFile(evidence.file.id);
    const severityOrder = { P0: 0, P1: 1, P2: 2 };
    const index = evidence.file.findings
      .map((finding, position) => ({ finding, position }))
      .sort((a, b) => severityOrder[a.finding.severity] - severityOrder[b.finding.severity])[0]!
      .position;
    setFocusedFindingKey(findingKey(evidence.file.id, index));
  };

  return (
    <details className="city-learning">
      <summary ref={summaryRef}>{copy(lang, "title")}</summary>
      <div className="city-learning-steps" role="group" aria-label={copy(lang, "steps")}>
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={step === index}
            aria-controls={contentId}
            onClick={() => setStep(index)}
          >
            <span aria-hidden="true">{index + 1}</span> {copy(lang, label)}
          </button>
        ))}
      </div>
      <div
        className="city-learning-content"
        id={contentId}
        role="region"
        aria-label={copy(lang, labels[step]!)}
      >
        {step === 0 && (
          <>
            <p>{copy(lang, "structureText")}</p>
            {largest ? (
              <div className="city-learning-example">
                <span>{copy(lang, "largest")}</span>
                <strong>
                  {largest.name}{" "}
                  <small>
                    ({number(largest.fileCount)}{" "}
                    {copy(lang, largest.fileCount === 1 ? "file" : "files")})
                  </small>
                </strong>
                <button
                  type="button"
                  onClick={() => {
                    returnFocus.current = true;
                    setFocusPath([...focusPath, largest.name]);
                  }}
                >
                  {copy(lang, "enter")}
                </button>
              </div>
            ) : (
              <p>{copy(lang, dir.fileCount === 0 ? "empty" : "leaf")}</p>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <p>{copy(lang, "shapeText")}</p>
            <p>{copy(lang, "colorText")}</p>
            {example && (
              <div className="city-learning-example">
                <span>{copy(lang, "example")}</span>
                <strong title={example.file.path}>{example.file.name}</strong>
                <button type="button" onClick={() => navigateToFile(example.file.id)}>
                  {copy(lang, "openFile")}
                </button>
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <p>{copy(lang, "evidenceText")}</p>
            {demo && <p className="city-learning-caution">{copy(lang, "demo")}</p>}
            {evidence ? (
              <div className="city-learning-example">
                <strong title={evidence.file.path}>{evidence.file.name}</strong>
                {evidence.file.role === "test" && <p>{copy(lang, "test")}</p>}
                <button type="button" onClick={openEvidence}>
                  {copy(lang, "review")}
                </button>
              </div>
            ) : (
              <p>{copy(lang, "noEvidence")}</p>
            )}
          </>
        )}
      </div>
      <div className="city-learning-navigation">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>
          {copy(lang, "previous")}
        </button>
        <button type="button" disabled={step === 2} onClick={() => setStep(step + 1)}>
          {copy(lang, "next")}
        </button>
      </div>
    </details>
  );
}
