// @vitest-environment jsdom
/**
 * The platform row: what each platform can take, and what one click does.
 *
 * The honest part is the point. No row may claim a preview, the tab has to open
 * on the click itself (a clipboard promise before it would lose the user
 * gesture), LinkedIn stays off while no public address exists, and nothing may
 * reach out over the network before the user clicks.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SharePlatforms } from "../src/share/Platforms";
import { buildIntent, PLATFORM_ORDER, X_TEXT_LIMIT } from "../src/share/intents";

const SHORT = "Mein Projekt als Stadt: 73 Dateien, 15.064 Zeilen Code.";
const LONG = "x".repeat(X_TEXT_LIMIT + 1);

let container: HTMLDivElement;
let root: Root;
let opened: string[];
let copied: string[];
let fetches: string[];

function mount(lang: "en" | "de", caption = SHORT): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SharePlatforms lang={lang} caption={caption} />));
}

function rows(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".share-platform"));
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button.share-copy"));
}

beforeEach(() => {
  opened = [];
  copied = [];
  fetches = [];
  container?.remove();

  vi.spyOn(window, "open").mockImplementation((url?: string | URL) => {
    opened.push(String(url));
    return {} as Window;
  });
  Object.defineProperty(window, "fetch", {
    value: (input: unknown) => {
      fetches.push(String(input));
      return Promise.reject(new Error("no request expected"));
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: (text: string) => Promise.resolve(copied.push(text)) as never },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  root?.unmount();
  container?.remove();
});

describe("what each platform can carry", () => {
  it("puts the whole caption into the X draft only while it fits 280 characters", () => {
    const fits = buildIntent("x", SHORT, "");
    expect(fits.url).toContain(encodeURIComponent(SHORT.slice(0, 20)));
    expect(fits.textPrefilled).toBe(true);

    const tooLong = buildIntent("x", LONG, "");
    expect(tooLong.url).toBe("https://twitter.com/compose/tweet");
    expect(tooLong.textPrefilled).toBe(false);
    expect(tooLong.available).toBe(true);
  });

  it("hands Reddit the first line as a title, and says when it had to cut", () => {
    const twoLines = buildIntent("reddit", "Erste Zeile.\nZweite Zeile.", "");
    expect(twoLines.url).toBe(
      `https://www.reddit.com/submit?title=${encodeURIComponent("Erste Zeile.")}`,
    );
    expect(twoLines.textPrefilled).toBe(true);

    const cut = buildIntent("reddit", "y".repeat(400), "");
    expect(cut.textPrefilled).toBe(false);
    expect(cut.url).toContain("title=y".length > 0 ? "title=y" : "title=");
    expect(decodeURIComponent(cut.url.split("title=")[1]!).length).toBeLessThanOrEqual(300);
  });

  it("names Instagram honestly: a site to open, no draft", () => {
    const ig = buildIntent("instagram", SHORT, "");
    expect(ig.url).toBe("https://www.instagram.com/");
    expect(ig.textPrefilled).toBe(false);
    expect(ig.available).toBe(true);
  });

  it("keeps LinkedIn off while no public address is set, and on the address when there is one", () => {
    const off = buildIntent("linkedin", SHORT, "");
    expect(off.available).toBe(false);
    expect(off.textPrefilled).toBe(false);

    const on = buildIntent("linkedin", SHORT, "https://example.invalid/city");
    expect(on.available).toBe(true);
    expect(on.url).toContain(encodeURIComponent("https://example.invalid/city"));
  });
});

describe("the row in the studio", () => {
  it("shows four rows in the order the operator set", () => {
    mount("de");
    expect(rows().length).toBe(4);
    expect(PLATFORM_ORDER).toEqual(["instagram", "reddit", "x", "linkedin"]);
    expect(rows().map((r) => r.querySelector(".share-platform-name")?.textContent)).toEqual([
      "Instagram",
      "Reddit",
      "X",
      "LinkedIn",
    ]);
  });

  it("gives LinkedIn no button and one reason instead", () => {
    mount("de");
    expect(buttons().length).toBe(3);
    const linkedin = rows()[3]!;
    expect(linkedin.className).toContain("is-off");
    expect(linkedin.querySelector("button")).toBeNull();
    expect(linkedin.textContent).toContain("öffentliche Adresse");
  });

  it("says in one line that no preview comes from a local file", () => {
    mount("de");
    const note = container.querySelector(".share-platforms .share-subtle")?.textContent ?? "";
    expect(note).toContain("bleibt auf diesem Rechner");
    expect(note).toContain("Vorschau");
    expect(note).toContain("lokalen Datei");
    // No row may promise what the platforms cannot do.
    expect(note.toLowerCase()).not.toContain("preview of your image");
  });

  it("opens the tab on the click and carries the text by clipboard", async () => {
    mount("de");
    // Rows are Instagram, Reddit, X, LinkedIn — the third row is X, and only
    // three of the four rows have a button at all.
    const xButton = rows()[2]!.querySelector<HTMLButtonElement>("button");
    expect(xButton).not.toBeNull();
    await act(async () => {
      xButton!.click();
    });
    expect(opened).toEqual([expect.stringContaining("twitter.com")]);
    expect(copied).toEqual([SHORT]);
    // The announcement names the platform, which only happens when the
    // dictionary variable was substituted rather than printed.
    expect(container.textContent).toContain("X geöffnet");
    expect(container.textContent).not.toContain("{name}");
  });

  it("makes no network request before or because of the click", async () => {
    mount("en");
    expect(fetches).toEqual([]);
    await act(async () => {
      buttons()[0]!.click();
    });
    expect(fetches).toEqual([]);
    expect(opened.length).toBe(1);
  });

  it("keeps both languages, and leaks no dictionary key onto the screen", () => {
    mount("de");
    const deText = container.textContent ?? "";
    expect(deText).not.toMatch(/share\.platform/);
    expect(deText).toContain("Selbst posten");
    root.unmount();
    container.remove();

    mount("en");
    const enText = container.textContent ?? "";
    expect(enText).not.toMatch(/share\.platform/);
    expect(enText).toContain("Post it yourself");
    expect(enText).not.toBe(deText);
  });
});
