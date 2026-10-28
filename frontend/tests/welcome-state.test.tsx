// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { recordCityVisit } from "../src/recentCities";
import { t } from "../src/i18n";
import { city, dir, file } from "./helpers/cityFixture";
import { Landing } from "../src/components/Landing";

/**
 * MASTER-2027 §03.03 — the calm welcome state.
 *
 * §03.02 produced `firstRun`; this is its first reader. The claims the step has
 * to hold are exactly the §03 UX rules: one central decision (a single "Let's
 * start"), and it opens only for a machine that has never shown a city.
 * Betreiberentscheid 2026-10-27 (#28) changed one of them: the beat is now the
 * only action prompt on screen — the entry surface appears when its turn comes,
 * and the way out is the sequence's own Skip and Escape (§03.07), not a folder
 * button standing beside the greeting.
 */

let host: HTMLDivElement;
let root: Root;

function stubFetch(body: unknown = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response),
  );
}

async function mountLanding(): Promise<void> {
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

/** §03.08 — the tab going away and coming back, with the storage kept between. */
async function reloadLanding(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  await mountLanding();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  stubFetch();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
  useStore.setState(useStore.getInitialState(), true);
});

describe("the welcome opens for a first run", () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: true });
  });

  it("greets with exactly one decision — the entry surface waits (#28)", async () => {
    await mountLanding();
    const welcome = host.querySelector(".landing-welcome");
    expect(welcome).not.toBeNull();
    // The card is a region a screen reader can land on.
    expect(welcome?.getAttribute("role")).toBe("region");
    // One button inside it — "nur eine zentrale Entscheidung pro Schritt".
    expect(welcome?.querySelectorAll("button")).toHaveLength(1);
    // #28: the greeting holds the screen alone — no second prompt for the
    // same action beside it. Skip and Escape (§03.07) are the way out.
    expect(host.querySelector(".landing-intro")).toBeNull();
    expect(host.querySelector(".landing-actions")).toBeNull();
  });

  it("folds away when the reader starts, and shows the short introduction", async () => {
    await mountLanding();
    const begin = host.querySelector<HTMLButtonElement>(".landing-welcome-begin");
    expect(begin).not.toBeNull();
    await act(async () => {
      begin?.click();
    });
    expect(host.querySelector(".landing-welcome")).toBeNull();
    // §03.05 — the greeting hands off to a short, three-step introduction.
    const guide = host.querySelector(".landing-guide");
    expect(guide).not.toBeNull();
    expect(guide?.querySelectorAll("ol li")).toHaveLength(3);
    // #28 — the second beat holds the screen just as alone as the first.
    expect(host.querySelector(".landing-intro")).toBeNull();
    expect(host.querySelector(".primary-button")).toBeNull();
    expect(host.querySelector(".secondary-button")).toBeNull();
  });
});

describe("the introduction navigates: back, next, skip (§03.07)", () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: true });
  });

  async function toIntro(): Promise<void> {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".landing-welcome-begin")?.click();
    });
  }

  it("the introduction card offers Back and Continue — its one forward decision", async () => {
    await toIntro();
    const actions = [...host.querySelectorAll(".landing-guide-actions button")];
    expect(actions.some((b) => /Continue|Weiter/.test(b.textContent ?? ""))).toBe(true);
    expect(actions.some((b) => /Back|Zurück/.test(b.textContent ?? ""))).toBe(true);
    // Skip is NOT duplicated inside the card — it lives on the sequence chrome.
    expect(host.querySelector(".landing-guide-skip")).toBeNull();
  });

  it("Continue ends the introduction and leaves the plain landing", async () => {
    await toIntro();
    const cont = [...host.querySelectorAll(".landing-guide-actions button")].find((b) =>
      /Continue|Weiter/.test(b.textContent ?? ""),
    );
    await act(async () => {
      (cont as HTMLButtonElement).click();
    });
    expect(host.querySelector(".landing-guide")).toBeNull();
    // the whole sequence — progress chrome included — is gone once done
    expect(host.querySelector(".start-progress-steps")).toBeNull();
    expect(host.querySelector(".primary-button")).not.toBeNull();
  });

  it("Back returns to the greeting", async () => {
    await toIntro();
    const back = [...host.querySelectorAll(".landing-guide-actions button")].find((b) =>
      /Back|Zurück/.test(b.textContent ?? ""),
    );
    await act(async () => {
      (back as HTMLButtonElement).click();
    });
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".landing-welcome")).not.toBeNull();
  });

  it("the sequence-level Skip ends the introduction from any beat", async () => {
    await toIntro();
    const skip = host.querySelector<HTMLButtonElement>(".start-progress-skip");
    expect(skip).not.toBeNull();
    await act(async () => {
      skip?.click();
    });
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-progress-steps")).toBeNull();
  });

  it("Escape ends the introduction too — the keyboard path to Skip", async () => {
    await toIntro();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-progress-steps")).toBeNull();
  });
});

describe("the welcome stays closed for a reader who has been here", () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
  });

  it("shows no greeting at all once the machine has arrived before", async () => {
    await mountLanding();
    expect(host.querySelector(".landing-welcome")).toBeNull();
    // …and it is not hiding a disabled shell behind the check: the real landing
    // is what a returning reader gets.
    expect(host.querySelector(".primary-button")).not.toBeNull();
  });
});

/**
 * MASTER-2027 §03.09 — the read that finished without its reader.
 *
 * The offer is asked about ONCE at mount, and only a city the server calls
 * finished is shown. `analyzing` keeps the record for the next visit rather than
 * announcing a result that does not exist yet; a job the server no longer has is
 * forgotten; a server that does not answer is not read as either.
 */
describe("a read left running is offered once it finished (§03.09)", () => {
  const ID = "5edbe8b7-d4ee-4e3c-9a11-fc8352ee27a4";
  const KEY = "codecity-pending-run:v1";

  function stubStatus(answer: { ok: boolean; status: number; body: unknown }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const a = url.includes("/api/status/") ? answer : { ok: true, status: 200, body: {} };
        return {
          ok: a.ok,
          status: a.status,
          json: async () => a.body,
          headers: { get: () => null },
        } as unknown as Response;
      }),
    );
  }

  function statusCalls(): string[] {
    const mock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    return mock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/status/"));
  }

  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    localStorage.setItem(KEY, ID);
  });

  it("offers the finished city as one decision, beside the plain landing", async () => {
    stubStatus({ ok: true, status: 200, body: { status: "complete", progress: 100 } });
    await mountLanding();
    const offer = host.querySelector(".landing-resume");
    expect(offer).not.toBeNull();
    const link = offer?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(`?city=${ID}`);
    // one way forward, and the ordinary actions untouched
    expect(offer?.querySelectorAll("a, button")).toHaveLength(1);
    expect(host.querySelector(".primary-button")).not.toBeNull();
  });

  it("asks the server about the run it knows of", async () => {
    stubStatus({ ok: true, status: 200, body: { status: "complete" } });
    await mountLanding();
    expect(statusCalls()).toEqual([`/api/status/${ID}`]);
  });

  it("says nothing while the read is still going, and keeps the record", async () => {
    stubStatus({ ok: true, status: 200, body: { status: "analyzing", progress: 88 } });
    await mountLanding();
    expect(host.querySelector(".landing-resume")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe(ID);
  });

  it("forgets a run the server no longer has", async () => {
    stubStatus({ ok: false, status: 404, body: { error: "Analysis not found" } });
    await mountLanding();
    expect(host.querySelector(".landing-resume")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not read a silent server as a finished city", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/status/")) throw new Error("offline");
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }),
    );
    await mountLanding();
    expect(host.querySelector(".landing-resume")).toBeNull();
    // kept: the next visit asks again, because nothing proved either way
    expect(localStorage.getItem(KEY)).toBe(ID);
  });

  it("asks nothing when this browser knows of no run", async () => {
    localStorage.removeItem(KEY);
    stubStatus({ ok: true, status: 200, body: { status: "complete" } });
    await mountLanding();
    expect(statusCalls()).toHaveLength(0);
    expect(host.querySelector(".landing-resume")).toBeNull();
  });

  it("keeps the first-arrival welcome intact when both are on screen", async () => {
    // The measured case: a first visit whose read finished in the background.
    // The greeting is still one decision; the offer does not stack a second
    // one. #28 sharpens this: while a beat is on screen the entry surface —
    // the offer's slot included — waits, and the offer arrives with it.
    useStore.setState({ ...useStore.getInitialState(), firstRun: true });
    stubStatus({ ok: true, status: 200, body: { status: "complete" } });
    await mountLanding();
    expect(host.querySelector(".landing-welcome")).not.toBeNull();
    expect(host.querySelectorAll(".landing-welcome button")).toHaveLength(1);
    expect(host.querySelector(".landing-resume")).toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".landing-welcome-begin")?.click();
    });
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".landing-guide-actions button")]
        .find((b) => /Continue|Weiter/.test(b.textContent ?? ""))
        ?.click();
    });
    expect(host.querySelector(".landing-resume")).not.toBeNull();
  });
});

/**
 * MASTER-2027 §03.10 — the last project, offered where the reader decides.
 *
 * Measured before building (`zuletzt-messung.json`): at 1280×800 the
 * "recently opened" row starts 814 px down — below the fold — and nothing above
 * it names the reader's own project (`mentionsAbove: 0`). One click works; being
 * seen is the gap. The offer therefore shares the §03.09 slot, and a city past
 * the server's keep time is left in the history list instead of offered as a way
 * back in.
 */
describe("the last opened city is offered at the decision point (§03.10)", () => {
  const RECENT_KEY = "codecity-recent:v1";

  const visit = (name: string, id: string, files = 74) =>
    city({
      repo: { owner: "local", name, branch: "main" },
      analysisId: id,
      totalFiles: files,
      files: [file("src/db.ts", "TypeScript")],
      tree: dir({ path: "", detailFiles: [file("src/db.ts", "TypeScript")] }),
    });

  function recordRecent(name: string, id: string): void {
    recordCityVisit(visit(name, id));
    // The visit is what writes the index; the screen goes back to the landing.
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
  }

  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
  });

  it("names the last city above the actions, with one way back", async () => {
    recordRecent("auth-app", "scan-42");
    await mountLanding();
    const offer = host.querySelector(".landing-resume");
    expect(offer).not.toBeNull();
    expect(offer?.textContent).toContain("auth-app");
    expect(offer?.querySelector("a")?.getAttribute("href")).toBe("?city=scan-42");
    expect(offer?.querySelectorAll("a, button")).toHaveLength(1);
  });

  it("stays out of the way on a machine that never opened a city", async () => {
    await mountLanding();
    expect(host.querySelector(".landing-resume")).toBeNull();
  });

  it("offers the newest of two, not the first written", async () => {
    recordRecent("older-app", "scan-1");
    recordRecent("newer-app", "scan-2");
    await mountLanding();
    const offer = host.querySelector(".landing-resume");
    expect(offer?.textContent).toContain("newer-app");
    expect(offer?.querySelector("a")?.getAttribute("href")).toBe("?city=scan-2");
  });

  it("leaves a city past the server's keep time in the history list", async () => {
    // 25 h old: the backend has certainly dropped it, so the line above the
    // actions would be a promise to a dead link.
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([
        {
          id: "scan-old",
          folder: "stale-app",
          openedAt: Date.now() - 25 * 60 * 60 * 1000,
          files: 9,
          findings: 0,
        },
      ]),
    );
    await mountLanding();
    expect(host.querySelector(".landing-resume")).toBeNull();
    // it is still readable as history below
    expect(host.querySelector(".start-recent")).not.toBeNull();
  });

  it("gives the slot to the read that just finished", async () => {
    // Both exist: an older visit and a run that completed in the absence. The
    // fresher fact is the one offered, and only one line shows.
    recordRecent("auth-app", "scan-42");
    localStorage.setItem("codecity-pending-run:v1", "5edbe8b7-d4ee-4e3c-9a11-fc8352ee27a4");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const a = String(input).includes("/api/status/")
          ? { ok: true, status: 200, body: { status: "complete" } }
          : { ok: true, status: 200, body: {} };
        return {
          ok: a.ok,
          status: a.status,
          json: async () => a.body,
          headers: { get: () => null },
        } as unknown as Response;
      }),
    );
    await mountLanding();
    const offers = host.querySelectorAll(".landing-resume");
    expect(offers).toHaveLength(1);
    expect(offers[0]?.getAttribute("href")).toBeNull();
    expect(offers[0]?.querySelector("a")?.getAttribute("href")).toBe(
      "?city=5edbe8b7-d4ee-4e3c-9a11-fc8352ee27a4",
    );
  });
});

/**
 * MASTER-2027 §03.08 — the setup progress survives the tab.
 *
 * Before this step the beat lived only in `useState`: reload mid-sequence and
 * the greeting was back, and so was it after a Skip, because the reader had not
 * yet reached a city. These are reload tests — unmount, remount, storage kept —
 * which is the only way to show the record rather than the animation carries the
 * state.
 */
describe("the arrival beat survives a reload (§03.08)", () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: true });
  });

  function guideAction(pattern: RegExp): HTMLButtonElement | undefined {
    return [...host.querySelectorAll<HTMLButtonElement>(".landing-guide-actions button")].find(
      (b) => pattern.test(b.textContent ?? ""),
    );
  }

  it("returns to the introduction, not to the greeting", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".landing-welcome-begin")?.click();
    });
    await reloadLanding();
    expect(host.querySelector(".landing-welcome")).toBeNull();
    expect(host.querySelector(".landing-guide")).not.toBeNull();
    // the marks agree with the card: beat one done, beat two current. Erste
    // Reise took the third entry out — it named a button that is not on this
    // screen, and the row said the beat titles a second time.
    const states = [...host.querySelectorAll(".start-progress-steps li")].map((li) =>
      li.getAttribute("data-state"),
    );
    expect(states).toEqual(["done", "current"]);
  });

  it("keeps a skip skipped", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-progress-skip")?.click();
    });
    await reloadLanding();
    expect(host.querySelector(".landing-welcome")).toBeNull();
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-progress-steps")).toBeNull();
    // the way in is unchanged — "skipped" is not "locked out"
    expect(host.querySelector(".primary-button")).not.toBeNull();
  });

  it("keeps a finished introduction finished", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".landing-welcome-begin")?.click();
    });
    await act(async () => {
      guideAction(/Continue|Weiter/)?.click();
    });
    await reloadLanding();
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-progress-steps")).toBeNull();
  });

  it("follows Back to the greeting, instead of stranding the reader past their own step", async () => {
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".landing-welcome-begin")?.click();
    });
    await act(async () => {
      guideAction(/Back|Zurück/)?.click();
    });
    await reloadLanding();
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".landing-welcome")).not.toBeNull();
  });

  it("lets the arrival stamp outrank a stored beat", async () => {
    // A machine that has shown a city is through the introduction whatever the
    // record says: a half-way value must not reopen the sequence.
    localStorage.setItem("codecity-arrival-stage:v1", "intro");
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    await mountLanding();
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-progress-steps")).toBeNull();
    expect(host.querySelector(".primary-button")).not.toBeNull();
  });

  it("writes nothing while the reader has done nothing", async () => {
    await mountLanding();
    expect(localStorage.getItem("codecity-arrival-stage:v1")).toBeNull();
    expect(host.querySelector(".landing-welcome")).not.toBeNull();
  });
});

/**
 * MASTER-2027 §03.11 — the introduction, for the reader who asks again.
 *
 * There was no way back: `firstRun` decides the sequence silently, and the dock's
 * "First look" (`ActionBar.tsx:757-766`) toggles `showPrimer` — the in-city coach
 * marks — not this. So the step is one control, shown only while the sequence is
 * off screen, and it never undoes that the machine has arrived.
 */
describe("the introduction can be asked for again (§03.11)", () => {
  const STAMP = "codecity-first-arrival:v1";

  it("offers the way back to a reader who has been here", async () => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    localStorage.setItem(STAMP, "1");
    await mountLanding();
    const replay = host.querySelector<HTMLButtonElement>(".start-replay");
    expect(replay).not.toBeNull();
    expect((replay?.textContent ?? "").length).toBeGreaterThan(8);
  });

  it("opens the greeting, still one decision", async () => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-replay")?.click();
    });
    const welcome = host.querySelector(".landing-welcome");
    expect(welcome).not.toBeNull();
    expect(welcome?.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector(".start-progress-steps")).not.toBeNull();
    // the control that opened it is gone: one way in at a time
    expect(host.querySelector(".start-replay")).toBeNull();
  });

  it("walks the same two beats and ends back on the plain landing", async () => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-replay")?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".landing-welcome-begin")?.click();
    });
    expect(host.querySelectorAll(".landing-guide-steps li")).toHaveLength(3);
    const cont = [
      ...host.querySelectorAll<HTMLButtonElement>(".landing-guide-actions button"),
    ].find((b) => /Continue|Weiter/.test(b.textContent ?? ""));
    await act(async () => {
      cont?.click();
    });
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-progress-steps")).toBeNull();
    expect(host.querySelector(".start-replay")).not.toBeNull();
    expect(host.querySelector(".primary-button")).not.toBeNull();
  });

  it("asking again does not undo that this machine has arrived", async () => {
    localStorage.setItem(STAMP, "1");
    useStore.setState({ ...useStore.getInitialState(), firstRun: false });
    await mountLanding();
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".start-replay")?.click();
    });
    expect(localStorage.getItem(STAMP)).toBe("1");
    // and a reload after a half-finished replay does not reopen the sequence
    await reloadLanding();
    expect(host.querySelector(".landing-welcome")).toBeNull();
    expect(host.querySelector(".start-replay")).not.toBeNull();
  });

  it("stays out of the way while the sequence is on its own", async () => {
    useStore.setState({ ...useStore.getInitialState(), firstRun: true });
    await mountLanding();
    expect(host.querySelector(".landing-welcome")).not.toBeNull();
    expect(host.querySelector(".start-replay")).toBeNull();
  });

  it("names itself in both languages, and does not fake it", () => {
    const en = t("en", "landing.replayIntro");
    const de = t("de", "landing.replayIntro");
    expect(en.length).toBeGreaterThan(8);
    expect(de.length).toBeGreaterThan(8);
    expect(de).not.toBe(en);
  });
});
