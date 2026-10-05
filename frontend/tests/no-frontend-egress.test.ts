import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * The entry document is the one part of the app the browser loads before a
 * person has done anything — so whatever it references leaves the machine
 * without being asked, and no backend switch can stop it. Until today JetBrains
 * Mono came from `fonts.googleapis.com` with a `preconnect`, and that request
 * appeared in no disclosure list.
 *
 * This test is the guard: the shipped entry document may reference local files
 * and loopback only. Anything else is a new outbound path and belongs in the
 * privacy table first — where the backend-side hosts are already pinned by
 * `backend/tests/network-honesty.test.ts`.
 */
const root = path.resolve(import.meta.dirname, "..");
const entry = readFileSync(path.join(root, "index.html"), "utf8");

function externalHosts(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/([^/"'\s?#]+)/g)) {
    const host = m[1]!.toLowerCase();
    if (host === "localhost" || host.startsWith("127.")) continue;
    found.add(host);
  }
  return [...found];
}

describe("the entry document asks nothing of the network", () => {
  it("references no third-party host", () => {
    expect(externalHosts(entry), `index.html loads: ${externalHosts(entry).join(", ")}`).toEqual(
      [],
    );
  });

  it("carries its font from the bundle instead of a CDN", () => {
    const main = readFileSync(path.join(root, "src/main.tsx"), "utf8");
    expect(main).toContain("@fontsource/jetbrains-mono/latin-400.css");
    expect(entry).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  /**
   * A bundled font is a redistributed font. JetBrains Mono is SIL OFL 1.1,
   * which travels with the copy — so the licence text has to be in the build
   * output, not only in node_modules where a `npm ci` on another machine puts
   * it. This fails the day someone swaps the typeface and forgets the paperwork.
   */
  it("ships the licence of every font it bundles", () => {
    const main = readFileSync(path.join(root, "src/main.tsx"), "utf8");
    const gebuendelt = [...main.matchAll(/@fontsource\/([a-z0-9-]+)\//g)].map((m) => m[1]!);
    expect(gebuendelt.length, "main.tsx bundles no font").toBeGreaterThan(0);
    const notices = readdirSync(path.join(root, "public"))
      .filter((f) => /OFL|LICEN[CS]E/i.test(f))
      .join(" ")
      .toLowerCase();
    for (const familie of new Set(gebuendelt)) {
      expect(notices, `${familie} is bundled with no licence in public/`).toContain(familie);
    }
  });
});
