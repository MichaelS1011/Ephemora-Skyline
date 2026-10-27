// @vitest-environment jsdom
/**
 * THE DOCK'S "CHECK FOR UPDATES" ANSWER, IN ALL FOUR CASES.
 *
 * The action exists (`ActionBar.tsx`, row "↻ Check for updates"), and it answers
 * three things: a newer version, "you are up to date", or "could not check". The
 * fourth case was drawn as the second one: when nothing is published at all —
 * `latest: null`, which is this project's permanent state until a release is
 * tagged — the check said "You are up to date (0.1.0)". That is an unanswered
 * question reported as a positive answer, the same class the storage readers
 * refuse (`storageRead.ts`).
 *
 * Every case runs in both languages, because a note nobody can read is no note.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import { useOrigin } from "../src/stores/useOrigin";
import { t, type Lang } from "../src/i18n";
import { city, file } from "./helpers/cityFixture";

const tEn = (key: string) => t("en", key as never);
const tDe = (key: string) => t("de", key as never);

type CheckBody = {
  current?: string;
  latest?: string | null;
  updateAvailable?: boolean;
  offline?: boolean;
  releaseUrl?: string | null;
};

let host: HTMLDivElement;
let root: Root;

async function mount(lang: Lang): Promise<void> {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { lang, gfxLite: false, colorblind: false, updateCheck: false },
      cityData: city({
        totalFiles: 1,
        renderedFiles: 1,
        meta: { churn: true, deadCode: false, duplicates: false, cycles: false, coverage: false },
        tree: {
          name: "probe",
          path: "",
          children: [],
          detailFiles: [file("a.ts", "TypeScript")],
          districtFiles: [],
        },
      } as never),
      analysisId: "scan-1",
      buildPhase: "built",
    },
    true,
  );
  useOrigin.setState({ origin: "live" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(ActionBar));
  });
}

/** The reader finds the row by its own word, in their own language. */
async function pressCheck(lang: Lang): Promise<void> {
  const more = host.querySelector<HTMLButtonElement>("#city-more-button");
  expect(more, "the dock has no ••• control").toBeTruthy();
  act(() => more!.click());
  const label = lang === "en" ? tEn("update.check") : tDe("update.check");
  const row = [...host.querySelectorAll<HTMLButtonElement>("#city-more-menu button")].find((b) =>
    (b.textContent ?? "").includes(label),
  );
  expect(row, `no "${label}" row in the menu`).toBeTruthy();
  await act(async () => {
    row!.click();
  });
}

/** The dock's own answer line — role says whether it is a warning. */
function answer(): { text: string; error: boolean } {
  const node = host.querySelector<HTMLElement>(
    '.action-dock [role="status"], .action-dock [role="alert"]',
  );
  expect(node, "the check left no answer on screen").toBeTruthy();
  return { text: node!.textContent ?? "", error: node!.getAttribute("role") === "alert" };
}

function stubFetch(body: CheckBody, ok = true): typeof globalThis.fetch {
  const fetch = vi.fn(async () =>
    ok ? { ok: true, json: async () => body } : { ok: false, status: 503, json: async () => ({}) },
  ) as unknown as typeof globalThis.fetch;
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the update check answers what it actually found", () => {
  it("names the newer version, in both languages", async () => {
    for (const lang of ["en", "de"] as const) {
      await mount(lang);
      stubFetch({ current: "0.1.0", latest: "0.2.0", updateAvailable: true });
      await pressCheck(lang);
      const { text, error } = answer();
      expect(text).toContain("0.2.0");
      expect(text).toContain(lang === "en" ? "available" : "verfügbar");
      expect(error, "a newer version is news, not a fault").toBe(false);
      act(() => root.unmount());
      host.remove();
    }
  });

  it("says 'up to date' only when a published version was compared", async () => {
    for (const lang of ["en", "de"] as const) {
      await mount(lang);
      stubFetch({ current: "0.1.0", latest: "0.1.0", updateAvailable: false });
      await pressCheck(lang);
      const { text } = answer();
      expect(text).toContain("0.1.0");
      expect(text).toContain(lang === "en" ? "up to date" : "neuesten Stand");
      expect(text).not.toContain(tEn("update.nonePublished").slice(0, 24));
      act(() => root.unmount());
      host.remove();
    }
  });

  /** The case that used to be answered as "up to date": nothing published. */
  it("refuses to call an absent release 'the newest version' (en)", async () => {
    const lang: Lang = "en";
    await mount(lang);
    stubFetch({ current: "0.1.0", latest: null, updateAvailable: false });
    await pressCheck(lang);
    const { text, error } = answer();
    expect(text).toContain("No published version to compare with");
    expect(text, "no positive answer may hide in here").not.toMatch(/up to date/i);
    expect(error, "it is not a fault either — the question just has no subject").toBe(false);
  });

  it("says the same in German, without claiming a newest stand", async () => {
    const lang: Lang = "de";
    await mount(lang);
    stubFetch({ current: "0.1.0", latest: null, updateAvailable: false });
    await pressCheck(lang);
    const { text } = answer();
    expect(text).toContain("Kein veröffentlichter Stand zum Vergleichen");
    expect(text).not.toMatch(/neuesten Stand/);
  });

  it("calls an offline machine what it is, in both languages", async () => {
    for (const lang of ["en", "de"] as const) {
      await mount(lang);
      stubFetch({ current: "0.1.0", latest: null, updateAvailable: false, offline: true });
      await pressCheck(lang);
      const { text, error } = answer();
      expect(text).toContain(lang === "en" ? "Could not check" : "nicht möglich");
      expect(error, "an unanswered check is a fault to report").toBe(true);
      act(() => root.unmount());
      host.remove();
    }
  });

  it("does not read a failed request as 'you are current'", async () => {
    const lang: Lang = "en";
    await mount(lang);
    stubFetch({}, false);
    await pressCheck(lang);
    const { text, error } = answer();
    expect(text).toContain("Could not check for updates");
    expect(text).not.toMatch(/up to date|No published version/);
    expect(error).toBe(true);
  });

  it("a carried file has no network to ask, and says so without asking", async () => {
    const lang: Lang = "en";
    await mount(lang);
    useOrigin.setState({ origin: "file" });
    const fetch = stubFetch({ current: "0.1.0", latest: "0.2.0", updateAvailable: true });
    await pressCheck(lang);
    expect(fetch, "the file page must not reach for a backend").not.toHaveBeenCalled();
    expect(answer().text).toContain("Could not check for updates");
  });

  it("the answer stands until the reader dismisses it", async () => {
    const lang: Lang = "en";
    await mount(lang);
    stubFetch({ current: "0.1.0", latest: null, updateAvailable: false });
    await pressCheck(lang);
    expect(answer().text).toContain("No published version");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(answer().text, "a note that evaporates mid-read is not an answer").toContain(
      "No published version",
    );
    const dismiss = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${tEn("actions.dismissAria")}"]`,
    );
    expect(dismiss, "the note has no way to be set aside").toBeTruthy();
    act(() => dismiss!.click());
    expect(host.querySelector('.action-dock [role="status"]')).toBeNull();
  });
});
