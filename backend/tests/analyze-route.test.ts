import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../src/server/routes/analyze.js";

describe("parseGitHubUrl", () => {
  it("accepts canonical https URLs", () => {
    expect(parseGitHubUrl("https://github.com/expressjs/express")).toEqual({
      owner: "expressjs",
      name: "express",
    });
  });

  it("accepts .git suffix, tree paths and trailing slashes", () => {
    expect(parseGitHubUrl("https://github.com/axios/axios.git")).toEqual({
      owner: "axios",
      name: "axios",
    });
    expect(parseGitHubUrl("https://github.com/axios/axios/tree/v1.x")).toEqual({
      owner: "axios",
      name: "axios",
    });
    expect(parseGitHubUrl("https://github.com/axios/axios/")).toEqual({
      owner: "axios",
      name: "axios",
    });
  });

  it("accepts the git@github.com SSH form", () => {
    expect(parseGitHubUrl("git@github.com:expressjs/express.git")).toEqual({
      owner: "expressjs",
      name: "express",
    });
  });

  it("rejects lookalike hosts and embedded github.com", () => {
    // The old `url.includes('github.com')` check accepted all of these
    expect(parseGitHubUrl("https://evil.com/?x=github.com")).toBeNull();
    expect(parseGitHubUrl("https://github.com.evil.com/a/b")).toBeNull();
    expect(parseGitHubUrl("http://github.com/a/b")).toBeNull(); // no plaintext http
    expect(parseGitHubUrl("https://gitlab.com/a/b")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseGitHubUrl("")).toBeNull();
    expect(parseGitHubUrl("not a url")).toBeNull();
    expect(parseGitHubUrl("https://github.com/only-owner")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/<script>")).toBeNull();
  });
});
