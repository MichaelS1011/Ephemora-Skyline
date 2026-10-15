// @vitest-environment jsdom
// Native navigation has no deadline; the escape hatch requires a fresh click.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalAnalysis } from "../src/hooks/useLocalAnalysis";
import { Landing } from "../src/components/Landing";
import { useStore } from "../src/stores/useStore";
import { t, type Lang } from "../src/i18n";

type HookValue = ReturnType<typeof useLocalAnalysis>;
let host: HTMLDivElement;
let root: Root;
let latest: HookValue;
let mounted: boolean;
let uploads: { name: string; files: unknown[] }[];
let inputClicks: ReturnType<typeof vi.spyOn>;

function deferred() {
  let resolve!: (dir: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fakeFile(name = "a.ts"): File {
  return {
    name,
    size: 13,
    webkitRelativePath: `fallback-repo/${name}`,
    text: async () => "const x = 1;\n",
    arrayBuffer: async () => new TextEncoder().encode("const x = 1;\n").buffer,
  } as File;
}

function fakeDir(name = "native-repo") {
  return {
    name,
    values: vi.fn(async function* () {
      yield { kind: "file", name: "a.ts", getFile: async () => fakeFile() };
    }),
  };
}

function fallbackInputs(): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll<HTMLInputElement>("input[webkitdirectory]");
}

function button(label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.trim() === label);
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function start(): Promise<void> {
  await act(async () => {
    void latest.pickFolder();
  });
}

async function chooseFallback(): Promise<void> {
  const input = fallbackInputs()[0]!;
  Object.defineProperty(input, "files", { value: [fakeFile()] });
  await act(async () => {
    input.dispatchEvent(new Event("change"));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  localStorage.clear();
  uploads = [];
  useStore.setState({
    ...useStore.getInitialState(),
    prefs: { ...useStore.getInitialState().prefs, lang: "en", updateCheck: false },
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === "/api/analyze-local") uploads.push(JSON.parse(String(init?.body)));
    return {
      ok: true,
      status: 202,
      json: async () =>
        url === "/api/footprint"
          ? { root: "/tmp/skyline", copies: 0, bytes: 0, stale: 0, ttlHours: 24 }
          : { id: "job-picker", status: "analyzing" },
    };
  });
  vi.stubGlobal("showDirectoryPicker", () => new Promise(() => {}));
  inputClicks = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  function Probe(): ReactElement | null {
    latest = useLocalAnalysis();
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  mounted = true;
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  host.remove();
  fallbackInputs().forEach((el) => el.remove());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native navigation is not timed out", () => {
  it.each([1_000, 5_000, 30_000])("accepts a valid handle after %i ms exactly once", async (ms) => {
    const native = deferred();
    const dir = fakeDir();
    vi.stubGlobal("showDirectoryPicker", () => native.promise);
    await start();
    await advance(ms);
    await act(async () => {
      native.resolve(dir);
    });
    expect(uploads.map((u) => u.name)).toEqual(["native-repo"]);
    expect(dir.values).toHaveBeenCalledOnce();
    expect(inputClicks).not.toHaveBeenCalled();
    expect(latest.canUseAlternativePicker).toBe(false);
    expect(latest.notice).toBe("");
    expect(latest.state).toBe("analyzing");
  });

  it("offers an escape for a hang without opening another dialog", async () => {
    await start();
    await advance(3_000);
    expect(latest.canUseAlternativePicker).toBe(false);
    await advance(1_500);
    expect(inputClicks).not.toHaveBeenCalled();
    expect(fallbackInputs()).toHaveLength(0);
    expect(latest.canUseAlternativePicker).toBe(true);
    expect(latest.notice).toBe(t("en", "scan.pickerTimeout"));
    await act(async () => {
      void latest.openAlternativePicker();
    });
    expect(inputClicks).toHaveBeenCalledOnce();
    expect(fallbackInputs()).toHaveLength(1);
    expect(latest.canUseAlternativePicker).toBe(false);
    await chooseFallback();
    expect(uploads.map((u) => u.name)).toEqual(["fallback-repo"]);
  });

  it("ignores an alternative action before it is offered", async () => {
    await start();
    await act(async () => {
      void latest.openAlternativePicker();
    });
    expect(inputClicks).not.toHaveBeenCalled();
  });

  it("reports a folder read failure without launching another picker", async () => {
    vi.stubGlobal("showDirectoryPicker", async () => ({
      name: "unreadable",
      values: () => {
        throw new Error("directory access lost");
      },
    }));
    await act(async () => {
      await expect(latest.pickFolder()).resolves.toBeUndefined();
    });
    expect(latest.state).toBe("error");
    expect(latest.errorMessage).toBe(t("en", "scan.pickerReadFailed"));
    expect(latest.errorDetail).toBe("directory access lost");
    expect(inputClicks).not.toHaveBeenCalled();
    expect(latest.canUseAlternativePicker).toBe(false);
  });

  it("guards two start calls in the same event turn", async () => {
    const picker = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("showDirectoryPicker", picker);
    await act(async () => {
      void latest.pickFolder();
      void latest.pickFolder();
    });
    expect(picker).toHaveBeenCalledOnce();
  });
});

describe("selection identity and cleanup", () => {
  it.each(["resolve", "reject"] as const)(
    "ignores a native %s after switching to the input",
    async (outcome) => {
      const native = deferred();
      const dir = fakeDir("stale-repo");
      vi.stubGlobal("showDirectoryPicker", () => native.promise);
      await start();
      await advance(4_500);
      await act(async () => {
        void latest.openAlternativePicker();
      });
      await act(async () => {
        if (outcome === "resolve") native.resolve(dir);
        else native.reject(new DOMException("cancelled", "AbortError"));
      });
      expect(latest.isPicking).toBe(true);
      expect(fallbackInputs()).toHaveLength(1);
      expect(dir.values).not.toHaveBeenCalled();
      await chooseFallback();
      expect(uploads.map((u) => u.name)).toEqual(["fallback-repo"]);
      expect(inputClicks).toHaveBeenCalledOnce();
    },
  );

  it("consumes an alternative click and input change only once", async () => {
    await start();
    await advance(4_500);
    await act(async () => {
      void latest.openAlternativePicker();
      void latest.openAlternativePicker();
    });
    expect(inputClicks).toHaveBeenCalledOnce();
    const input = fallbackInputs()[0]!;
    const oldChange = input.onchange!;
    Object.defineProperty(input, "files", { value: [fakeFile()] });
    await act(async () => {
      oldChange.call(input, new Event("change"));
      oldChange.call(input, new Event("change"));
    });
    expect(uploads).toHaveLength(1);
    expect(input.onchange).toBeNull();
    expect(input.oncancel).toBeNull();
    expect(fallbackInputs()).toHaveLength(0);
  });

  it("cancel before the offer clears its timer and ignores a late handle", async () => {
    const native = deferred();
    const dir = fakeDir();
    vi.stubGlobal("showDirectoryPicker", () => native.promise);
    await start();
    await advance(1_000);
    act(() => latest.cancel());
    expect(vi.getTimerCount()).toBe(0);
    await advance(30_000);
    await act(async () => {
      native.resolve(dir);
    });
    expect(latest.state).toBe("idle");
    expect(latest.canUseAlternativePicker).toBe(false);
    expect(latest.notice).toBe(t("en", "scan.cancelled"));
    expect(inputClicks).not.toHaveBeenCalled();
    expect(dir.values).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it.each(["resolve", "AbortError", "SecurityError"])(
    "an old %s cannot affect a new attempt or its offer timer",
    async (outcome) => {
      const old = deferred();
      const next = deferred();
      const staleDir = fakeDir("stale-repo");
      vi.stubGlobal(
        "showDirectoryPicker",
        vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise),
      );
      await start();
      act(() => latest.cancel());
      await start();
      await act(async () => {
        if (outcome === "resolve") old.resolve(staleDir);
        else old.reject(new DOMException("old picker", outcome));
      });
      expect(latest.isPicking).toBe(true);
      expect(latest.notice).toBe("");
      await advance(4_500);
      expect(latest.canUseAlternativePicker).toBe(true);
      expect(inputClicks).not.toHaveBeenCalled();
      await act(async () => {
        next.resolve(fakeDir("new-repo"));
      });
      expect(uploads.map((u) => u.name)).toEqual(["new-repo"]);
      expect(staleDir.values).not.toHaveBeenCalled();
      expect(latest.state).toBe("analyzing");
    },
  );

  it("reset retires a pending native attempt before restarting", async () => {
    const native = deferred();
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn().mockReturnValueOnce(native.promise).mockResolvedValueOnce(fakeDir("new-repo")),
    );
    await start();
    await act(async () => {
      latest.reset();
      void latest.pickFolder();
    });
    await act(async () => {
      native.resolve(fakeDir("old-repo"));
    });
    expect(uploads.map((u) => u.name)).toEqual(["new-repo"]);
    expect(latest.notice).toBe("");
  });

  it.each(["cancel", "unmount", "reset"] as const)(
    "%s detaches the input and makes captured handlers inert",
    async (action) => {
      vi.stubGlobal("showDirectoryPicker", undefined);
      await start();
      const input = fallbackInputs()[0]!;
      const oldChange = input.onchange!;
      const oldCancel = input.oncancel!;
      Object.defineProperty(input, "files", { value: [fakeFile()] });
      act(() => {
        if (action === "unmount") {
          root.unmount();
          mounted = false;
        } else latest[action]();
      });
      expect(input.onchange).toBeNull();
      expect(input.oncancel).toBeNull();
      expect(fallbackInputs()).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => {
        oldChange.call(input, new Event("change"));
        oldCancel.call(input, new Event("cancel"));
      });
      expect(uploads).toHaveLength(0);
    },
  );

  it("unmount clears the native offer timer and ignores later completion", async () => {
    const native = deferred();
    const dir = fakeDir();
    vi.stubGlobal("showDirectoryPicker", () => native.promise);
    await start();
    act(() => {
      root.unmount();
      mounted = false;
    });
    expect(vi.getTimerCount()).toBe(0);
    await advance(30_000);
    await act(async () => {
      native.resolve(dir);
    });
    expect(inputClicks).not.toHaveBeenCalled();
    expect(dir.values).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });
});

describe("cancel and immediate rejection", () => {
  it("native cancellation after a long wait removes the alternative offer", async () => {
    const native = deferred();
    vi.stubGlobal("showDirectoryPicker", () => native.promise);
    await start();
    await advance(30_000);
    expect(latest.canUseAlternativePicker).toBe(true);
    await act(async () => {
      native.reject(new DOMException("cancelled", "AbortError"));
    });
    expect(latest.state).toBe("idle");
    expect(latest.notice).toBe("");
    expect(latest.canUseAlternativePicker).toBe(false);
    expect(inputClicks).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])("AbortError (synchronous=%s) cancels without fallback", async (sync) => {
    const error = new DOMException("cancelled", "AbortError");
    vi.stubGlobal("showDirectoryPicker", () => {
      if (sync) throw error;
      return Promise.reject(error);
    });
    await start();
    await advance(10_000);
    expect(latest.state).toBe("idle");
    expect(latest.notice).toBe("");
    expect(latest.canUseAlternativePicker).toBe(false);
    expect(inputClicks).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])(
    "SecurityError (synchronous=%s) offers a fresh click, not an automatic dialog",
    async (sync) => {
      const error = new DOMException("restricted", "SecurityError");
      vi.stubGlobal("showDirectoryPicker", () => {
        if (sync) throw error;
        return Promise.reject(error);
      });
      await start();
      expect(inputClicks).not.toHaveBeenCalled();
      expect(latest.canUseAlternativePicker).toBe(true);
      expect(latest.notice).toBe(t("en", "scan.pickerUnavailable"));
      await act(async () => {
        void latest.openAlternativePicker();
      });
      await chooseFallback();
      expect(uploads).toHaveLength(1);
    },
  );

  it.each(["cancel", "change"])(
    "input %s without files is cancellation, not an error",
    async (event) => {
      vi.stubGlobal("showDirectoryPicker", undefined);
      await start();
      expect(inputClicks).toHaveBeenCalledOnce();
      await act(async () => {
        fallbackInputs()[0]!.dispatchEvent(new Event(event));
      });
      expect(latest.state).toBe("idle");
      expect(latest.notice).toBe("");
      expect(fallbackInputs()).toHaveLength(0);
      expect(uploads).toHaveLength(0);
    },
  );
});

describe("Landing exposes real accessible controls while picking", () => {
  it.each(["en", "de"] as const)(
    "shows cancel immediately and a click-only alternative in %s",
    async (lang: Lang) => {
      act(() => {
        useStore.setState({ prefs: { ...useStore.getState().prefs, lang } });
        root.render(createElement(Landing));
      });
      const primary = button(t(lang, "landing.primary"))!;
      await act(async () => {
        primary.click();
      });
      expect(primary.disabled).toBe(true);
      expect(primary.getAttribute("aria-busy")).toBe("true");
      expect(button(t(lang, "landing.cancel"))?.disabled).toBe(false);
      expect(host.querySelector(".start-progress")).toBeNull();
      expect(host.textContent).toContain(t(lang, "picker.waiting"));
      await advance(4_500);
      const alternative = button(
        lang === "de" ? "Alternativen Ordnerdialog öffnen" : "Open alternative folder dialog",
      );
      expect(alternative).toBeDefined();
      expect(alternative?.disabled).toBe(false);
      expect(alternative?.type).toBe("button");
      const description = document.getElementById(alternative!.getAttribute("aria-describedby")!);
      expect(description?.getAttribute("role")).toBe("status");
      expect(description?.textContent).toContain(t(lang, "scan.pickerTimeout"));
      expect(description?.closest('[aria-busy="true"]')).toBeNull();
      expect(inputClicks).not.toHaveBeenCalled();
      act(() => {
        alternative!.click();
      });
      expect(inputClicks).toHaveBeenCalledOnce();
      expect(button(t(lang, "picker.alternative"))).toBeUndefined();
      await act(async () => {
        button(t(lang, "landing.cancel"))!.click();
      });
      expect(fallbackInputs()).toHaveLength(0);
    },
  );

  it("cancel before four seconds never reveals a delayed escape control", async () => {
    act(() => {
      root.render(createElement(Landing));
    });
    await act(async () => {
      button(t("en", "landing.primary"))!.click();
    });
    await advance(1_000);
    await act(async () => {
      button(t("en", "landing.cancel"))!.click();
    });
    await advance(30_000);
    expect(button(t("en", "picker.alternative"))).toBeUndefined();
    expect(button(t("en", "landing.primary"))?.disabled).toBe(false);
    expect(inputClicks).not.toHaveBeenCalled();
  });
});
