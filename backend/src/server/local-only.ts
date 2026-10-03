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
export function isForeignBrowserRequest(
  headers: { origin?: string; secFetchSite?: string; host?: string },
  expected: string[],
): boolean {
  if (headers.origin !== undefined) {
    if (expected.includes(headers.origin)) return false;
    // A page served by this very port is the app itself, even when nothing was
    // configured — refusing it would break the packaged app on its own machine.
    try {
      if (headers.host && new URL(headers.origin).host === headers.host) return false;
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
  const configured = (env.FRONTEND_ORIGIN ?? "http://localhost:3010")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...configured, "http://127.0.0.1:3010", "tauri://localhost"];
}

/** Middleware for a route that must not be drivable from another website */
export function localOnlyRoute(req: Request, res: Response, next: NextFunction): void {
  if (
    isForeignBrowserRequest(
      {
        origin: req.headers.origin,
        secFetchSite: req.headers["sec-fetch-site"] as string | undefined,
        host: req.headers.host,
      },
      expectedOrigins(),
    )
  ) {
    res.status(403).json({
      error: "This request came from another website — CodeCity only accepts its own page.",
    });
    return;
  }
  next();
}
