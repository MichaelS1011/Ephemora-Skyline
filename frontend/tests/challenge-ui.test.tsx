// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengePanel } from "../src/components/ChallengePanel";
import { useStore } from "../src/stores/useStore";
import { city } from "./helpers/cityFixture";
import type { Lang } from "../src/i18n";

/**
 * The classroom scoreboard card, as a reader meets it.
 *
 * What the response must look like to be printed at all is judged in
 * `challengePanel.test.ts`. This file owns the seat: the card appears only
 * when the scan is an exercise, it says found/total and points, a found item
 * ticks and a missing one shows its hint and points — and the location of the
 * missing one is nowhere in the card, because nowhere in the response either.
 */

const BOARD = {
  exercise: {
    id: "webshop-basics",
    title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
    level: "sek1",
  },
  items: [
    {
      id: "sql-concat",
      points: 10,
      categoryHint: "injection",
      hint: { en: "Where does the query get built?", de: "Wo wird die Query gebaut?" },
      found: true,
    },
    {
      id: "hardcoded-key",
      points: 5,
      categoryHint: "secrets",
      hint: { en: "What ships in plain text?", de: "Was steht im Klartext dabei?" },
      found: false,
    },
  ],
  foundCount: 1,
  totalCount: 2,
  pointsEarned: 10,
  pointsTotal: 15,
  finished: false,
};

function seed(lang: Lang, analysisId: string | null) {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: analysisId === null ? null : city({ analysisId }),
    },
    true,
  );
}

function mockFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 404),
    json: async () => response.body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await act(async () => useStore.setState(useStore.getInitialState(), true));
  vi.unstubAllGlobals();
});

async function show(element: ReactElement = <ChallengePanel />) {
  await act(async () => root.render(element));
  // The fetch chain resolves over several microtask hops (fetch, then json,
  // then setView) — drain them the way timeMachine.test.tsx does.
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

const text = () => (host.textContent || "").replace(/\s+/g, " ").trim();

describe("the classroom card", () => {
  it("stays away from a scan that is not an exercise", async () => {
    mockFetch({ ok: false, status: 404 });
    seed("en", "scan-1");
    await show();
    expect(host.querySelector(".cf-challenge")).toBeNull();
    expect(text()).toBe("");
  });

  it("stays away when no scan is loaded at all", async () => {
    const fetchMock = mockFetch({ ok: true, body: BOARD });
    seed("en", null);
    await show();
    expect(host.querySelector(".cf-challenge")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prints the exercise the key promised", async () => {
    mockFetch({ ok: true, body: BOARD });
    seed("en", "scan-1");
    await show();
    expect(text()).toContain("Webshop basics");
    expect(text()).toContain("Lower secondary");
    expect(text()).toContain("1 of 2 planted issues found");
    expect(text()).toContain("10 of 15 points");
  });

  it("asks the documented route once per scan, not once per render", async () => {
    const fetchMock = mockFetch({ ok: true, body: BOARD });
    seed("en", "scan-1");
    await show();
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/result/scan-1/challenge");
  });

  it("ticks the found item and hints at the missing one with its points", async () => {
    mockFetch({ ok: true, body: BOARD });
    seed("en", "scan-1");
    await show();
    const rows = [...host.querySelectorAll(".cf-challenge-item")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("sql-concat");
    expect(rows[0]?.getAttribute("data-found")).toBe("true");
    expect(rows[1]?.hasAttribute("data-found")).toBe(false);
    expect(rows[1]?.textContent).toContain("hardcoded-key");
    expect(rows[1]?.textContent).toContain("What ships in plain text?");
    expect(rows[1]?.textContent).toContain("secrets");
  });

  it("keeps the missing item's address off the card", async () => {
    // The server never sends it; the card could not print it if it tried —
    // which is what this guard pins from the reader's side.
    mockFetch({ ok: true, body: BOARD });
    seed("en", "scan-1");
    await show();
    expect(text()).not.toContain("src/config.js");
    expect(text()).not.toContain("src/db.js");
    expect(text()).not.toContain("HARDCODED_SECRET");
    expect(text()).not.toContain("SQL_INJECTION");
    expect(text()).not.toContain("line");
  });

  it("carries the whole line for assistive technology", async () => {
    mockFetch({ ok: true, body: BOARD });
    seed("en", "scan-1");
    await show();
    const rows = [...host.querySelectorAll(".cf-challenge-item")];
    expect(rows[0]?.getAttribute("aria-label")).toBe("sql-concat: found, worth 10 points");
    expect(rows[1]?.getAttribute("aria-label")).toBe(
      "hardcoded-key: not found, worth 5 points. Hint: What ships in plain text?",
    );
    const bar = host.querySelector(".cf-challenge-bar");
    expect(bar?.getAttribute("aria-valuenow")).toBe("67");
  });

  it("speaks German when the app does", async () => {
    mockFetch({ ok: true, body: BOARD });
    seed("de", "scan-1");
    await show();
    expect(text()).toContain("Webshop-Grundlagen");
    expect(text()).toContain("Sekundarstufe I");
    expect(text()).toContain("1 von 2 eingeschleusten Fehlern gefunden");
    expect(text()).toContain("10 von 15 Punkten");
    expect(text()).toContain("Was steht im Klartext dabei?");
  });

  it("says so when everything was found", async () => {
    mockFetch({ ok: true, body: { ...BOARD, foundCount: 2, pointsEarned: 15, finished: true } });
    seed("en", "scan-1");
    await show();
    expect(text()).toContain("Every planted issue found — well done.");
  });

  it("stays silent when the answer is not a scoreboard", async () => {
    mockFetch({ ok: true, body: { exercise: BOARD.exercise, items: "not a list" } });
    seed("en", "scan-1");
    await show();
    expect(host.querySelector(".cf-challenge")).toBeNull();
  });

  it("stays silent when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    seed("en", "scan-1");
    await show();
    expect(host.querySelector(".cf-challenge")).toBeNull();
  });

  it("prints an unknown level raw rather than inventing a school system", async () => {
    mockFetch({
      ok: true,
      body: {
        ...BOARD,
        exercise: { ...BOARD.exercise, level: "berufsschule" },
      },
    });
    seed("en", "scan-1");
    await show();
    expect(text()).toContain("berufsschule");
  });

  it("asks again when a new scan arrives", async () => {
    const fetchMock = mockFetch({ ok: true, body: BOARD });
    seed("en", "scan-1");
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () =>
      useStore.setState({ ...useStore.getState(), cityData: city({ analysisId: "scan-2" }) }, true),
    );
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/result/scan-2/challenge");
  });
});
