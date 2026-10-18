import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The built frontend, served from the backend's own port.
 *
 * Until now the app only ran as two processes: Vite on 3010 proxying `/api`
 * to Express on 4000. That is fine for a checkout and unusable for anyone who
 * installs a package — one command has to give one address. The frontend
 * already calls relative `/api`, so the built files need nothing but a static
 * mount and the same address.
 *
 * `index.html` is served for unknown non-API paths (the app keeps its whole
 * state in the address: `?city=`, `?file=`, the camera pose). Nothing is
 * guessed when the build is absent: a checkout that runs `npm run dev` never
 * reaches this module, and a missing build says so in one line instead of
 * answering every path with a 404 from a page nobody can read.
 */
export function serveFrontend(app: Express, distDir: string | null): void {
  if (!distDir || !fs.existsSync(path.join(distDir, "index.html"))) {
    return;
  }
  // Assets carry a content hash in their names, so they may be cached hard;
  // index.html must not be, or an update keeps serving the old bundle.
  app.use(
    express.static(distDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(distDir, "index.html"));
  });
}

/** Where the built frontend sits relative to this module, if it was built. */
export function defaultFrontendDir(moduleUrl: string): string | null {
  // The build lives at <repo>/frontend/dist, and this file can be run from two
  // depths: src/server/index.ts (tsx) or dist/server/index.js. Measured: one
  // fixed "two levels up" resolves to <repo>/backend/frontend/dist from the
  // compiled copy — a directory that never exists. Walk up to the workspace
  // root instead of counting levels, and take the first one that is built.
  // `fileURLToPath`, not a hand-parse of the URL: a path with a space would
  // otherwise arrive percent-encoded.
  let dir = path.dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 4; i += 1) {
    const candidate = path.join(dir, "frontend", "dist", "index.html");
    if (fs.existsSync(candidate)) return path.dirname(candidate);
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * The last handler: anything nobody claimed is a JSON 404.
 *
 * Without it an unknown path fell through to the body parser and came back as
 * a 500 with a stack — measured on `GET /` of a build-less server. An API that
 * answers "there is no such route" must not sound like a crash.
 */
export function notFoundHandler() {
  return (req: express.Request, res: express.Response): void => {
    res.status(404).json({ error: "No such route", path: req.path });
  };
}
