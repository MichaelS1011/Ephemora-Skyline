// @vitest-environment jsdom
// The link the app hands out points into the backend's in-RAM store, and the
// sentence about it recited that store's defaults: "about a day or the next 20
// scans". Both numbers come from the environment (`ANALYSIS_TTL_MS`,
// `ANALYSIS_MAX_ENTRIES`, backend/src/server/index.ts:62-63) and nothing read
// them. A shipped product's env file changes one of them and the screen is
// wrong. It now asks, and says "unknown" when the server does not answer.
import { describe, it, expect, afterEach, vi } from "vitest";
import { cityLinkNotice, lifetimeWords, readCityStoreBounds } from "../src/cityLifetime";
import { t } from "../src/i18n";

const DAY_MS = 86_400_000;

function answer(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the city link says the lifetime the server is actually holding", () => {
  it("quotes the running bounds in the sentence", async () => {
    answer({ cityStore: { maxEntries: 20, ttlMs: DAY_MS } });
    const de = await cityLinkNotice("de");
    expect(de).toContain("etwa 1 Tag");
    expect(de).toContain("20 Scans");
    answer({ cityStore: { maxEntries: 20, ttlMs: DAY_MS } });
    expect(await cityLinkNotice("en")).toBe(
      "City link copied. It opens on this machine only, while the server runs — about 1 day or the next 20 scans, whichever comes first.",
    );
  });

  it("follows the operator, not the default", async () => {
    answer({ cityStore: { maxEntries: 3, ttlMs: 6 * 3_600_000 } });
    const de = await cityLinkNotice("de");
    expect(de).toContain("6 Stunden");
    expect(de).toContain("3 Scans");
    expect(de).not.toContain("20 Scans");
    expect(de).not.toContain("1 Tag");
  });

  it("names the hours it means, in both languages", () => {
    expect(lifetimeWords("de", 2 * 3_600_000)).toBe("2 Stunden");
    expect(lifetimeWords("de", 1 * 3_600_000)).toBe("1 Stunde");
    expect(lifetimeWords("en", 3 * DAY_MS)).toBe("3 days");
    expect(lifetimeWords("en", DAY_MS)).toBe("1 day");
    // 36 h is a day and a half: it is told in hours, not rounded to a day.
    expect(lifetimeWords("de", 36 * 3_600_000)).toBe("36 Stunden");
  });

  it("reports a server it cannot reach instead of reciting a default", async () => {
    answer({});
    expect(await readCityStoreBounds()).toBeNull();
    expect(await cityLinkNotice("de")).toBe(t("de", "actions.linkCopiedUnknown"));
    expect(await cityLinkNotice("en")).not.toMatch(/20 Scans|20 scans|1 day|1 Tag/);
  });

  it("reports a server that answers but names nothing", async () => {
    answer({ status: "ok", uptime: 12 });
    expect(await readCityStoreBounds()).toBeNull();
  });

  it("refuses a nonsense bound rather than painting it as fact", async () => {
    answer({ cityStore: { maxEntries: 20, ttlMs: 0 } });
    expect(await readCityStoreBounds()).toBeNull();
    answer({ cityStore: { maxEntries: "20", ttlMs: DAY_MS } });
    expect(await readCityStoreBounds()).toBeNull();
  });

  it("a fetch that throws is an unknown, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await readCityStoreBounds()).toBeNull();
    expect(await cityLinkNotice("de")).toBe(t("de", "actions.linkCopiedUnknown"));
  });
});
