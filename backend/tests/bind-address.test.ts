import { describe, it, expect } from "vitest";
import { bindHost, isLoopbackHost } from "../src/server/bind-address.js";

/**
 * The default bind of the HTTP server.
 *
 * src/server/index.ts calls server.listen on import, so the rule lives in
 * bind-address.ts and is pinned here instead of by opening a socket. An
 * unhosted listen() binds every interface; this API is handed an arbitrary
 * folder and can be told to run that folder's own tests, with no
 * authentication in front of it.
 */
describe("bindHost", () => {
  it("defaults to loopback when HOST is unset", () => {
    expect(bindHost({})).toBe("127.0.0.1");
  });

  it("honours an explicit HOST", () => {
    expect(bindHost({ HOST: "0.0.0.0" })).toBe("0.0.0.0");
    expect(bindHost({ HOST: "::" })).toBe("::");
  });

  it("falls back to loopback on a blank or whitespace HOST", () => {
    // `HOST=` in a shell profile is an empty string, not an absent key —
    // binding to "" means "all interfaces" and must never be the accident.
    expect(bindHost({ HOST: "" })).toBe("127.0.0.1");
    expect(bindHost({ HOST: "   " })).toBe("127.0.0.1");
  });

  it("trims so a padded value still binds what was meant", () => {
    expect(bindHost({ HOST: " 127.0.0.1 " })).toBe("127.0.0.1");
  });

  it("reads the live process env by default", () => {
    const before = process.env.HOST;
    try {
      process.env.HOST = "192.168.1.10";
      expect(bindHost()).toBe("192.168.1.10");
    } finally {
      if (before === undefined) delete process.env.HOST;
      else process.env.HOST = before;
    }
  });
});

describe("isLoopbackHost", () => {
  it("recognises every spelling of this machine", () => {
    for (const host of ["127.0.0.1", "::1", "localhost", "LOCALHOST"]) {
      expect(isLoopbackHost(host)).toBe(true);
    }
  });

  it("recognises the bracketed and mapped forms real configs send", () => {
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::FFFF:0:1")).toBe(false); // not a loopback spelling
  });

  it("flags hosts that reach the network", () => {
    for (const host of ["0.0.0.0", "::", "192.168.1.10", "10.0.0.5", "0"]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });

  it("says the default bind is loopback", () => {
    expect(isLoopbackHost(bindHost({}))).toBe(true);
  });
});
