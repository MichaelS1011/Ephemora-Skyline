// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * The card's "ask the local model" door.
 *
 * Three claims are checked here, and the third is the reason the file exists:
 *  1. the offer appears only when a model is actually configured on this
 *     machine — a button that answers 501 after a click reads as a defect;
 *  2. a carried file offers nothing, because there is no server behind it;
 *  3. the browser sends an address and a fingerprint, never the line itself.
 *     Choosing what a model may read is the backend's job (see
 *     `backend/tests/llm-explain-guard.test.ts`), and a UI that pasted code into
 *     the body would quietly widen that door.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskLocalModel } from "../src/components/AskLocalModel";
import { useStore } from "../src/stores/useStore";
import { useOrigin, type PageOrigin } from "../src/stores/useOrigin";
import { __resetLocalModelForTest } from "../src/city/localModel";
import type { CityFinding } from "../src/city/types";

const finding = (over: Partial<CityFinding> = {}): CityFinding =>
  ({
    type: "SQL_INJECTION",
    severity: "P0",
    line: 42,
    message: "Query built by string concatenation",
    ruleId: "py:sql-injection",
    provenance: "semgrep",
    code: 'db.query("SELECT * FROM t WHERE id=" + user_id)',
    fingerprint: "fp-abc",
    snippet: {
      line: 'db.query("SELECT * FROM t WHERE id=" + user_id)',
      number: 42,
      before: ["NEIGHBOUR_ABOVE"],
      after: ["NEIGHBOUR_BELOW"],
    },
    ...over,
  }) as CityFinding;

interface Ask {
  url: string;
  body: string;
}

let host: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

async function renderCard(opts: {
  origin?: PageOrigin;
  health?: { configured: boolean; model?: string | undefined };
  ask?: (ask: Ask) => Promise<Response>;
}): Promise<{
  text: () => string;
  live: () => string;
  asks: Ask[];
  click: (label: RegExp) => Promise<void>;
}> {
  const asks: Ask[] = [];
  vi.restoreAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  __resetLocalModelForTest();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api/health")) {
      const configured = opts.health?.configured ?? false;
      return new Response(
        JSON.stringify({
          status: "ok",
          uptime: 1,
          timestamp: "2026-10-18T00:00:00.000Z",
          version: "0.1.0",
          cityStore: { maxEntries: 24, ttlMs: 3_600_000 },
          localModel: configured
            ? { configured: true, model: opts.health?.model ?? "Qwen3.5-9B" }
            : { configured: false },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const body = typeof init?.body === "string" ? init.body : "";
    asks.push({ url, body });
    return (
      opts.ask?.({ url, body }) ??
      new Response(
        JSON.stringify({ ok: true, text: "Use bound parameters.", model: "Qwen3.5-9B" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    );
  }) as typeof fetch;

  useOrigin.setState({ origin: opts.origin ?? "live" });
  useStore.setState({
    ...useStore.getInitialState(),
    analysisId: "scan-1",
    prefs: { ...useStore.getInitialState().prefs, lang: "en" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AskLocalModel finding={finding()} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return {
    text: () => (host?.textContent ?? "").replace(/\s+/g, " ").trim(),
    live: () =>
      [...(host?.querySelectorAll('[role="status"]') ?? [])]
        .map((el) => el.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    asks,
    click: async (label: RegExp) => {
      const btn = [...host!.querySelectorAll("button")].find((b) =>
        label.test(b.textContent ?? ""),
      );
      await act(async () => {
        btn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    },
  };
}

const realFetch = globalThis.fetch;

const deferred = () => {
  let resolve!: (res: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
};

/** A second card in the same page — the pair has to share one model queue. */
async function renderSecondCard(): Promise<{
  asks: Ask[];
  click: (label: RegExp) => Promise<void>;
}> {
  const asks: Ask[] = [];
  const handler = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    // only THIS card's question — the wrapper is global, so the other card's
    // click would otherwise be counted here and the gate would look broken
    if (String(input).includes("explain-finding") && body.includes("fp-second")) {
      asks.push({ url: String(input), body });
    }
    return handler(input, init);
  }) as typeof fetch;
  const host2 = document.createElement("div");
  document.body.append(host2);
  const root2 = createRoot(host2);
  await act(async () => {
    root2.render(
      <AskLocalModel finding={finding({ fingerprint: "fp-second", type: "EVAL_USAGE" })} />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return {
    asks,
    click: async (label: RegExp) => {
      const btn = [...host2.querySelectorAll("button")].find((b) =>
        label.test(b.textContent ?? ""),
      );
      await act(async () => {
        btn?.click();
      });
    },
  };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
  globalThis.fetch = realFetch;
});

describe("the offer", () => {
  it("is absent when no local model is configured", async () => {
    const { text, asks } = await renderCard({ health: { configured: false } });
    expect(text()).toBe("");
    expect(asks).toEqual([]);
  });

  it("is absent in a carried file, which has no server to ask", async () => {
    const { text } = await renderCard({ origin: "file", health: { configured: true } });
    expect(text()).toBe("");
  });

  it("names the model it is about to ask", async () => {
    const { text } = await renderCard({ health: { configured: true, model: "qwen3.5" } });
    expect(text()).toMatch(/qwen3\.5/i);
  });

  it("speaks one language when the operator named no model", async () => {
    // Measured in the German UI before this case: the fallback name was written
    // in English by the backend, so the button read "local model auf diesem
    // Rechner fragen".
    const { text } = await renderCard({ health: { configured: true, model: "" } });
    expect(text()).toMatch(/ask the model on this machine/i);
    expect(text()).not.toMatch(/local model/i);
  });
});

describe("a question that never reached a model", () => {
  it("says the finding is gone when the server no longer holds it", async () => {
    const { text, click } = await renderCard({
      health: { configured: true },
      ask: async () =>
        new Response(JSON.stringify({ ok: false, error: "Finding not found" }), { status: 404 }),
    });
    await click(/ask/i);
    expect(text()).toMatch(/no longer in the scan/i);
    expect(text()).not.toMatch(/answered, but not in words/i);
  });

  it("says the door is shut when the server refuses the question itself", async () => {
    const { text, click } = await renderCard({
      health: { configured: true },
      ask: async () =>
        new Response(JSON.stringify({ ok: false, error: "No local model is configured" }), {
          status: 501,
        }),
    });
    await click(/ask/i);
    expect(text()).toMatch(/could not ask/i);
    expect(text()).not.toMatch(/answered, but not in words/i);
  });
});

describe("one machine, one question at a time", () => {
  it("does not queue a second model job while the first is still thinking", async () => {
    // Five open cards, one GPU: a click on each would otherwise line up five
    // jobs behind a model that answers one at a time.
    const gate = deferred();
    const a = await renderCard({ health: { configured: true }, ask: () => gate.promise });
    const b = await renderSecondCard();
    await a.click(/ask/i);
    await b.click(/ask/i);
    expect(b.asks).toHaveLength(0);
    expect(a.asks).toHaveLength(1);
    gate.resolve(
      new Response(JSON.stringify({ ok: true, text: "Late.", model: "m" }), { status: 200 }),
    );
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("the answer reaches the keyboard and the screen reader", () => {
  it("announces the sentence it just received", async () => {
    const { text, click, live } = await renderCard({ health: { configured: true } });
    await click(/ask/i);
    expect(text()).toContain("Use bound parameters.");
    expect(live()).toContain("Use bound parameters.");
  });
});

describe("the question", () => {
  it("sends an address and a fingerprint — the line itself stays in the browser", async () => {
    const { click, asks } = await renderCard({ health: { configured: true } });
    await click(/ask/i);
    expect(asks).toHaveLength(1);
    expect(asks[0]!.url).toContain("api/explain-finding");
    const sent = JSON.parse(asks[0]!.body) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["analysisId", "fingerprint", "lang"]);
    expect(sent.fingerprint).toBe("fp-abc");
    expect(asks[0]!.body).not.toContain("SELECT");
    expect(asks[0]!.body).not.toContain("NEIGHBOUR_ABOVE");
  });

  it("asks when the user tells it to, never on arrival", async () => {
    // The comparison on arrival runs itself in the background; this does not.
    // An unrequested model call would spend a user's GPU for a sentence nobody
    // read, and it would do so on every card of a city with hundreds of findings.
    const { asks, click } = await renderCard({ health: { configured: true } });
    expect(asks).toEqual([]);
    await click(/ask/i);
    expect(asks).toHaveLength(1);
  });
});

describe("the answer", () => {
  it("says the model wrote it, and what the model saw", async () => {
    const { text, click } = await renderCard({ health: { configured: true } });
    await click(/ask/i);
    expect(text()).toContain("Use bound parameters.");
    expect(text()).toMatch(/qwen3\.5/i);
    // The sentence that keeps a model's guess from reading as a verdict.
    expect(text()).toMatch(/wrote|model/i);
    expect(text()).toMatch(/one line|not the file/i);
  });

  it("shows the reason when the model did not answer, instead of an empty box", async () => {
    const { text, click } = await renderCard({
      health: { configured: true },
      ask: async () =>
        new Response(JSON.stringify({ ok: false, reason: "timeout" }), { status: 502 }),
    });
    await click(/ask/i);
    expect(text()).toMatch(/did not answer|timed out|no answer/i);
  });

  it("stays silent about success when the transport itself fails", async () => {
    const { text, click } = await renderCard({
      health: { configured: true },
      ask: async () => {
        throw new TypeError("network");
      },
    });
    await click(/ask/i);
    expect(text()).toMatch(/could not be reached|did not answer/i);
    expect(text()).not.toMatch(/Use bound parameters/);
  });

  it("shows when the model ran out of room instead of passing off a fragment", async () => {
    // Measured on a real 9B model on 2026-10-18: with a small token budget it
    // stops mid-sentence, and a half sentence shown as if it were whole is the
    // one failure mode a reader cannot notice themselves.
    const { text, click } = await renderCard({
      health: { configured: true },
      ask: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            text: "Use bound parameters because the value",
            model: "qwen3.5",
            truncated: true,
          }),
          { status: 200 },
        ),
    });
    await click(/ask/i);
    expect(text()).toContain("Use bound parameters because the value");
    expect(text()).toMatch(/ran out of room|mid-sentence/i);
  });
});
