import { useEffect, useState } from "react";
import { allFiles } from "../city/layout";
import { formatCount, t, type DictKey, type Lang } from "../i18n";
import { useStore } from "../stores/useStore";
import type { VerifyComparabilityReason } from "../verify";

/** A sample path shown beside the count, so the reader knows which earlier visit. */
function samplePath(city: NonNullable<ReturnType<typeof useStore.getState>["cityData"]>): string {
  try {
    return allFiles(city)[0]?.file.path ?? "";
  } catch {
    // a partial tree is a missing hint, not a broken card
    return "";
  }
}

/**
 * "What changed since I was last here" — the one question a developer asks on
 * the second visit. The backend has answered it for agents since the agent
 * channel was built (`POST /api/verify`); this is the human's door to the same
 * answer.
 *
 * Four numbers: new, no longer detected, at another line, unchanged. A fifth
 * state exists for the pair that cannot be read against each other at all —
 * a different project, scanner set or sampled scan — and it replaces the
 * numbers rather than adding a footnote to them. The words carry the looseness
 * the comparison really has — a vanished fingerprint is also what a renamed
 * file leaves behind — so the reader does not have to hover to be told that
 * "no longer detected" is not "fixed". Colour never carries the meaning either:
 * no green on this row, because green would say "fixed" louder than any
 * tooltip can take back.
 */
const REASON_KEY = {
  "different-project": "ctx.sinceReasonProject",
  "different-engines": "ctx.sinceReasonEngines",
  "different-dependency-runner": "ctx.sinceReasonRunner",
  "live-delta": "ctx.sinceReasonLive",
  "preview-sample": "ctx.sinceReasonPreview",
} satisfies Record<VerifyComparabilityReason, DictKey>;

export function SinceLastScan({
  lang,
  previousScan,
  anchorsUnreadable = false,
  identityGuessed = false,
}: {
  lang: Lang;
  previousScan: boolean;
  /** The browser's anchor table exists and would not parse. Over that, the
   *  row may not claim "no earlier scan" — it says what it cannot see. */
  anchorsUnreadable?: boolean;
  /** The project key is inferred, not a configured root. */
  identityGuessed?: boolean;
}) {
  const verify = useStore((s) => s.verify);
  const runVerify = useStore((s) => s.runVerify);
  const cityData = useStore((s) => s.cityData);
  const setShowFindings = useStore((s) => s.setShowFindings);
  const setNewFindingsOnly = useStore((s) => s.setNewFindingsOnly);
  const [showMoved, setShowMoved] = useState(false);
  // The opening ask lives here, next to the row it fills. In App the card is
  // mounted and unmounted as the view changes, so an effect there measured as
  // "idle" at the moment the reader looks; this component is on screen exactly
  // when the question matters.
  useEffect(() => {
    if (previousScan) void runVerify({ silent: true });
  }, [previousScan, runVerify]);
  if (!cityData) return null;

  // The demo city is sample data with a fixed id; a comparison against a real
  // scan with the same file list would be about two different things.
  if (cityData.analysisId === "demo-001") return null;

  const report = verify.status === "ran" ? verify.report : null;
  const newFindings = report?.newFindings ?? [];
  const comparable = report?.comparable ?? { ok: true, reasons: [] };
  const openNewFindings = (): void => {
    setNewFindingsOnly(true);
    setShowFindings(true);
  };
  return (
    <div className="py-4" data-since-last-scan={verify.status}>
      <div
        className="text-[length:var(--fs-meta)] tracking-widest mb-2"
        style={{ color: "#d8c9a3" }}
      >
        {verify.status === "ran" && verify.previousScannedAt
          ? t(lang, "ctx.sinceTitleDated", {
              date: new Date(verify.previousScannedAt).toLocaleDateString(
                lang === "de" ? "de-DE" : "en-GB",
                { day: "numeric", month: "short" },
              ),
            })
          : verify.status === "ran"
            ? t(lang, "ctx.sinceTitleEarlier")
            : t(lang, "ctx.sinceTitle")}
      </div>
      {verify.status === "idle" &&
        (previousScan ? (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--meta-strong)" }}>
            <button
              type="button"
              onClick={() => void runVerify()}
              className="underline decoration-dotted underline-offset-2"
            >
              {t(lang, "ctx.sinceAsk")}
            </button>
            {samplePath(cityData) && (
              <span className="font-mono text-[length:var(--fs-meta)] opacity-80">
                {" "}
                · {samplePath(cityData)}
              </span>
            )}
          </p>
        ) : anchorsUnreadable ? (
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: "var(--meta-strong)" }}
            role="status"
            data-anchors-unreadable="true"
          >
            ⚠ {t(lang, "ctx.sinceAnchorsUnreadable")}
          </p>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--meta-strong)" }}>
            {t(lang, "ctx.sinceNone")}
          </p>
        ))}
      {verify.status === "running" && (
        <p
          className="text-[12px]"
          style={{ color: "var(--meta-strong)" }}
          role="status"
          aria-live="polite"
        >
          {t(lang, "ctx.sinceRunning")}
        </p>
      )}
      {verify.status === "none" && (
        <p className="text-[12px]" style={{ color: "var(--meta-strong)" }}>
          {t(lang, "ctx.sinceNone")}
        </p>
      )}
      {verify.status === "aged-out" && (
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--meta-strong)" }}>
          {t(lang, "ctx.sinceAgedOut")}
        </p>
      )}
      {verify.status === "failed" && (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--meta-strong)" }}
          role="status"
        >
          {t(lang, "ctx.sinceFailed")}
        </p>
      )}
      {report && !comparable.ok && (
        <div className="flex flex-col gap-1" data-verify-not-comparable="true" role="status">
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--meta-strong)" }}>
            {t(lang, "ctx.sinceNotComparable", {
              reasons: comparable.reasons.map((reason) => t(lang, REASON_KEY[reason])).join(", "),
            })}
          </p>
          <p
            className="text-[length:var(--fs-meta)] leading-relaxed"
            style={{ color: "var(--meta-strong)" }}
          >
            {t(lang, "ctx.sinceNotComparableWhy")}
          </p>
        </div>
      )}
      {report && comparable.ok && (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--meta-strong)" }}>
            {[
              ["ctx.sinceNew", "ctx.sinceNewTip", newFindings.length],
              ["ctx.sinceGone", "ctx.sinceGoneTip", report.gone.length],
              ["ctx.sinceMoved", "ctx.sinceMovedTip", report.moved.length],
              ["ctx.sincePresent", "ctx.sincePresentTip", report.present.length],
            ].map(([key, tip, n], index) => {
              const text = t(lang, key as Parameters<typeof t>[1], {
                n: formatCount(lang, Number(n)),
              });
              return (
                <span key={String(key)} title={t(lang, tip as Parameters<typeof t>[1])}>
                  {index > 0 && " · "}
                  {key === "ctx.sinceNew" && Number(n) > 0 ? (
                    <button
                      type="button"
                      onClick={openNewFindings}
                      data-since-new={n}
                      className="underline decoration-dotted underline-offset-2"
                      style={{ color: "var(--meta-strong)" }}
                    >
                      {text}
                    </button>
                  ) : (
                    <span className="tabular-nums">{text}</span>
                  )}
                </span>
              );
            })}
          </p>
          {identityGuessed && (
            <p
              className="text-[length:var(--fs-meta)] leading-relaxed"
              style={{ color: "var(--meta-strong)" }}
              data-verify-identity-guessed="true"
            >
              {t(lang, "ctx.sinceIdentityGuessed")}
            </p>
          )}
          {report.moved.length > 0 && (
            <>
              <p
                className="text-[length:var(--fs-meta)] leading-relaxed"
                style={{ color: "var(--meta-strong)" }}
              >
                {t(lang, "ctx.sinceWhy")}
              </p>
              <button
                type="button"
                onClick={() => setShowMoved((v) => !v)}
                aria-expanded={showMoved}
                className="self-start text-[length:var(--fs-meta)] underline decoration-dotted underline-offset-2"
                style={{ color: "var(--meta-strong)" }}
              >
                {t(lang, "ctx.sinceDetailed")}
              </button>
              {showMoved && (
                <ul
                  className="text-[length:var(--fs-meta)] font-mono flex flex-col gap-0.5"
                  style={{ color: "var(--meta-strong)" }}
                >
                  {report.moved.map(({ from, to }) => (
                    <li key={`${from.path}:${from.ruleId}:${from.line}`}>
                      {from.path} ·{" "}
                      {t(lang, "findings.movedLine", { from: from.line, to: to.line })}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
