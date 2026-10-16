import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  corsOptionsFor,
  expectedOrigins,
  isForeignBrowserRequest,
  localOnlyRoute,
  refusalFor,
  uploadLimitAwareErrorHandler,
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

/**
 * The refusal is right in both cases; what was wrong is that it said the same
 * sentence to two different problems. A second checkout on this machine gets
 * `403 … came from another website` for having opened the app on 3011 — a
 * security story about a person who changed a port, while the answer
 * (`FRONTEND_ORIGIN`) sits in the same file that produced the message.
 */
describe("what a refused write says back", () => {
  const served = [OWN, "http://127.0.0.1:3010", "tauri://localhost"];

  it("names the setting when the page is this machine's, on another port", () => {
    const said = refusalFor("http://localhost:3011", served);
    expect(said).toContain("FRONTEND_ORIGIN=http://localhost:3011");
    expect(said, "the page it came from, as it was sent").toContain("http://localhost:3011");
    expect(said, "what the process does serve, so the two can be compared").toContain(OWN);
    expect(said).toContain("Ephemora Skyline only accepts its own page");
    expect(said, "no blame about another website when there is none").not.toContain(
      "another website",
    );
  });

  it("keeps the old sentence for a page that really is elsewhere", () => {
    const foreign =
      "This request came from another website — Ephemora Skyline only accepts its own page.";
    expect(refusalFor("http://evil.example", served)).toBe(foreign);
    expect(refusalFor("https://localhost.evil.example:3011", served)).toBe(foreign);
    expect(refusalFor(undefined, served), "a cross-site request without an origin").toBe(foreign);
  });

  it("does not echo an unbounded origin into the answer", () => {
    const long = `http://localhost:${"9".repeat(400)}`;
    expect(refusalFor(long, served).length).toBeLessThan(600);
  });

  /** The wording changed; the door did not. */
  it("still answers 403 and never calls next, whichever branch spoke", () => {
    for (const origin of ["http://localhost:3011", "http://evil.example"]) {
      let status = 0;
      let body: unknown = null;
      let passed = false;
      localOnlyRoute(
        { headers: { origin, "sec-fetch-site": "cross-site", host: "127.0.0.1:4000" } } as never,
        {
          status(code: number) {
            status = code;
            return {
              json(b: unknown) {
                body = b;
              },
            };
          },
        } as never,
        () => {
          passed = true;
        },
      );
      expect(status, origin).toBe(403);
      expect(passed, `${origin} must not reach the route`).toBe(false);
      expect((body as { error?: string }).error).toContain(
        "Ephemora Skyline only accepts its own page",
      );
    }
  });

  it("lets the app's own page through with no message at all", () => {
    let passed = false;
    localOnlyRoute(
      { headers: { origin: OWN, host: "127.0.0.1:4000" } } as never,
      { status: () => ({ json: () => undefined }) } as never,
      () => {
        passed = true;
      },
    );
    expect(passed).toBe(true);
  });
});

/**
 * A folder too big for the upload is a limit the user walked into, not a crash.
 * The shared error handler used to answer every error with `500 Internal server
 * error`, which made the wall look like a fault and left the page's own 413
 * sentence unreachable. Measured with a 212 MB body on the edge-state lane.
 */
describe("the body limit answers as what it is", () => {
  const fakeRes = () => {
    const seen = { status: 0, body: null as unknown };
    const res = {
      headersSent: false,
      status(code: number) {
        seen.status = code;
        return res;
      },
      json(body: unknown) {
        seen.body = body;
        return res;
      },
    };
    return { seen, res };
  };
  const handler = uploadLimitAwareErrorHandler({ error: () => {} });

  it("413 for the body parser's own error", () => {
    const { seen, res } = fakeRes();
    const err = Object.assign(new Error("request entity too large"), {
      type: "entity.too.large",
      status: 413,
    });
    handler(err, {} as never, res as never);
    expect(seen.status).toBe(413);
    expect((seen.body as { error: string }).error).toMatch(/exceeds/i);
  });

  it("still 500 for a real fault, and the sentence stays uninformative on purpose", () => {
    const { seen, res } = fakeRes();
    handler(new Error("connect ECONNREFUSED"), {} as never, res as never);
    expect(seen.status).toBe(500);
    expect(JSON.stringify(seen.body)).not.toContain("ECONNREFUSED");
  });
});

describe("every write route carries the origin guard", () => {
  it("leaves no app.post unguarded, and /api/verify is in the guarded set", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../src/server/index.ts"),
      "utf-8",
    );
    const everyPost = [...source.matchAll(/app\.post\(\s*"([^"]+)"/g)].map((m) => m[1]!);
    const guardedPost = [...source.matchAll(/app\.post\(\s*"([^"]+)",\s*localOnlyRoute/g)].map(
      (m) => m[1]!,
    );
    expect(everyPost, "a POST without the guard is a route another website can drive").toEqual(
      guardedPost,
    );
    // The one read-only POST: a body that names two scans still answers 403 to
    // a foreign page, exactly like the routes that run code.
    expect(guardedPost).toContain("/api/verify");
  });
});
