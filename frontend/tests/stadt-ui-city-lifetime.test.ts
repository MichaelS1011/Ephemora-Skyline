// @vitest-environment jsdom
// The link the app hands out outlives the process now: completed runs are
// archived, so the sentence about it must name the archive's bound rather than
// the RAM cache's TTL. The bound comes from the server (`/api/health`), and a
// server that does not answer is reported instead of guessed at.
import { describe, it, expect, afterEach, vi } from "vitest";
import { cityLinkNotice, readRunArchiveBounds } from "../src/cityLifetime";
import { t } from "../src/i18n";

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

describe("the city link says how many completed runs the archive keeps", () => {
  it("quotes the running archive bound in the sentence", async () => {
    answer({ runArchive: { maxEntries: 20 } });
    expect(await cityLinkNotice("en")).toBe(
      "City link copied. It opens on this machine only — also after a restart, until 20 newer completed scans push it out.",
    );
    answer({ runArchive: { maxEntries: 3 } });
    const de = await cityLinkNotice("de");
    expect(de).toContain("3 neuere abgeschlossene Scans");
    expect(de).not.toContain("20");
    expect(de).not.toContain("Stunden");
    expect(de).not.toContain("Tag");
  });

  it("reports a server it cannot reach instead of reciting a default", async () => {
    answer({});
    expect(await readRunArchiveBounds()).toBeNull();
    expect(await cityLinkNotice("de")).toBe(t("de", "actions.linkCopiedUnknown"));
    expect(await cityLinkNotice("en")).not.toMatch(/20 newer|20 neuere/);
  });

  it("reports a server that answers but names no archive bound", async () => {
    answer({ status: "ok", uptime: 12, cityStore: { maxEntries: 20, ttlMs: 86_400_000 } });
    expect(await readRunArchiveBounds()).toBeNull();
  });

  it("refuses a nonsense bound rather than painting it as fact", async () => {
    answer({ runArchive: { maxEntries: 0 } });
    expect(await readRunArchiveBounds()).toBeNull();
    answer({ runArchive: { maxEntries: -1 } });
    expect(await readRunArchiveBounds()).toBeNull();
    answer({ runArchive: { maxEntries: 2.5 } });
    expect(await readRunArchiveBounds()).toBeNull();
    answer({ runArchive: { maxEntries: "20" } });
    expect(await readRunArchiveBounds()).toBeNull();
  });

  it("a fetch that throws is an unknown, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await readRunArchiveBounds()).toBeNull();
    expect(await cityLinkNotice("de")).toBe(t("de", "actions.linkCopiedUnknown"));
  });
});
