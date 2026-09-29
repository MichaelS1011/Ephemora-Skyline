import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  editorDeepLink,
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
});
