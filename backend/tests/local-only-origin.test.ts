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

  it("does not mistake a rebound foreign host for this port", () => {
    // DNS rebinding makes Origin and Host agree on the attacker's own name;
    // only a loopback Host proves the page is this app on this machine.
    expect(
      isForeignBrowserRequest({ origin: "http://evil.example:4000", host: "evil.example:4000" }, [
        OWN,
      ]),
    ).toBe(true);
    expect(
      isForeignBrowserRequest(
        { origin: "http://localhost.evil.example:4000", host: "localhost.evil.example:4000" },
        [OWN],
      ),
    ).toBe(true);
    expect(
      isForeignBrowserRequest({ origin: "http://localhost:4000", host: "localhost:4000" }, [OWN]),
    ).toBe(false);
    expect(
      isForeignBrowserRequest({ origin: "http://[::1]:4000", host: "[::1]:4000" }, [OWN]),
    ).toBe(false);
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

describe("the four machine-describing GET routes carry the origin guard", () => {
  /**
   * edge-state Welle 2: /api/demo, /api/rule-packs and /api/footprint answered a
   * foreign page with no guard at all; /api/cities/default followed as the last
   * unguarded route. CORS already stops the read, but "top" means no exception
   * without a reason — the guard answers a browser page from elsewhere and
   * still lets a no-Origin client through (the CLI contract in docs/AGENTS.md,
   * pinned above by `isForeignBrowserRequest({}, ...)`).
   */
  const source = readFileSync(path.resolve(import.meta.dirname, "../src/server/index.ts"), "utf-8");

  const guardedGet = (pathname: string): boolean => {
    const needle = `"${pathname}"`;
    let from = 0;
    for (;;) {
      const routeAt = source.indexOf("app.get(", from);
      if (routeAt === -1) return false;
      const pathAt = source.indexOf(needle, routeAt);
      if (pathAt !== -1 && pathAt - routeAt < 60) {
        const bodyStart = source.indexOf("{", pathAt + needle.length);
        return source.slice(pathAt + needle.length, bodyStart).includes("localOnlyRoute");
      }
      from = routeAt + 8;
    }
  };

  it("guards /api/demo, /api/cities/default, /api/rule-packs and /api/footprint", () => {
    for (const route of ["/api/demo", "/api/cities/default", "/api/rule-packs", "/api/footprint"]) {
      expect(guardedGet(route), `${route} must carry localOnlyRoute`).toBe(true);
    }
  });
});

/**
 * A count printed in a public document is a claim about `index.ts`, not about the
 * other documents. SECURITY.md named ten acting routes while README.md and
 * docs/API.md still said nine and left the tenth out of the list they enumerate —
 * `POST /api/analyze-local/:id/live`, the route that folds a live delta into a
 * finished scan. The tally below is therefore measured from the source, and each
 * document must state the same numbers and name every route it counts.
 */
describe("the guard counts the public documents state", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "../src/server/index.ts"), "utf-8");

  /** One registration = `app.<method>("<path>", localOnlyRoute, …)`, import excluded. */
  const registrations = [
    ...source.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*,\s*localOnlyRoute/g),
  ];
  const acting = registrations.filter((m) => m[1] !== "get").map((m) => m[2]!);
  const reading = registrations.filter((m) => m[1] === "get").map((m) => m[2]!);

  const spelled = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ];

  /** The sentence piece that carries a count: the text right before the anchor. */
  const clauseBefore = (text: string, anchor: string): string | null => {
    const line = text.split("\n").find((l) => l.includes(anchor));
    if (!line) return null;
    const parts = line.slice(0, line.indexOf(anchor)).split(/[.;:]\s|\s+—\s+/);
    return parts[parts.length - 1] ?? null;
  };

  /** Numbers a clause spells out — a digit is not a spelled count. */
  const numbersIn = (clause: string): string[] =>
    (clause.match(/[A-Za-z]+/g) ?? [])
      .map((word) => word.toLowerCase())
      .filter((word) => spelled.includes(word));

  /** The routes a clause enumerates after its anchor, as written items. */
  const itemsAfter = (text: string, anchor: string): string[] => {
    const line = text.split("\n").find((l) => l.includes(anchor));
    if (!line) return [];
    const rest = line.slice(line.indexOf(anchor) + anchor.length).replace(/^[\s:*—(]+/, "");
    const stop = rest.search(/\s+—\s+|\)|\.\s|\.$/);
    return (stop === -1 ? rest : rest.slice(0, stop))
      .split(",")
      .map((item) => item.replace(/^(and|or)\s+/i, "").trim())
      .filter(Boolean);
  };

  it("registers fifteen guarded routes: ten acting, five reading", () => {
    expect(registrations.length).toBe(15);
    expect(acting.length).toBe(10);
    expect(reading.length).toBe(5);
    /**
     * Every mention of the guard is one registration plus the import line. A route
     * wired in a shape this tally misses would change the mention count instead and
     * fail here, rather than dropping out of the published number unnoticed.
     */
    expect((source.match(/localOnlyRoute/g) ?? []).length, "guard mentions in index.ts").toBe(
      registrations.length + 1,
    );
    expect(acting, "the live-delta route is one of the ten").toContain(
      "/api/analyze-local/:id/live",
    );
  });

  for (const doc of ["README.md", "docs/API.md", "SECURITY.md"]) {
    it(`${doc} says ten acting and five reading, as the source does`, () => {
      const text = readFileSync(path.resolve(import.meta.dirname, "../..", doc), "utf-8");
      const claims: [string, string, number][] = [
        ["the guarded total", "carry the origin guard", registrations.length],
        ["the acting routes", "beyond answering a question", acting.length],
        ["the reads", "of the local program", reading.length],
      ];
      for (const [what, anchor, count] of claims) {
        const clause = clauseBefore(text, anchor);
        expect(clause, `${doc} no longer states ${what} in words`).not.toBeNull();
        expect(
          numbersIn(clause!),
          `${doc}: ${what} is spelled "${numbersIn(clause!).join("/")}", source says ${spelled[count]}`,
        ).toEqual([spelled[count]]);
      }
      const acts = itemsAfter(text, "beyond answering a question");
      expect(acts, `${doc}: the acting list must name all ${acting.length} routes`).toHaveLength(
        acting.length,
      );
      expect(
        acts.join(", "),
        `${doc}: the live delta is an acting route, so its list names it`,
      ).toMatch(/live delta/);
      expect(
        itemsAfter(text, "of the local program"),
        `${doc}: the read list must name all ${reading.length} routes`,
      ).toHaveLength(reading.length);
    });
  }
});
