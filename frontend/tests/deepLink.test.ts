import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  editorDeepLink,
  openDeepLink,
  setWorkspaceRoot,
  getWorkspaceRoot,
  setPreferredEditor,
  getPreferredEditor,
} from "../src/editor/deepLink";

// localStorage stub — vitest runs in the node environment
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
vi.stubGlobal("window", { localStorage: localStorageStub, open: vi.fn() });

beforeEach(() => {
  store.clear();
});

describe("workspace root persistence", () => {
  it("normalizes backslashes and trailing slashes", () => {
    setWorkspaceRoot("/Users/dev/my-project/");
    expect(getWorkspaceRoot()).toBe("/Users/dev/my-project");
    setWorkspaceRoot("C:\\repos\\demo");
    expect(getWorkspaceRoot()).toBe("C:/repos/demo");
  });

  it("persists the preferred editor", () => {
    expect(getPreferredEditor()).toBe("vscode"); // default
    setPreferredEditor("cursor");
    expect(getPreferredEditor()).toBe("cursor");
  });
});

describe("editorDeepLink", () => {
  beforeEach(() => {
    setWorkspaceRoot("/Users/dev/my-project");
    setPreferredEditor("vscode");
  });

  it("builds a vscode:// link with line number", () => {
    expect(editorDeepLink({ filePath: "src/a.ts", line: 42 })).toBe(
      "vscode://file//Users/dev/my-project/src/a.ts:42",
    );
  });

  it("includes the column when given", () => {
    expect(editorDeepLink({ filePath: "src/a.ts", line: 42, column: 7 })).toBe(
      "vscode://file//Users/dev/my-project/src/a.ts:42:7",
    );
  });

  it("builds cursor:// links for the cursor editor", () => {
    expect(editorDeepLink({ editor: "cursor", filePath: "src/a.ts" })).toBe(
      "cursor://file//Users/dev/my-project/src/a.ts",
    );
  });

  it("strips leading slashes from repo-relative paths", () => {
    expect(editorDeepLink({ filePath: "/src/a.ts" })).toBe(
      "vscode://file//Users/dev/my-project/src/a.ts",
    );
  });

  it("returns null without a configured root — never a broken link", () => {
    setWorkspaceRoot("");
    expect(editorDeepLink({ filePath: "src/a.ts" })).toBeNull();
  });

  it.each([
    ["hash", "src/a#b.ts", "src/a%23b.ts"],
    ["query", "src/a?b.ts", "src/a%3Fb.ts"],
    ["space and Unicode", "src/a b/ü.ts", "src/a%20b/%C3%BC.ts"],
    ["literal percent", "src/100%.ts", "src/100%25.ts"],
  ])("encodes a %s in the file path without losing the position", (_label, path, encoded) => {
    expect(editorDeepLink({ filePath: path, line: 42, column: 7 })).toBe(
      `vscode://file//Users/dev/my-project/${encoded}:42:7`,
    );
  });

  it("encodes reserved characters in the workspace root", () => {
    expect(
      editorDeepLink({ workspaceRoot: "/Users/dev/my project#1?", filePath: "src/a.ts", line: 9 }),
    ).toBe("vscode://file//Users/dev/my%20project%231%3F/src/a.ts:9");
  });

  it("keeps the Windows drive colon outside the encoded path", () => {
    expect(editorDeepLink({ workspaceRoot: "C:/repos/demo", filePath: "src/a.ts", line: 3 })).toBe(
      "vscode://file/C:/repos/demo/src/a.ts:3",
    );
  });

  it("passes the encoded path through the real editor handoff", () => {
    const link = editorDeepLink({ filePath: "src/a#b?c.ts", line: 12 });
    openDeepLink(link!);
    expect(window.open).toHaveBeenCalledWith(
      "vscode://file//Users/dev/my-project/src/a%23b%3Fc.ts:12",
      "_self",
    );
    const opened = vi.mocked(window.open).mock.calls[0]![0]!;
    const url = new URL(opened);
    expect(url.hash).toBe("");
    expect(url.search).toBe("");
    expect(decodeURIComponent(url.pathname)).toBe("//Users/dev/my-project/src/a#b?c.ts:12");
  });
});
