// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { fetchBackendReviews } from "../src/reviews";
import { t, type Lang } from "../src/i18n";
import { Landing } from "../src/components/Landing";

/**
 * The entry screen's verdict-delete hands over two things and names only one:
 * it clears the browser buckets AND asks the backend to clear the machine copy.
 * Since the hardened read path, the second half REFUSES while the copy answers
 * `verdicts_unreadable` (reviews.ts `resetBackendVerdicts` → false, no POST).
 * The control sat there ignoring that return value and printed the plain
 * success sentence anyway — in a triage tool a wrong "it is gone" is a lie
 * about data, not a cosmetic slip. These cases drive the real button.
 */

let host: HTMLDivElement;
let root: Root;

const unreadableBody = {
  error: "The verdict file is unreadable",
  code: "verdicts_unreadable",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

/** Verdict routes answer `answer`; everything else (footprint, …) answers 200. */
function stubVerdictRoutes(answer: { status: number; body: unknown }): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: { method?: string }) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/verdicts")) return jsonResponse(answer.status, answer.body);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

async function mountLanding(lang: Lang): Promise<void> {
  const initial = useStore.getInitialState();
  // #28: the entry surface — and with it these disclosure buttons — appears
  // once the guided beats are through. Mount as the reader who is there.
  useStore.setState({ ...initial, firstRun: false, prefs: { ...initial.prefs, lang } }, true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Landing />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function resetButton(lang: Lang): HTMLButtonElement {
  const label = t(lang, "landing.footprintReset");
  const btn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(btn, `the delete control labelled "${label}" is on the entry screen`).toBeTruthy();
  return btn!;
}

/** The sentence the screen shows after the last button press. */
function footNote(): string {
  const notes = [...host.querySelectorAll("p[role='status']")].map((p) => p.textContent ?? "");
  return notes.find((s) => /browser|Browser/.test(s)) ?? "";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
});

describe("the delete on the entry screen tells what actually happened", () => {
  it("refuses out loud in English instead of claiming plain success", async () => {
    stubVerdictRoutes({ status: 503, body: unreadableBody });
    // The real latch: a read that answers unreadable closes the door.
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("unreadable");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    localStorage.setItem("codecity-reviews:p-two", JSON.stringify({ "f-2": "reviewed" }));
    await mountLanding("en");
    await act(async () => {
      resetButton("en").click();
    });
    const note = footNote();
    const successSentence = t("en", "landing.footprintResetDone", { n: 2 });
    expect(note, `the control still claims the plain success sentence: "${note}"`).not.toBe(
      successSentence,
    );
    expect(note).toContain(t("en", "landing.footprintResetRefused", { n: 2 }));
    // the browser half is still truly done, the machine half was never asked
    expect(localStorage.getItem("codecity-reviews:p-one")).toBeNull();
    expect(stubCallsContain("POST /api/verdicts/reset")).toBe(false);
  });

  it("refuses out loud in German, in words a non-developer reads", async () => {
    stubVerdictRoutes({ status: 503, body: unreadableBody });
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("unreadable");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("de");
    await act(async () => {
      resetButton("de").click();
    });
    const note = footNote();
    expect(note, `the control still claims the plain success sentence: "${note}"`).not.toBe(
      t("de", "landing.footprintResetDone", { n: 1 }),
    );
    expect(note).toContain(t("de", "landing.footprintResetRefusedOne", { n: 1 }));
    expect(note).not.toMatch(/503/);
  });

  it("still says the quiet success when the copy reads — nothing was refused", async () => {
    stubVerdictRoutes({ status: 200, body: { project: "p-1", reviews: {} } });
    // The same read that returns the map clears the latch.
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("read");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("en");
    await act(async () => {
      resetButton("en").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(footNote()).toContain(t("en", "landing.footprintResetDoneOne", { n: 1 }));
    expect(stubCallsContain("POST /api/verdicts/reset")).toBe(true);
  });

  /**
   * The latch is only half the door: it speaks inside a session that already
   * read the machine copy. Pressing delete as the FIRST act of a fresh page —
   * before any city was opened — knew nothing and asked anyway, and the
   * screen printed the success word while the machine, which can read its own
   * file right now, refused and said `verdicts_unreadable`. The note has to
   * follow the answer, not the hope.
   */
  it("a fresh session that never read believes the machine's answer, not its own optimism", async () => {
    stubVerdictRoutes({ status: 503, body: unreadableBody });
    // No fetchBackendReviews here: the session-level latch has never been armed.
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("en");
    await act(async () => {
      resetButton("en").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(stubCallsContain("POST /api/verdicts/reset")).toBe(true);
    const note = footNote();
    expect(
      note,
      `the screen claimed the browser-only success over a machine that refused: "${note}"`,
    ).toContain(t("en", "landing.footprintResetRefusedOne", { n: 1 }));
  });
});

function stubCallsContain(needle: string): boolean {
  const mock = globalThis.fetch as unknown as {
    mock: { calls: [RequestInfo | URL, RequestInit?][] };
  };
  return mock.mock.calls.some(
    ([input, init]) => `${init?.method ?? "GET"} ${String(input)}` === needle,
  );
}
