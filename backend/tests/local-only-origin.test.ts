import { describe, it, expect } from "vitest";
import {
  corsOptionsFor,
  expectedOrigins,
  isForeignBrowserRequest,
} from "../src/server/local-only.js";

/**
 * The API binds loopback, so nobody on the network can reach it. A browser on
 * this machine can still be *told* to reach it: any page the user visits may
 * send a POST to http://127.0.0.1:4000, and the analyse/test-run routes execute
 * code from whatever folder the request names. Those requests are not blocked
 * by CORS — CORS decides what a page may READ, not what it may send.
 *
 * What does distinguish such a request is that the browser announces it: an
 * `Origin` from another site, or `Sec-Fetch-Site: cross-site`. A command line
 * tool sends neither and stays allowed, because it is already on this machine.
 */
const OWN = "http://localhost:3010";

describe("a browser request for a route that runs code", () => {
  it("accepts the app's own page", () => {
    expect(isForeignBrowserRequest({ origin: OWN }, [OWN])).toBe(false);
  });

  it("accepts a non-browser client that names no origin", () => {
    expect(isForeignBrowserRequest({}, [OWN])).toBe(false);
  });

  it("rejects another website driving the local port", () => {
    expect(isForeignBrowserRequest({ origin: "http://evil.example" }, [OWN])).toBe(true);
  });

  /** The dev server, the packaged app and an explicit FRONTEND_ORIGIN can all be the caller */
  it("accepts every origin the process was configured to serve", () => {
    const allowed = [OWN, "http://127.0.0.1:3010", "tauri://localhost"];
    expect(isForeignBrowserRequest({ origin: "tauri://localhost" }, allowed)).toBe(false);
    expect(isForeignBrowserRequest({ origin: "null" }, allowed)).toBe(true);
  });

  /**
   * `null` is what a sandboxed iframe, a file:// page or a data: URL sends.
   * It cannot be matched against a configured origin, so it is foreign.
   */
  it("reads Sec-Fetch-Site when no origin is sent at all", () => {
    expect(isForeignBrowserRequest({ secFetchSite: "cross-site" }, [OWN])).toBe(true);
    expect(isForeignBrowserRequest({ secFetchSite: "none" }, [OWN])).toBe(false);
  });

  it("serves the dev origin plus the packaged ones without configuring anything", () => {
    expect(expectedOrigins({})).toContain("http://localhost:3010");
    expect(
      expectedOrigins({ FRONTEND_ORIGIN: "http://localhost:5173,https://app.example" }),
    ).toEqual([
      "http://localhost:5173",
      "https://app.example",
      "http://127.0.0.1:3010",
      "tauri://localhost",
    ]);
  });

  /**
   * When the API serves the built app itself there is no configured frontend
   * origin to match — the page comes from the same host and port as the API, and
   * refusing that would break the packaged app on the user's own machine.
   */
  it("accepts a page delivered by this very port", () => {
    expect(
      isForeignBrowserRequest({ origin: "http://127.0.0.1:4000", host: "127.0.0.1:4000" }, [OWN]),
    ).toBe(false);
    expect(
      isForeignBrowserRequest({ origin: "http://127.0.0.1:9999", host: "127.0.0.1:4000" }, [OWN]),
    ).toBe(true);
  });

  /**
   * `cors()` used to receive the raw `FRONTEND_ORIGIN` string while the guard
   * parsed it as a list: a second origin, the app opened on 127.0.0.1, or the
   * packaged app passed the guard and then got an `Access-Control-Allow-Origin`
   * the browser throws away. The request worked and looked broken.
   */
  it("answers CORS with the same list the guard admits", () => {
    const ask = (env: Record<string, string>, origin?: string): string | boolean | undefined => {
      let given: string | boolean | undefined;
      corsOptionsFor(env).origin(origin, (_e, v) => {
        given = v;
      });
      return given;
    };
    const env = { FRONTEND_ORIGIN: "http://localhost:5173,https://app.example" };
    expect(ask(env, "https://app.example"), "second origin in the list").toBe(
      "https://app.example",
    );
    expect(ask(env, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(ask(env, "http://127.0.0.1:3010"), "the loopback twin").toBe("http://127.0.0.1:3010");
    expect(ask(env, "tauri://localhost"), "the packaged app").toBe("tauri://localhost");
    expect(ask(env, "http://evil.example"), "a foreign page gets no header").toBe(false);
    expect(ask(env, undefined), "a non-browser client gets no header").toBe(false);
    expect(ask({}, OWN), "unset env still serves the dev page").toBe(OWN);
    expect(ask({ FRONTEND_ORIGIN: "  " }, OWN), "blank env falls back to the dev page").toBe(OWN);
  });
});
