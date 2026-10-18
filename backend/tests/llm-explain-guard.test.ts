import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import type { AnalysisResult, SecurityIssue } from "../src/models/index.js";
import { findingFingerprint } from "../src/services/security/finding-identity.js";
import {
  buildExplainRequest,
  explainFacts,
  explainFinding,
  llmConfigFrom,
  assertLoopbackTarget,
  handleExplainFinding,
  MAX_CODE_CHARS,
  MAX_ANSWER_CHARS,
  DEFAULT_TIMEOUT_MS,
  type ExplainDeps,
} from "../src/services/security/llm-explain.js";

/**
 * The one place this product asks a model for words, and the one place it must
 * decide what the model is allowed to read.
 *
 * The promise the README makes is that the code stays on the machine, and a
 * local model keeps that promise only if the request that goes to it carries
 * nothing beyond the finding the user is already looking at. So the whitelist is
 * asserted as a SET, not as a list of forbidden fields — a future field added to
 * `SecurityIssue` is refused by default, and the person adding it has to widen
 * this test on purpose and say why.
 *
 * The second half of the promise is the address: `EPHEMORA_LLM_URL` is checked
 * for loopback before a request is built, because a typo or a copy-pasted
 * hosted endpoint would otherwise send findings to the internet under the same
 * UI label that says "local".
 */

const issue = (over: Partial<SecurityIssue> = {}): SecurityIssue =>
  ({
    type: "SQL_INJECTION",
    ruleId: "py:sql-injection",
    severity: "P0",
    score: 9,
    line: 42,
    code: 'db.query("SELECT * FROM t WHERE id=" + user_id)',
    message: "Query built by string concatenation",
    provenance: "semgrep",
    cwe: "CWE-89",
    category: "INJECTION",
    snippet: {
      line: 'db.query("SELECT * FROM t WHERE id=" + user_id)',
      number: 42,
      before: ["NEIGHBOUR_ABOVE def run(user_id):", "db = connect()"],
      after: ["NEIGHBOUR_BELOW return rows", "# and more"],
    },
    ...over,
  }) as SecurityIssue;

describe("what a local model is allowed to read", () => {
  it("carries exactly the whitelisted facts, and nothing else", () => {
    const facts = explainFacts(issue());
    expect(Object.keys(facts).sort()).toEqual(
      [
        "category",
        "code",
        "cwe",
        "line",
        "message",
        "provenance",
        "ruleId",
        "severity",
        "type",
      ].sort(),
    );
    expect(facts.line).toBe(42);
    expect(facts.ruleId).toBe("py:sql-injection");
  });

  it("names no file and no folder — a finding is described by its rule, not its location", () => {
    const facts = explainFacts(issue());
    const json = JSON.stringify(facts);
    expect(json).not.toMatch(/path|fileName|basename/i);
    // A path would otherwise be the cheapest way to leak a project's structure.
    expect(json).not.toContain("src/");
  });

  it("sends the flagged line alone: the frame around it stays on the disk", () => {
    const json = JSON.stringify(explainFacts(issue()));
    expect(json).not.toContain("NEIGHBOUR_ABOVE");
    expect(json).not.toContain("NEIGHBOUR_BELOW");
  });

  it("clips a long line instead of trusting it", () => {
    const facts = explainFacts(issue({ code: "x".repeat(MAX_CODE_CHARS * 3) }));
    expect(facts.code.length).toBeLessThanOrEqual(MAX_CODE_CHARS + 1);
    expect(facts.code.endsWith("…")).toBe(true);
  });

  it("masks a credential the scanner matched, even when the caller forgot", () => {
    const leaked = "sk-live-ABCDEFGHIJKLMNOP1234";
    const facts = explainFacts(
      issue({
        type: "HARDCODED_SECRET",
        ruleId: "gitleaks:generic-api-key",
        code: `API_KEY = "${leaked}"`,
        message: "Hard-coded credential",
        secretValue: leaked,
      }),
      leaked,
    );
    const json = JSON.stringify(facts);
    expect(json).not.toContain(leaked);
    expect(json).toContain("‹hidden›");
    expect(json).toContain("API_KEY");
  });

  it("builds a chat request that asks for an explanation and no code rewrite", () => {
    const body = buildExplainRequest(issue(), "Qwen3.5-9B") as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
    };
    expect(body.model).toBe("Qwen3.5-9B");
    expect(body.stream).toBe(false);
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
    // The finding travels as JSON inside the user turn — and only as that JSON.
    const sent = JSON.parse(body.messages[1]!.content) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(Object.keys(explainFacts(issue())).sort());
    expect(body.messages[0]!.content).toMatch(/do not return finished code|keinen fertigen Code/i);
    // Measured on 2026-10-18 against a 9B model: without this sentence it opened
    // with "Thinking Process:" and spent the whole budget restating the request.
    expect(body.messages[0]!.content).toMatch(/no preamble|without preamble|reasoning steps/i);
  });

  /**
   * Measured on 2026-10-18 against vLLM serving a 9B hybrid-reasoning model:
   * without this switch the answer was a 429-character restatement of the
   * request that ran the token budget out (`finish_reason: length`); with it,
   * the same server answered three clean sentences in 2,5 s instead of 4,9 s.
   */
  it("turns the model's thinking mode off, because the card wants an answer", () => {
    const body = buildExplainRequest(issue(), "m") as {
      chat_template_kwargs?: { enable_thinking?: boolean };
    };
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("asks for the answer in the language the panel is speaking", () => {
    const de = buildExplainRequest(issue(), "m", "de") as {
      messages: Array<{ content: string }>;
    };
    expect(de.messages[0]!.content).toMatch(/Deutsch/);
    const en = buildExplainRequest(issue(), "m", "en") as {
      messages: Array<{ content: string }>;
    };
    expect(en.messages[0]!.content).toMatch(/Answer in English/);
  });
});

describe("the endpoint is checked before anything is built", () => {
  it("accepts the loopback forms a local server is actually reached by", () => {
    for (const url of [
      "http://127.0.0.1:8100/v1/chat/completions",
      "http://localhost:11434/v1/chat/completions",
      "http://[::1]:8000/v1/chat/completions",
    ]) {
      expect(() => assertLoopbackTarget(url)).not.toThrow();
    }
  });

  it("refuses a host that merely begins with the word localhost", () => {
    expect(() => assertLoopbackTarget("http://localhost.evil.test/v1")).toThrow(/local/);
    expect(() => assertLoopbackTarget("https://api.example.test/v1")).toThrow(/local/);
    expect(() => assertLoopbackTarget("http://8.8.8.8:8100/v1")).toThrow(/local/);
    expect(() => assertLoopbackTarget("not a url")).toThrow(/EPHEMORA_LLM_URL/);
  });

  it("is silent without a URL, and names the model a user configured", () => {
    expect(llmConfigFrom({})).toBeNull();
    expect(llmConfigFrom({ EPHEMORA_LLM_URL: "  " })).toBeNull();
    expect(llmConfigFrom({ EPHEMORA_LLM_URL: "http://127.0.0.1:8100/v1" })).toEqual({
      url: "http://127.0.0.1:8100/v1/chat/completions",
      model: "",
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(
      llmConfigFrom({
        EPHEMORA_LLM_URL: "http://127.0.0.1:8100/v1/chat/completions",
        EPHEMORA_LLM_MODEL: "Qwen3.5-9B",
      }),
    ).toEqual({
      url: "http://127.0.0.1:8100/v1/chat/completions",
      model: "Qwen3.5-9B",
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(() => llmConfigFrom({ EPHEMORA_LLM_URL: "https://hosted.example/v1" })).toThrow(/local/);
  });

  /**
   * Measured on 2026-10-18 with a 9B model on a shared GPU: the same question
   * took 9,7 s warm and passed 20 s cold. A door that closes on a slow but
   * working model is worse than a long wait the card explains, so the default
   * sits above the cold case and the operator can raise it.
   */
  it("waits longer than a cold local model needs, and lets the operator raise it", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(45_000);
    expect(
      llmConfigFrom({
        EPHEMORA_LLM_URL: "http://127.0.0.1:8100/v1",
        EPHEMORA_LLM_TIMEOUT_MS: "90000",
      })?.timeoutMs,
    ).toBe(90_000);
    // a nonsense value falls back to the default rather than to no clock at all
    expect(
      llmConfigFrom({
        EPHEMORA_LLM_URL: "http://127.0.0.1:8100/v1",
        EPHEMORA_LLM_TIMEOUT_MS: "soon",
      })?.timeoutMs,
    ).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe("the call itself", () => {
  const deps = (over: Partial<ExplainDeps> = {}): ExplainDeps => ({
    url: "http://127.0.0.1:8100/v1/chat/completions",
    model: "Qwen3.5-9B",
    timeoutMs: 250,
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "  Concatenate is dangerous; use parameters.  " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ...over,
  });

  it("returns the model's sentence, trimmed", async () => {
    const out = await explainFinding(issue(), deps());
    expect(out).toEqual({
      ok: true,
      text: "Concatenate is dangerous; use parameters.",
      truncated: false,
    });
  });

  it("says the answer was cut short instead of showing half a sentence as whole", async () => {
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: "Use bound parameters because the value" },
                  finish_reason: "length",
                },
              ],
            }),
            { status: 200 },
          ),
      }),
    );
    expect(out).toEqual({
      ok: true,
      text: "Use bound parameters because the value",
      truncated: true,
    });
  });

  it("gives up on its own clock instead of hanging the panel", async () => {
    const started = Date.now();
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: (_url, init) =>
          new Promise((_resolve, reject) => {
            (init?.signal as AbortSignal).addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("says the model is unreachable when nothing answers, and does not crash", async () => {
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: async () => {
          throw new TypeError("fetch failed: ECONNREFUSED");
        },
      }),
    );
    expect(out).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports a refusal rather than inventing an answer when the model errors", async () => {
    const out = await explainFinding(
      issue(),
      deps({ fetchFn: async () => new Response("nope", { status: 500 }) }),
    );
    expect(out).toEqual({ ok: false, reason: "model-error" });
  });

  /**
   * The switch is not part of the OpenAI schema, so a stricter server may answer
   * 400. One retry without it, and the reader gets the slow thinking dump rather
   * than a dead button — which is the same trade the timeout makes: a worse
   * answer beats no answer, as long as the card says what it is.
   */
  it("retries once without the switch when the server rejects the body", async () => {
    let seen: string[] = [];
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: async (_url, init) => {
          const body = String(init?.body ?? "");
          seen.push(body);
          if (body.includes("chat_template_kwargs")) return new Response("bad", { status: 400 });
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Use parameters." } }] }),
            { status: 200 },
          );
        },
      }),
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("chat_template_kwargs");
    expect(seen[1]).not.toContain("chat_template_kwargs");
    expect(out).toEqual({ ok: true, text: "Use parameters.", truncated: false });
  });

  it("keeps the server's refusal when the plain body is refused too", async () => {
    let seen = 0;
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: async () => {
          seen += 1;
          return new Response("bad", { status: 400 });
        },
      }),
    );
    expect(seen).toBe(2);
    expect(out).toEqual({ ok: false, reason: "model-error" });
  });

  it("refuses to follow a redirect out of the machine", async () => {
    // The address is checked once, on the URL the operator wrote. If the client
    // then obeyed a redirect, the local server would choose who reads the line,
    // and "checked before a request is built" would be true of the first hop only.
    const inits: RequestInit[] = [];
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: async (_url, init) => {
          inits.push(init ?? {});
          return new Response(null, {
            status: 307,
            headers: { location: "http://collector.example.test/collect" },
          });
        },
      }),
    );
    expect(inits).toHaveLength(1);
    expect(inits[0]!.redirect).toBe("error");
    expect(out).toEqual({ ok: false, reason: "unreachable" });
  });

  it("masks a credential the scanner put in its own message, not only in the line", () => {
    // Semgrep substitutes metavariables into `message.text`, so a rule can carry
    // source text in the message — and the message travels to the model too.
    const leaked = "sk-live-ABCDEFGHIJKLMNOP1234";
    const facts = explainFacts(
      issue({ message: `Hard-coded credential found: ${leaked}`, code: "API_KEY = …" }),
      leaked,
    );
    expect(JSON.stringify(facts)).not.toContain(leaked);
    expect(facts.message).toContain("‹hidden›");
  });

  it("says the answer was cut when this product clipped it, not only the server", async () => {
    const out = await explainFinding(
      issue(),
      deps({
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              choices: [
                { message: { content: "x".repeat(MAX_ANSWER_CHARS + 50) }, finish_reason: "stop" },
              ],
            }),
            { status: 200 },
          ),
      }),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text.length).toBe(MAX_ANSWER_CHARS);
      expect(out.truncated).toBe(true);
    }
  });

  it("stays shut when the offline switch is on, whatever URL is configured", () => {
    expect(
      llmConfigFrom({
        EPHEMORA_LLM_URL: "http://127.0.0.1:8100/v1",
        SKYLINE_OFFLINE: "1",
      }),
    ).toBeNull();
  });

  it("refuses to send anything to a non-local address, whatever the caller says", async () => {
    let sent = 0;
    const out = await explainFinding(
      issue(),
      deps({
        url: "https://collector.example.test/v1/chat/completions",
        fetchFn: async () => {
          sent += 1;
          return new Response("{}", { status: 200 });
        },
      }),
    );
    expect(sent).toBe(0);
    expect(out).toEqual({ ok: false, reason: "not-local" });
  });
});

describe("the route", () => {
  const store = (
    id: string,
    issues: SecurityIssue[],
  ): { get(k: string): AnalysisResult | undefined } => ({
    get: (key: string) =>
      key === id
        ? ({
            id,
            files: [{ path: "src/db.py", vulnerabilities: issues }],
          } as unknown as AnalysisResult)
        : undefined,
  });

  const fakeRes = () => {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(b: unknown) {
        this.body = b;
        return this;
      },
    };
    return res as unknown as Response & { statusCode: number; body: unknown };
  };

  const fp = (i: SecurityIssue) =>
    findingFingerprint({
      path: "src/db.py",
      type: i.type,
      ruleId: i.ruleId,
      line: i.line,
      code: i.code,
      provenance: i.provenance,
    });

  it("answers 501 when no model is configured — the button would not have been shown", async () => {
    const res = fakeRes();
    await handleExplainFinding(
      { body: { analysisId: "a1", fingerprint: fp(issue()) } } as unknown as Request,
      res,
      { store: store("a1", [issue()]), config: null },
    );
    expect(res.statusCode).toBe(501);
  });

  it("answers 404 for a fingerprint that is not in this scan", async () => {
    const res = fakeRes();
    await handleExplainFinding(
      { body: { analysisId: "a1", fingerprint: "deadbeef" } } as unknown as Request,
      res,
      {
        store: store("a1", [issue()]),
        config: { url: "http://127.0.0.1:8100/v1/chat/completions", model: "m", timeoutMs: 250 },
      },
    );
    expect(res.statusCode).toBe(404);
  });

  it("replies with the model's sentence and the fact that a model wrote it", async () => {
    const res = fakeRes();
    await handleExplainFinding(
      { body: { analysisId: "a1", fingerprint: fp(issue()) } } as unknown as Request,
      res,
      {
        store: store("a1", [issue()]),
        config: { url: "http://127.0.0.1:8100/v1/chat/completions", model: "m", timeoutMs: 250 },
        deps: {
          timeoutMs: 250,
          fetchFn: async () =>
            new Response(
              JSON.stringify({ choices: [{ message: { content: "Use parameters." } }] }),
              { status: 200 },
            ),
        },
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, text: "Use parameters.", model: "m", truncated: false });
  });

  it("keeps a failure a failure instead of a 200 with empty text", async () => {
    const res = fakeRes();
    await handleExplainFinding(
      { body: { analysisId: "a1", fingerprint: fp(issue()) } } as unknown as Request,
      res,
      {
        store: store("a1", [issue()]),
        config: { url: "http://127.0.0.1:8100/v1/chat/completions", model: "m", timeoutMs: 250 },
        deps: {
          timeoutMs: 50,
          fetchFn: async () => {
            throw new TypeError("fetch failed");
          },
        },
      },
    );
    expect(res.statusCode).toBe(502);
    expect((res.body as { ok: boolean }).ok).toBe(false);
  });
});
