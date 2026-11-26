// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import { useOrigin } from "../src/stores/useOrigin";
import { t } from "../src/i18n";
import { RELEASES_URL } from "../src/demo/hosted";
import { city } from "./helpers/cityFixture";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubEnv("VITE_HOSTED_DEMO", "1");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  localStorage.clear();
  useOrigin.setState({ origin: "live" });
  useStore.setState({
    cityData: city({ analysisId: "demo-001" }),
    analysisId: "demo-001",
    buildPhase: "built",
    firstRun: false,
    prefs: { ...useStore.getState().prefs, lang: "en", updateCheck: true },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(ActionBar)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hosted city menu", () => {
  it("hides backend actions and names the local-installation alternative", () => {
    const more = host.querySelector<HTMLButtonElement>("#city-more-button");
    expect(more).not.toBeNull();
    act(() => more!.click());

    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.textContent).not.toContain(t("en", "actions.exportSarif"));
    expect(menu.textContent).not.toContain(t("en", "actions.exportHandoff"));
    expect(menu.textContent).not.toContain(t("en", "actions.runTests"));
    expect(menu.textContent).not.toContain(t("en", "update.check"));
    expect(menu.textContent).toContain(t("en", "actions.hostedBackendNote"));
    expect(menu.querySelector('a[href^="/api"]')).toBeNull();
  });

  it("keeps the release destination in the menu's keyboard order", () => {
    act(() => host.querySelector<HTMLButtonElement>("#city-more-button")!.click());
    const menu = host.querySelector('[role="menu"]')!;
    const release = menu.querySelector<HTMLAnchorElement>(`a[href="${RELEASES_URL}"]`);
    expect(release).not.toBeNull();
    expect(release?.getAttribute("role")).toBe("menuitem");
    expect(release?.target).toBe("_blank");
    expect(release?.rel).toBe("noreferrer");

    const last = menu
      .querySelectorAll<HTMLElement>('button:not([disabled]), [role="menuitem"]')
      .item(menu.querySelectorAll('button:not([disabled]), [role="menuitem"]').length - 1);
    act(() => {
      last.focus();
      last.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(document.activeElement).toBe(release);

    act(() => {
      release!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement).not.toBe(release);
  });

  it("activates the release destination with Space like other menu items", () => {
    act(() => host.querySelector<HTMLButtonElement>("#city-more-button")!.click());
    const release = host.querySelector<HTMLAnchorElement>(`a[href="${RELEASES_URL}"]`)!;
    const activate = vi.spyOn(release, "click").mockImplementation(() => {});
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });

    act(() => release.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("copies the static demo link without asking /api/health", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    act(() => host.querySelector<HTMLButtonElement>("#city-more-button")!.click());
    const copy = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) =>
      button.textContent?.includes(t("en", "actions.copyLink")),
    );
    expect(copy).toBeDefined();

    await act(async () => {
      copy!.click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.textContent).toContain(t("en", "actions.linkCopiedHosted"));
  });

  it("keeps the local menu contract in the counter-case", () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "0");
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(createElement(ActionBar)));
    act(() => host.querySelector<HTMLButtonElement>("#city-more-button")!.click());

    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain(t("en", "actions.exportSarif"));
    expect(menu.textContent).toContain(t("en", "actions.exportHandoff"));
    expect(menu.textContent).toContain(t("en", "update.check"));
  });
});
