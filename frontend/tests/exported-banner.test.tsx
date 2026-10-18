// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * The banner a carried city shows.
 *
 * Measured before this file: an exported folder opened with "◈ Scan complete"
 * over a city nobody had scanned there, a countdown offering to hold a notice
 * about work that happened on another machine. The product forbids that
 * sentence everywhere it speaks about itself, so the exported page says what
 * it is — one scan, carried as a file — and starts folded.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ScanSummary } from "../src/components/ScanSummary";
import { city } from "./helpers/cityFixture";
import { useOrigin, type PageOrigin } from "../src/stores/useOrigin";
import { useStore } from "../src/stores/useStore";

let host: HTMLDivElement | undefined;

async function renderBanner(origin: PageOrigin): Promise<string> {
  useOrigin.setState({ origin });
  useStore.setState({
    ...useStore.getInitialState(),
    cityData: city({
      totalFiles: 3,
      totalLines: 90,
      // the fixture's three files are TypeScript, so the dependency audit has
      // nothing to open: "complete" is the verdict, not "depth unknown"
      scanProvenance: {
        regex: true,
        gitleaks: true,
        semgrep: true,
        ruff: true,
        dependencies: false,
      } as never,
    }),
    analysisId: "scan-1",
    buildPhase: "built",
    prefs: { ...useStore.getInitialState().prefs, lang: "en" },
  });
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ScanSummary demo={false} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const text = (host.textContent ?? "").replace(/\s+/g, " ").trim();
  await act(async () => root.unmount());
  host.remove();
  host = undefined;
  return text;
}

afterEach(() => {
  host?.remove();
  host = undefined;
});

describe("what a carried file may offer", () => {
  it("shows the test runner as unavailable, with the reason in the title", async () => {
    // Measured in the exported folder: the button was disabled but not struck,
    // because the strike asked a different question than the disable did.
    const { ActionBar } = await import("../src/components/ActionBar");
    useOrigin.setState({ origin: "file" });
    useStore.setState({
      ...useStore.getInitialState(),
      // repo.owner "local" = this scan came from a folder on this machine, the
      // only state in which the old strike was silent — exactly where the file
      // origin has to speak for itself.
      cityData: city({
        totalFiles: 3,
        totalLines: 90,
        repo: { owner: "local", name: "p", branch: "main" },
      }),
      analysisId: "scan-1",
      buildPhase: "built",
      prefs: { ...useStore.getInitialState().prefs, lang: "en" },
    });
    host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ActionBar />));
    const more = [...host.querySelectorAll("button")].find((b) => /More/.test(b.textContent ?? ""));
    await act(async () => more?.click());
    const item = [...host.querySelectorAll('[role="menuitem"]')].find((b) =>
      /Run tests/.test(b.textContent ?? ""),
    );
    expect(item, "the runner is listed, not hidden").toBeTruthy();
    expect((item as HTMLButtonElement).disabled).toBe(true);
    expect(item!.getAttribute("title")).toMatch(/no staged copy/i);
    expect((item as HTMLElement).style.textDecoration).toContain("line-through");
    await act(async () => root.unmount());
    host.remove();
    host = undefined;
  });
});

describe("the update check in a carried file", () => {
  it("answers 'could not check', not 'up to date'", async () => {
    // Measured: the click parsed the file server's 503 as a successful check
    // with no newer release, so the reader was told "up to date ()".
    const { ActionBar } = await import("../src/components/ActionBar");
    useOrigin.setState({ origin: "file" });
    useStore.setState({
      ...useStore.getInitialState(),
      cityData: city({
        totalFiles: 3,
        totalLines: 90,
        repo: { owner: "local", name: "p", branch: "main" },
      }),
      analysisId: "scan-1",
      buildPhase: "built",
      prefs: { ...useStore.getInitialState().prefs, lang: "en" },
    });
    const asked: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return new Response("{}", { status: 503 });
    }) as typeof fetch;
    host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ActionBar />));
    const more = [...host.querySelectorAll("button")].find((b) => /More/.test(b.textContent ?? ""));
    await act(async () => more?.click());
    const item = [...host.querySelectorAll('[role="menuitem"]')].find((b) =>
      /Check for updates/.test(b.textContent ?? ""),
    );
    await act(async () => {
      (item as HTMLButtonElement | undefined)?.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/Could not check for updates/);
    expect(text).not.toMatch(/up to date/i);
    expect(asked, "no question leaves a carried file").toEqual([]);
    globalThis.fetch = realFetch;
    await act(async () => root.unmount());
    host.remove();
    host = undefined;
  });
});

describe("the summary banner", () => {
  it("does not claim a scan ran inside a carried file", async () => {
    const text = await renderBanner("file");
    expect(text).toContain("Exported city");
    expect(text).not.toMatch(/Scan complete/);
    // and it is the strip, not a card with a countdown
    expect(text).not.toMatch(/closes in/);
    expect(text).not.toMatch(/hover to hold/);
  });

  it("still speaks of a scan on a live page", async () => {
    // The control: whatever a live page says about its scan, it must not be
    // the file sentence. (The exact headline depends on whether the project's
    // engines could all run — a second, unrelated claim this file does not own.)
    const text = await renderBanner("live");
    expect(text).not.toContain("Exported city");
    expect(text).toMatch(/Scan complete|scanners ran|No findings/);
  });
});
