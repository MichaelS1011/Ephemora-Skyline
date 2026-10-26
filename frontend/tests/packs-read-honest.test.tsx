// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileChips } from "../src/components/ProfileChips";
import { fetchRulePacks, loadSavedPacks, savePacks } from "../src/config/rulePacks";
import type { RulePackInfo } from "../src/config/rulePacks";
import { t as tDict } from "../src/i18n";
import { useStore } from "../src/stores/useStore";

/**
 * The rule-pack row asks the backend a question about the disk. When that read
 * fails — no backend, 5xx, broken bytes — the old answer was `[]`, and the chip
 * row fell silent exactly as it does when the machine truly holds no packs.
 * "I cannot see your configuration" rendered identical to "you have no
 * configuration". Same defect class the verdicts rounds closed one route over:
 * a failed read must not be stated as an empty set, and the prune-on-set must
 * not fire on bytes nobody read.
 */

const tEn = (key: string, vars?: Record<string, string | number>) =>
  tDict("en", key as never, vars);
const tDe = (key: string, vars?: Record<string, string | number>) =>
  tDict("de", key as never, vars);

const pack: RulePackInfo = {
  id: "ephemora-core",
  name: "Ephemora core rules",
  version: "1.0.0",
  origin: "shipped",
  source: "in-repo",
  license: "Apache-2.0",
  categories: ["injection"],
  languages: ["typescript"],
  ruleCount: 12,
  default: true,
};

interface StubResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function stubFetch(impl: (input: string) => Promise<StubResponse>): void {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (!url.includes("/api/rule-packs")) return { ok: true, status: 200, json: async () => ({}) };
    return impl(url);
  });
}

let container: HTMLDivElement;
let root: Root;

async function render(variant: "landing" | "analyze-panel" = "analyze-panel"): Promise<string> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ProfileChips, { variant })));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return container.textContent ?? "";
}

async function dispose(): Promise<void> {
  if (!root) return;
  await act(async () => root.unmount());
  container?.remove();
  // @ts-expect-error test teardown bookkeeping
  root = null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), scanProfile: "standard" }, true);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  if (container) container.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("fetchRulePacks answers read / absent / unreadable, never a bare []", () => {
  it("a refused connection is unreadable, not an empty set", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchRulePacks()).toEqual({ state: "unreadable" });
  });

  it("a 5xx is unreadable", async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchRulePacks()).toEqual({ state: "unreadable" });
  });

  it("broken bytes behind a 200 are unreadable", async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }));
    expect(await fetchRulePacks()).toEqual({ state: "unreadable" });
  });

  it("a 200 whose payload has no packs array is unreadable", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ offline: false }) }));
    expect(await fetchRulePacks()).toEqual({ state: "unreadable" });
  });

  it("an empty packs array is a real answer: read", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ packs: [] }) }));
    expect(await fetchRulePacks()).toEqual({ state: "read", packs: [] });
  });

  it("a normal answer is read with the packs", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ packs: [pack] }) }));
    expect(await fetchRulePacks()).toEqual({ state: "read", packs: [pack] });
  });

  it("a 404 — no such route on this backend — is absent", async () => {
    stubFetch(async () => ({
      ok: false,
      status: 404,
      json: async () => "Cannot GET /api/rule-packs",
    }));
    expect(await fetchRulePacks()).toEqual({ state: "absent" });
  });
});

describe("the chip row says the failed read in words", () => {
  it("offline is NOT rendered identical to genuinely zero packs", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const offlineText = await render();
    await dispose();
    useStore.setState(useStore.getInitialState(), true);
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ packs: [] }) }));
    const emptyText = await render();
    expect(
      offlineText,
      `a backend that is not reachable and a machine with zero packs render the same words — the failure is invisible: ${JSON.stringify(
        { offlineText, emptyText },
      )}`,
    ).not.toBe(emptyText);
  });

  const failures: [string, (input: string) => Promise<StubResponse>][] = [
    [
      "refused connection",
      async () => {
        throw new TypeError("Failed to fetch");
      },
    ],
    ["5xx", async () => ({ ok: false, status: 500, json: async () => ({}) })],
    [
      "malformed bytes",
      async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      }),
    ],
  ];
  for (const [name, impl] of failures) {
    it(`a ${name} read states the sentence, as an alert`, async () => {
      stubFetch(impl);
      const body = await render();
      expect(body).toContain(tEn("profile.packsUnreadable"));
      const note = container.querySelector("[data-packs-unreadable]");
      expect(note, "the failed read needs a marked node, not only text").not.toBeNull();
      expect(note?.getAttribute("role")).toBe("alert");
    });
  }

  it("the German sentence is the same fact in German", async () => {
    const before = useStore.getState().prefs;
    await act(async () => useStore.setState({ prefs: { ...before, lang: "de" } }));
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const body = await render();
    try {
      expect(body).toContain(tDe("profile.packsUnreadable"));
      expect(body).not.toContain(tEn("profile.packsUnreadable"));
    } finally {
      await act(async () => useStore.setState({ prefs: before }));
    }
  });

  it("a genuine zero-pack answer stays silent: the sentence is not a status quo banner", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ packs: [] }) }));
    const body = await render();
    expect(body).not.toContain(tEn("profile.packsUnreadable"));
    expect(container.querySelector("[data-packs-unreadable]")).toBeNull();
  });

  it("a 404 absent route stays silent too: the old backend never had packs", async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const body = await render();
    expect(body).not.toContain(tEn("profile.packsUnreadable"));
    expect(container.querySelector("[data-packs-unreadable]")).toBeNull();
  });

  it("a successful read shows the chips and no note", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ packs: [pack] }) }));
    const body = await render();
    expect(body).toContain(pack.name);
    expect(container.querySelector("[data-packs-unreadable]")).toBeNull();
  });
});

describe("the prune door: a failed read must not rewrite the saved selection", () => {
  it("saved scanPacks survive an unreadable read in store and on disk", async () => {
    savePacks(["ephemora-core"]);
    useStore.setState({ scanPacks: ["ephemora-core"] });
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await render();
    expect(
      useStore.getState().scanPacks,
      "setAvailablePacks([]) over unread bytes wipes the choice",
    ).toEqual(["ephemora-core"]);
    expect(loadSavedPacks(), "localStorage must not be rewritten from a read that failed").toEqual([
      "ephemora-core",
    ]);
  });
});
