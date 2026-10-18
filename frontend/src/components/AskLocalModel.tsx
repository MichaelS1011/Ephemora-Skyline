import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount, t, type DictKey } from "../i18n";
import { useLocalModel } from "../city/localModel";
import { useOrigin } from "../stores/useOrigin";
import { useStore } from "../stores/useStore";
import type { CityFinding } from "../city/types";

/**
 * "Ask the local model" — one sentence about one line, from a model on the desk.
 *
 * The curated knowledge in the backend explains a RULE. Only a model can say
 * something about this particular line, which is the one thing a solo developer
 * staring at a finding actually wants. So the card offers it, and offers it only
 * where the offer is true:
 *  - a model must be configured (`/api/health` says so, once per page);
 *  - there must be a server to ask — a carried file has none, and the guard
 *    would answer 503 to every question, which is not the same as an answer;
 *  - the finding must have the fingerprint the backend uses to find it again,
 *    because this request names a finding rather than pasting one.
 *
 * What travels is `analysisId`, `fingerprint` and the UI language. Deliberately
 * not the code: the browser holds the line, but the door that decides what a
 * model reads is `backend/src/services/security/llm-explain.ts`, and a second
 * copy of that decision in a click handler would drift from it. The backend
 * reads the finding out of its own store by the same fingerprint the verdicts
 * and the SARIF export use.
 */
type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; text: string; model: string; truncated: boolean }
  | { kind: "failed"; key: DictKey };

/** The reasons the door answers with, plus the two the HTTP status carries. */
type ExplainReason = "timeout" | "unreachable" | "model-error" | "not-local" | "gone" | "shut";

const reasonKey: Record<ExplainReason, DictKey> = {
  timeout: "panel.askModelTimeout",
  unreachable: "panel.askModelUnreachable",
  "model-error": "panel.askModelError",
  "not-local": "panel.askModelNotLocal",
  gone: "panel.askModelGone",
  shut: "panel.askModelShut",
};

/**
 * One question at a time for the whole page.
 *
 * A city opens several cards, and a local model serves one request at a time
 * anyway: five clicks would line five jobs up behind each other while the reader
 * watched four spinners for one answer. The gate is module-level on purpose — a
 * per-component flag cannot see the other cards.
 */
let inFlight = false;

export function AskLocalModel({ finding }: { finding: CityFinding }) {
  // The scan this finding belongs to — the same value the handoff and the
  // verdict writes use, read from the store rather than threaded through three
  // components that would only pass it on.
  const analysisId = useStore((s) => s.analysisId ?? s.cityData?.analysisId ?? null);
  const lang = useStore((s) => s.prefs.lang);
  const origin = useOrigin((s) => s.origin);
  const model = useLocalModel();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [asked, setAsked] = useState(false);
  // This card's hold on the queue and its own abort: a reader who closes the
  // panel mid-question must hand the machine back to the next card, and the
  // answer of a question nobody is waiting for should not be paid for.
  const holds = useRef(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      if (holds.current) {
        holds.current = false;
        inFlight = false;
      }
    },
    [],
  );

  // A model the operator never named must not be called "local model" inside a
  // German sentence — the fallback is the UI's to phrase, because the UI is the
  // one that knows which language it speaks.
  const named = model.model.length > 0;
  const askLabel = named
    ? t(lang, "panel.askModel", { model: model.model })
    : t(lang, "panel.askModelUnnamed");
  const thinkingLabel = named
    ? t(lang, "panel.askModelThinking", { model: model.model })
    : t(lang, "panel.askModelThinkingUnnamed");

  const ask = useCallback(async () => {
    if (!analysisId || !finding.fingerprint || inFlight) return;
    inFlight = true;
    holds.current = true;
    setState({ kind: "running" });
    setAsked(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/explain-finding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, fingerprint: finding.fingerprint, lang }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        text?: string;
        model?: string;
        reason?: string;
        truncated?: boolean;
      } | null;
      if (res.ok && body?.ok && typeof body.text === "string") {
        setState({
          kind: "done",
          text: body.text,
          model: body.model || model.model,
          truncated: body.truncated === true,
        });
      } else {
        // A 404 means the server no longer holds this finding, and a 501 means
        // the door closed after the page read its health. Neither is "the model
        // answered badly", and naming it wrongly would teach the reader to
        // distrust every sentence the card shows.
        const reason: ExplainReason =
          (body?.reason as ExplainReason | undefined) ??
          (res.status === 404 ? "gone" : res.status === 501 ? "shut" : "unreachable");
        setState({ kind: "failed", key: reasonKey[reason] ?? "panel.askModelError" });
      }
    } catch {
      setState({ kind: "failed", key: reasonKey.unreachable });
    } finally {
      inFlight = false;
      holds.current = false;
      abort.current = null;
    }
  }, [analysisId, finding.fingerprint, lang, model.model]);

  if (origin !== "live" || !model.configured || !finding.fingerprint || !analysisId) return null;

  const label = !asked
    ? askLabel
    : state.kind === "running"
      ? thinkingLabel
      : t(lang, "panel.askModelAgain");
  const answered = state.kind === "done" ? state.model : model.model;
  const byLine = named
    ? t(lang, "panel.askModelBy", { model: answered })
    : t(lang, "panel.askModelByUnnamed");

  return (
    <div className="ask-local-model" data-ask-model="">
      <button
        type="button"
        onClick={() => void ask()}
        disabled={state.kind === "running"}
        title={t(lang, "panel.askModelTitle")}
        className="font-jetbrains text-[11px] inline-flex items-center gap-1.5 px-2 py-1 rounded-sm transition-colors"
        style={{
          color: "#8fb6d8",
          background: "rgba(100,130,170,0.08)",
          border: "1px solid rgba(100,130,170,0.28)",
        }}
      >
        {label}
      </button>

      {state.kind === "done" && (
        <div
          role="status"
          className="font-jetbrains text-[11px] leading-relaxed px-2 py-1.5 rounded-sm mt-1.5"
          style={{
            color: "#d8e4f8",
            background: "rgba(100,130,170,0.06)",
            border: "1px solid rgba(100,130,170,0.22)",
          }}
        >
          <p data-ask-model-text={formatCount(lang, state.text.length)}>{state.text}</p>
          <p className="mt-1" style={{ color: "var(--meta-faint)" }}>
            {state.truncated ? `${t(lang, "panel.askModelTruncated")} ` : ""}
            {byLine}
          </p>
        </div>
      )}

      {state.kind === "failed" && (
        <p
          role="alert"
          data-ask-model-failed=""
          className="font-jetbrains text-[11px] leading-relaxed mt-1.5"
          style={{ color: "#e0a0a8" }}
        >
          {t(lang, state.key)}
        </p>
      )}

      {/* While waiting there is nothing to announce but the wait; the answer
          announces itself from the region above. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state.kind === "running" ? thinkingLabel : ""}
      </span>
    </div>
  );
}
