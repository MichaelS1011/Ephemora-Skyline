// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { fetchBackendReviews } from "../src/reviews";
import { t, type DictKey, type Lang } from "../src/i18n";
import { Landing } from "../src/components/Landing";

/**
 * The entry screen's delete controls count what they removed and say it in a
 * sentence. At exactly one the sentence used the plural branch anyway:
 * "1 verdict buckets removed from this browser" / "1 Urteils-Ablagen … entfernt"
 * — the singular branch `landing.footprintResetDoneOne` sat complete in the
 * dictionary, uncalled, and `landing.footprintResetRefused` shipped no singular
 * at all. Same class, same screen: purge read "1 copies deleted". These cases
 * drive the real buttons at n = 0, 1 and 2 in both languages.
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

/** Verdict routes answer `verdictAnswer`; purge answers one removed copy. */
function stubRoutes(verdictAnswer: { status: number; body: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, _init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("/verdicts")) return jsonResponse(verdictAnswer.status, verdictAnswer.body);
      if (url.endsWith("/api/footprint/purge")) {
        return jsonResponse(200, { removed: 1, bytesFreed: 2048 });
      }
      if (url.endsWith("/api/footprint")) {
        return jsonResponse(200, {
          root: "/tmp/some-project",
          copies: 1,
          bytes: 2048,
          stale: 1,
          ttlHours: 24,
          approx: false,
        });
      }
      return jsonResponse(200, {});
    }),
  );
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

function buttonLabelled(lang: Lang, key: DictKey): HTMLButtonElement {
  const label = t(lang, key);
  const btn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(btn, `the control labelled "${label}" is on the entry screen`).toBeTruthy();
  return btn!;
}

/** The sentence the screen shows after the last button press. */
function footNote(match: RegExp): string {
  const notes = [...host.querySelectorAll("p[role='status']")].map((p) => p.textContent ?? "");
  return notes.find((s) => match.test(s)) ?? "";
}

const RESET_NOTE = /browser|Browser/;
const PURGE_NOTE = /deleted|gelöscht|freed|frei/;

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

describe("one verdict bucket reads as one", () => {
  it("english success sentence declines the single bucket", async () => {
    stubRoutes({ status: 200, body: { project: "p-1", reviews: {} } });
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("read");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("en");
    await act(async () => {
      buttonLabelled("en", "landing.footprintReset").click();
    });
    expect(footNote(RESET_NOTE)).toBe("1 verdict bucket removed from this browser");
  });

  it("german success sentence declines the single bucket", async () => {
    stubRoutes({ status: 200, body: { project: "p-1", reviews: {} } });
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("read");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("de");
    await act(async () => {
      buttonLabelled("de", "landing.footprintReset").click();
    });
    expect(footNote(RESET_NOTE)).toBe("1 Urteils-Ablage aus diesem Browser entfernt");
  });

  it("english refusal declines the single bucket too", async () => {
    stubRoutes({ status: 503, body: unreadableBody });
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("unreadable");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("en");
    await act(async () => {
      buttonLabelled("en", "landing.footprintReset").click();
    });
    expect(footNote(RESET_NOTE)).toBe(
      "1 verdict bucket removed from this browser — the copy saved on this machine " +
        "could not be read just now, so it was left untouched",
    );
  });

  it("german refusal declines the single bucket too", async () => {
    stubRoutes({ status: 503, body: unreadableBody });
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("unreadable");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    await mountLanding("de");
    await act(async () => {
      buttonLabelled("de", "landing.footprintReset").click();
    });
    expect(footNote(RESET_NOTE)).toBe(
      "1 Urteils-Ablage aus diesem Browser entfernt — die auf diesem Rechner gespeicherte " +
        "Kopie konnte gerade nicht gelesen werden, deshalb bleibt sie unberührt",
    );
  });

  it("keeps the plural at two and at zero — 0 stays plural, as plural() teaches", async () => {
    stubRoutes({ status: 200, body: { project: "p-1", reviews: {} } });
    expect((await fetchBackendReviews("a-1", "p-1")).state).toBe("read");
    localStorage.setItem("codecity-reviews:p-one", JSON.stringify({ "f-1": "to-fix" }));
    localStorage.setItem("codecity-reviews:p-two", JSON.stringify({ "f-2": "reviewed" }));
    await mountLanding("en");
    await act(async () => {
      buttonLabelled("en", "landing.footprintReset").click();
    });
    expect(footNote(RESET_NOTE)).toBe("2 verdict buckets removed from this browser");
    localStorage.clear();
    await act(async () => {
      buttonLabelled("en", "landing.footprintReset").click();
    });
    expect(footNote(RESET_NOTE)).toBe("0 verdict buckets removed from this browser");
  });

  it("purge of one stale copy says one copy in english", async () => {
    stubRoutes({ status: 200, body: { project: "p-1", reviews: {} } });
    await mountLanding("en");
    await act(async () => {
      buttonLabelled("en", "landing.footprintPurge").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(footNote(PURGE_NOTE)).toBe("1 copy deleted, 2 KB freed");
  });

  it("purge of one stale copy says one copy in german", async () => {
    stubRoutes({ status: 200, body: { project: "p-1", reviews: {} } });
    await mountLanding("de");
    await act(async () => {
      buttonLabelled("de", "landing.footprintPurge").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(footNote(PURGE_NOTE)).toBe("1 Kopie gelöscht, 2 KB frei geworden");
  });
});
