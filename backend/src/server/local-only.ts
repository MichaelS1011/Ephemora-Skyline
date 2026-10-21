import type { NextFunction, Request, Response } from "express";

/**
 * Local-only guard for the routes that run code.
 *
 * The server binds loopback (see bind-address.ts), so the network is not the
 * way in — a browser is. Any page the user visits can send a POST to
 * 127.0.0.1:4000, and CORS does not stop that: CORS decides what a page may
 * read back, not what it may send. Two routes react to such a request by
 * staging a folder and executing that folder's own test suite.
 *
 * A browser announces where a request came from. `Origin` is present for every
 * cross-origin write, and `Sec-Fetch-Site` says `cross-site` even when a
 * request is sent without one (a plain form post). A command line client on
 * this machine sends neither, and stays allowed.
 */
/** Loopback names, with and without the brackets an IPv6 Host header carries. */
function isLoopbackName(host: string): boolean {
  try {
    const name = new URL(`http://${host}`).hostname
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();
    return name === "localhost" || name === "127.0.0.1" || name === "::1";
  } catch {
    return false;
  }
}

export function isForeignBrowserRequest(
  headers: { origin?: string; secFetchSite?: string; host?: string },
  expected: string[],
): boolean {
  if (headers.origin !== undefined) {
    if (expected.includes(headers.origin)) return false;
    // A page served by this very port is the app itself, even when nothing was
    // configured — refusing it would break the packaged app on its own machine.
    // The host must still be a loopback name: a foreign page that has rebound
    // its own DNS to 127.0.0.1 sends this exact pair (Origin and Host both
    // `evil.example:4000`), and trusting the pair alone would hand it the
    // routes that run a folder's tests.
    try {
      if (
        headers.host &&
        new URL(headers.origin).host === headers.host &&
        isLoopbackName(headers.host)
      )
        return false;
    } catch {
      // an origin that does not parse cannot be the app's own page
    }
    return true;
  }
  // "null" is a sandboxed iframe, a file:// page or a data: URL: it can never
  // match a configured origin, so it is treated as foreign rather than unknown
  if (headers.secFetchSite === "cross-site") return true;
  return false;
}

/** The origins this process is meant to serve: dev server, packaged app, explicit env */
export function expectedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.FRONTEND_ORIGIN?.trim() || "http://localhost:3010")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...configured, "http://127.0.0.1:3010", "tauri://localhost"];
}

/**
 * CORS answers to exactly the origins the guard admits.
 *
 * Handing `cors()` the raw `FRONTEND_ORIGIN` string made the two disagree: the
 * guard reads a comma-separated list, CORS compared one string. A second
 * origin, the app opened on `127.0.0.1`, or the packaged app's own scheme then
 * passed the guard and got an `Access-Control-Allow-Origin` the browser rejects
 * — a request that works and reads as broken, with nothing logged.
 */
export function corsOptionsFor(env: NodeJS.ProcessEnv = process.env) {
  const allowed = new Set(expectedOrigins(env));
  return {
    credentials: true,
    origin(
      origin: string | undefined,
      cb: (err: Error | null, allow?: string | boolean) => void,
    ): void {
      // no Origin header at all is not a browser cross-origin read
      cb(null, origin !== undefined && allowed.has(origin) ? origin : false);
    },
  };
}

/** A loopback name on any port: only a browser on this machine can say it. */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * What a refused write says back.
 *
 * For a page from elsewhere the sentence stays exactly what it was. For a
 * loopback origin that is simply not on the served list — the app opened on
 * another port, which is what Vite does on its own the moment 3010 is busy —
 * the old wording sent a person hunting for a security problem they did not
 * have. Measured on a second checkout: every upload answered
 * `403 This request came from another website`, and the answer was the
 * `FRONTEND_ORIGIN` the same file already reads.
 */
export function refusalFor(origin: string | undefined, served: string[]): string {
  const foreign =
    "This request came from another website — Ephemora Skyline only accepts its own page.";
  if (!origin || !isLoopbackOrigin(origin)) return foreign;
  const page = origin.length > 200 ? `${origin.slice(0, 200)}…` : origin;
  return (
    `Ephemora Skyline only accepts its own page, and this process was not told to serve the one you opened. ` +
    `The request came from ${page}; this process serves ${served.join(", ")}. ` +
    `Open the app at one of those, or start the backend with FRONTEND_ORIGIN=${page}.`
  );
}

/** Middleware for a route that must not be drivable from another website */
export function localOnlyRoute(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (
    isForeignBrowserRequest(
      {
        origin,
        secFetchSite: req.headers["sec-fetch-site"] as string | undefined,
        host: req.headers.host,
      },
      expectedOrigins(),
    )
  ) {
    res.status(403).json({ error: refusalFor(origin, expectedOrigins()) });
    return;
  }
  next();
}

/**
 * The body limit's error, answered as what it is.
 *
 * `express.json({ limit })` throws a `PayloadTooLargeError`, and the shared
 * error handler folded every error into `500 Internal server error`. So the one
 * wall a user can actually walk into — a folder bigger than the upload the app
 * accepts — arrived as a crash, and the branch in the reader that explains the
 * limit in the user's own language (`res.status === 413`) never ran. Measured by
 * the edge-state lane with a 212 MB body: HTTP 500, `{"error":"Internal server
 * error"}`.
 *
 * The sentence itself belongs to the page, which owns both languages; the
 * server's job is the status.
 */
export function uploadLimitAwareErrorHandler(logger: { error: (o: unknown, msg: string) => void }) {
  return (err: unknown, _req: Request, res: Response): void => {
    const e = err as { type?: string; status?: number; statusCode?: number };
    const tooLarge = e?.type === "entity.too.large" || e?.status === 413 || e?.statusCode === 413;
    if (tooLarge) {
      res.status(413).json({ error: "Request body exceeds the upload this app accepts" });
      return;
    }
    logger.error({ err }, "Unhandled error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  };
}
