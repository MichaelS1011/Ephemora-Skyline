/**
 * llm-explain — the only door in this product that puts words in front of a model.
 *
 * A curated sentence explains a RULE; only a model can explain the line. So the
 * finding card offers "ask the local model", and the whole of this module is the
 * bargain that makes that honest:
 *
 *   the model reads the flagged line and the facts about it, nothing else;
 *   the address it reads from must be loopback, checked before the request exists.
 *
 * Two consequences worth stating, because they are what the tests pin:
 * - the allowed fields are a SET, not a deny-list. A field added to `SecurityIssue`
 *   later is withheld by default; widening this is a deliberate act.
 * - the surrounding code frame is not sent. The snippet the panel shows exists to
 *   orient a human inside a file; a model that needs the file has been asked to
 *   do something other than explain one line, and the promise the README makes
 *   ("your code stays on your machine") does not survive sending the file.
 *
 * The endpoint is read from `EPHEMORA_LLM_URL` (any OpenAI-compatible server:
 * llama.cpp, Ollama, LM Studio, vLLM) plus an optional `EPHEMORA_LLM_MODEL`.
 * Nothing is sent anywhere unless both are set, and a hosted URL is refused at
 * startup rather than at the moment a user clicks.
 */

import type { Request, Response } from "express";
import { maskSecretText } from "./redact.js";
import { isOffline } from "./network-policy.js";
import { findingFingerprint } from "./finding-identity.js";
import type { AnalysisResult, SecurityIssue } from "../../models/index.js";

/** One flagged line, clipped. Generous for a rule hit, small enough to be a line. */
export const MAX_CODE_CHARS = 500;
/** Scanner messages are one line of prose, not a report. */
export const MAX_FACT_TEXT = 400;
/** A reply that needs more than this is not an explanation of one line. */
export const MAX_ANSWER_CHARS = 1_200;
/**
 * How long to wait for a sentence.
 *
 * Measured, not guessed: on 2026-10-18 a 9B model answered in 9,7 s once warm
 * and took over 20 s cold on the same GPU. A clock that fires during a working
 * call tells the user the model is broken when it is only busy, so the default
 * clears the cold case and `EPHEMORA_LLM_TIMEOUT_MS` raises it further.
 */
export const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 300_000;

/** A clock the operator set, or the measured default — never an absent clock. */
export function timeoutFrom(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isFinite(n) || n < MIN_TIMEOUT_MS) return DEFAULT_TIMEOUT_MS;
  return Math.min(n, MAX_TIMEOUT_MS);
}

export interface FindingFacts {
  type: string;
  ruleId: string;
  severity: string;
  line: number;
  message: string;
  code: string;
  cwe?: string;
  category?: string;
  provenance?: string;
}

/** The whitelist, as the set the test compares against. */
const FACT_KEYS = [
  "type",
  "ruleId",
  "severity",
  "line",
  "message",
  "code",
  "cwe",
  "category",
  "provenance",
] as const;

const clip = (s: string, max: number = MAX_CODE_CHARS): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

/**
 * The finding, reduced to what may leave.
 *
 * `knownValue` is the second chance at a credential: the scanner masks at its own
 * boundary, and `issue.secretValue` is deleted there, but a caller that hands
 * this function an issue it built elsewhere must not turn the LLM door into the
 * one place an unmasked line escapes.
 */
export function explainFacts(
  issue: SecurityIssue,
  knownValue?: string | readonly string[],
): FindingFacts {
  const known =
    knownValue ?? (typeof issue.secretValue === "string" ? issue.secretValue : undefined);
  const facts: FindingFacts = {
    type: issue.type,
    ruleId: issue.ruleId ?? issue.type,
    severity: issue.severity,
    line: issue.line,
    message: clip(maskSecretText(issue.message ?? "", known), MAX_FACT_TEXT),
    code: clip(maskSecretText(issue.code ?? "", known)),
    ...(issue.cwe ? { cwe: issue.cwe } : {}),
    ...(issue.category ? { category: issue.category } : {}),
    ...(issue.provenance ? { provenance: issue.provenance } : {}),
  };
  for (const key of FACT_KEYS) {
    if (facts[key] === undefined) delete facts[key];
  }
  return facts;
}

const systemPrompt = (lang: "en" | "de"): string =>
  lang === "de"
    ? "Du erklärst einen einzelnen Fund eines statischen Scanners in einer lokalen Entwicklungsumgebung. " +
      "Antworte auf Deutsch in zwei bis vier Sätzen: was an der markierten Zeile problematisch ist und " +
      "was der Entwickler stattdessen tun sollte. Gib keinen fertigen Code zurück, den niemand geprüft hat, " +
      "und bewerte den Fund nicht neu oder erfinde keine Schwachstellen, die der Fund nicht nennt. " +
      "Du siehst nur diese eine Zeile, nicht die Datei — fordere also keinen Kontext an, den du nicht hast. " +
      "Antworte nur mit der Erklärung: kein Vorspann, kein Wiederholen der Anfrage, keine Schritt-für-Schritt-" +
      "Herleitung vor der Antwort."
    : "You explain one finding from a static scanner running in a local developer tool. " +
      "Answer in English, in two to four sentences: what is wrong with the flagged line and what to do " +
      "instead. " +
      "Do not return finished code that nobody has reviewed, do not re-grade the finding, and do not " +
      "invent issues it does not name. You see one line, not the file, so do not ask for context you " +
      "were not given. Answer with the explanation alone: no preamble, no restating the request, and " +
      "no step-by-step reasoning before it.";

/**
 * The chat body as it goes on the wire: the facts travel inside the user turn.
 *
 * `chat_template_kwargs` is not in the OpenAI schema — it is how vLLM (and the
 * llama.cpp and Ollama shims that copied it) turn off a hybrid-reasoning model's
 * thinking block. It is sent by default because that block, measured on a 9B
 * model, is what the card gets instead of an answer; a server strict enough to
 * reject the field gets one retry without it.
 */
export function buildExplainRequest(
  issue: SecurityIssue,
  model: string,
  lang: "en" | "de" = "en",
  knownValue?: string | readonly string[],
  thinkingSwitch = true,
): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt(lang) },
      { role: "user", content: JSON.stringify(explainFacts(issue, knownValue)) },
    ],
    stream: false,
    max_tokens: 320,
    temperature: 0.2,
    ...(thinkingSwitch ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  };
}

export interface LlmConfig {
  url: string;
  model: string;
  /** Milliseconds to wait for an answer, read from `EPHEMORA_LLM_TIMEOUT_MS`. */
  timeoutMs: number;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Refuse anything that is not this machine.
 *
 * `localhost.evil.test` is the case a `startsWith` check gets wrong, so the
 * hostname is compared against a set, not a prefix. A URL that does not parse is
 * reported by the name of the variable it came from, because the person who hits
 * it is the person who set it.
 */
export function assertLoopbackTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("EPHEMORA_LLM_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("EPHEMORA_LLM_URL must be an http(s) URL");
  }
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(
      `EPHEMORA_LLM_URL must point at a model on this machine (127.0.0.1, localhost or ::1), not at ${url.hostname}`,
    );
  }
  return url;
}

/**
 * The configured model, or null.
 *
 * A path of `/v1` is completed to `/v1/chat/completions` because that is what
 * every local server's own README shows, and the alternative — making the user
 * guess the suffix — turns a working server into a silent failure.
 */
export function llmConfigFrom(env: NodeJS.ProcessEnv): LlmConfig | null {
  // `SKYLINE_OFFLINE=1` means the machine asks nothing, not even a neighbour on
  // loopback: the switch is what a user pulls when they want the tool silent.
  if (isOffline(env)) return null;
  const raw = (env.EPHEMORA_LLM_URL ?? "").trim();
  if (!raw) return null;
  const url = assertLoopbackTarget(raw);
  const path = url.pathname.replace(/\/+$/, "");
  if (!/\/chat\/completions$/.test(path)) {
    url.pathname = `${path.endsWith("/v1") ? path : `${path}/v1`}/chat/completions`;
  }
  return {
    url: url.toString(),
    model: (env.EPHEMORA_LLM_MODEL ?? "").trim(),
    timeoutMs: timeoutFrom(env.EPHEMORA_LLM_TIMEOUT_MS),
  };
}

export type ExplainFailure = "not-local" | "timeout" | "unreachable" | "model-error";
/** `truncated` is the model running out of budget mid-sentence — shown, not hidden. */
export type ExplainResult =
  { ok: true; text: string; truncated: boolean } | { ok: false; reason: ExplainFailure };

export interface ExplainDeps {
  url: string;
  model: string;
  timeoutMs?: number;
  lang?: "en" | "de";
  /** The platform fetch, typed against the web `Response` — not Express's. */
  fetchFn?: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
}

interface ParsedAnswer {
  text: string;
  /** The server said it ran out of tokens: the sentence is incomplete. */
  truncated: boolean;
}

const answerFrom = (payload: unknown): ParsedAnswer | null => {
  const first = (
    payload as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> }
  )?.choices?.[0];
  const content = first?.message?.content;
  if (typeof content !== "string") return null;
  const text = content.trim();
  return text.length > 0 ? { text, truncated: first?.finish_reason === "length" } : null;
};

/**
 * Ask, or say why it was not asked.
 *
 * Every branch returns a reason the UI can render; none of them throws, because
 * this runs behind a button in a card and a rejected promise there becomes a
 * silent dead click. The abort is timed by this function rather than by the
 * server, so a model that is loading a 20 GB weight file shows as "still
 * thinking" for exactly as long as the user agreed to wait.
 */
export async function explainFinding(
  issue: SecurityIssue,
  deps: ExplainDeps,
): Promise<ExplainResult> {
  let target: URL;
  try {
    target = assertLoopbackTarget(deps.url);
  } catch {
    return { ok: false, reason: "not-local" };
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const post = async (thinkingSwitch: boolean): Promise<globalThis.Response> =>
    fetchFn(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildExplainRequest(issue, deps.model, deps.lang ?? "en", undefined, thinkingSwitch),
      ),
      signal: controller.signal,
      // A local server must not get to choose who reads the line.
      redirect: "error",
    });

  let res: globalThis.Response;
  try {
    res = await post(true);
    // 400 on a body that carries a non-schema field means a strict server, not a
    // broken model: ask again without it, inside the same clock.
    if (res.status === 400) res = await post(false);
  } catch (err) {
    clearTimeout(timer);
    const name = (err as { name?: string })?.name;
    return { ok: false, reason: name === "AbortError" ? "timeout" : "unreachable" };
  }
  clearTimeout(timer);

  if (!res.ok)
    return {
      ok: false,
      reason: res.status >= 300 && res.status < 400 ? "unreachable" : "model-error",
    };
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, reason: "model-error" };
  }
  const answer = answerFrom(payload);
  if (!answer) return { ok: false, reason: "model-error" };
  const clipped = answer.text.length > MAX_ANSWER_CHARS;
  return {
    ok: true,
    text: answer.text.slice(0, MAX_ANSWER_CHARS),
    truncated: answer.truncated || clipped,
  };
}

type ResultStore = { get(id: string): AnalysisResult | undefined };

export interface ExplainRouteDeps {
  store: ResultStore;
  /** null when no model is configured — the route then answers 501 and says so. */
  config: LlmConfig | null;
  /** Test seam: replaces the fetch and the clock, never the address check. */
  deps?: Partial<ExplainDeps>;
}

/** The finding the caller means, by the same fingerprint the card and the verdicts use. */
function findByFingerprint(
  result: AnalysisResult,
  fingerprint: string,
): { issue: SecurityIssue } | null {
  for (const file of result.files) {
    for (const v of file.vulnerabilities) {
      const ruleId = (v as unknown as { ruleId?: string }).ruleId ?? v.type;
      if (
        findingFingerprint({
          path: file.path,
          type: v.type,
          ruleId,
          line: v.line,
          code: v.code,
          provenance: v.provenance,
          historyCommit: v.historyCommit,
        }) === fingerprint
      ) {
        return { issue: v };
      }
    }
  }
  return null;
}

export async function handleExplainFinding(
  req: Request,
  res: Response,
  route: ExplainRouteDeps,
): Promise<void> {
  const body = req.body as
    { analysisId?: unknown; fingerprint?: unknown; lang?: unknown } | undefined;
  const analysisId = typeof body?.analysisId === "string" ? body.analysisId : "";
  const fingerprint = typeof body?.fingerprint === "string" ? body.fingerprint : "";
  if (!analysisId || !fingerprint) {
    res.status(400).json({ ok: false, error: "An analysis id and a fingerprint are required" });
    return;
  }
  if (!route.config) {
    res.status(501).json({
      ok: false,
      error:
        "No local model is configured. Set EPHEMORA_LLM_URL to an OpenAI-compatible server on this machine.",
    });
    return;
  }
  const result = route.store.get(analysisId);
  if (!result) {
    res.status(404).json({ ok: false, error: "Analysis not found" });
    return;
  }
  const found = findByFingerprint(result, fingerprint);
  if (!found) {
    res.status(404).json({ ok: false, error: "Finding not found in this scan" });
    return;
  }
  const lang = body?.lang === "de" ? "de" : "en";
  const out = await explainFinding(found.issue, {
    url: route.config.url,
    model: route.config.model,
    timeoutMs: route.config.timeoutMs,
    lang,
    ...route.deps,
  });
  if (!out.ok) {
    res.status(502).json({ ok: false, reason: out.reason });
    return;
  }
  res.json({
    ok: true,
    text: out.text,
    model: route.config.model,
    truncated: out.truncated,
  });
}
