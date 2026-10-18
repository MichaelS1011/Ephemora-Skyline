/**
 * Ephemora Skyline — local Express API server
 *
 * All analysis results live in a single `analysisStore`.
 * Analysis progress is served by GET /api/status/:id; the frontend polls it.
 */

import type { Request, Response } from "express";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import http from "http";
import pino from "pino";

import type { ResolvedScanConfig } from "../services/security/scan-config.js";
import { AnalysisStore } from "./analysis-store.js";
import { AnalysisOrchestrator } from "../services/analyzer/orchestrator.js";
import { corsOptionsFor, localOnlyRoute, uploadLimitAwareErrorHandler } from "./local-only.js";
import { ruleClassNames } from "../services/security/finding-knowledge.js";
import { SecurityScanner } from "../services/security/scanner.js";
import { READ_BUDGET_EXEMPT } from "./read-budget.js";
import { handleHealth } from "./routes/health.js";
import { handleCitiesDefault, handleDemo } from "./routes/demo.js";
import { handleStatus } from "./routes/status.js";
import { handleResult, handleResultCity, handleResultSarif } from "./routes/result.js";
import { handleRulePacks } from "./routes/rule-packs.js";
import { handleFootprint, handleFootprintPurge } from "./routes/footprint.js";
import { bindHost, isLoopbackHost, portInUseMessage } from "./bind-address.js";
import {
  handleCancelLocalAnalyze,
  handleLocalAnalyze,
  pruneStaleUploadDirs,
  uploadsRoot,
} from "./routes/local-analyze.js";
import { handleHandoff, handleVerify } from "./routes/agent.js";
import { handleGetVerdicts, handlePutVerdicts, handleResetVerdicts } from "./routes/verdicts.js";
import { handleSource } from "./routes/source.js";
import { handleUpdateCheck } from "./routes/update-check.js";
// Placed after the route imports: the tree-hygiene gate reads this file's import
// order and rejects a scanner question raised before the routes that stage.
import { decideStart, inspectStagingRoot } from "./upload-dir-guard.js";
import { handleTestRun, handleTestStatus } from "./routes/tests.js";

dotenv.config();

const logger = pino({ name: "codecity" });

const app = express();
const server = http.createServer(app);

// ── Single source of truth for all analysis results ───────────────────────
const analysisStore = new AnalysisStore();

// ── Service instances ─────────────────────────────────────────────────────
// Per analysis, not per process: the scanner carries the resolved profile and
// the adapters carry the state of the run they just did, so two scans sharing
// one instance would report each other's settings.
const createOrchestrator = (config: ResolvedScanConfig): AnalysisOrchestrator =>
  new AnalysisOrchestrator(new SecurityScanner(undefined, config));

// ── Rate limiting ─────────────────────────────────────────────────────────
// Read endpoints get a generous budget (browsing a city should never lock
// a user out); the expensive analysis endpoint stays strictly limited.
//
// Progress polling is NOT a read of the user's data: it is the app asking its own
// server whether the scan it already paid for is done. Counting it spent 30 of
// 600 budget slots per minute for a single running scan, so the one action a
// nervous user takes (watching the bar) was the thing that locked them out.
const READ_WINDOW_MS = 15 * 60 * 1000;

/** The reset seconds the server itself announced, or the whole window. */
function resetSeconds(res: Response, fallback: number): number {
  const announced = Number(res.getHeader("RateLimit-Reset"));
  return Number.isFinite(announced) && announced > 0 ? Math.round(announced) : fallback;
}

const readLimiter = rateLimit({
  windowMs: READ_WINDOW_MS,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => READ_BUDGET_EXEMPT.test(req.originalUrl),
  message: (_req: Request, res: Response) => ({
    error: "Too many requests, please try again later.",
    code: "rate_limited",
    retryAfterSeconds: resetSeconds(res, Math.ceil(READ_WINDOW_MS / 1000)),
  }),
});

// The local-folder route serves the main UI flow of a single-user local tool —
// a generous budget instead of the shared analyze limit
const localAnalyzeLimiter = rateLimit({
  windowMs: READ_WINDOW_MS,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: (_req: Request, res: Response) => ({
    error: "Too many analyses — take a short break.",
    code: "rate_limited",
    retryAfterSeconds: resetSeconds(res, Math.ceil(READ_WINDOW_MS / 1000)),
  }),
});

// A test run installs packages and executes the scanned project's own code, so
// it is not on the generous read budget the polling endpoint shares
const testRunLimiter = rateLimit({
  windowMs: READ_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (_req: Request, res: Response) => ({
    error: "Too many test runs — give the finished one a moment.",
    code: "rate_limited",
    retryAfterSeconds: resetSeconds(res, Math.ceil(READ_WINDOW_MS / 1000)),
  }),
});

// ── Middleware ─────────────────────────────────────────────────────────────
// Behind a reverse proxy (nginx in compose, Render's router) express-rate-limit
// must key on the client IP from X-Forwarded-For, not on the proxy's IP.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", process.env.TRUST_PROXY);
}
app.use(helmet());
app.use(cors(corsOptionsFor()));
// Large-body parser must run BEFORE the global one: the global 10mb parser
// would otherwise reject big local-folder uploads with 413 first
app.use("/api/analyze-local", express.json({ limit: "200mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", readLimiter);

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/health
app.get("/api/health", (_req: Request, res: Response): void => {
  void handleHealth(_req, res, analysisStore);
});

// GET /api/rule-classes — the curated class names, so a filter chip can say
// "Eval on a string" for a finding whose payload carries no label (the demo
// engine writes none). The table is the one the cards use; a copy in the UI
// would drift from it. Guarded like the other reads a foreign page has no
// business receiving.
app.get("/api/rule-classes", localOnlyRoute, (_req: Request, res: Response): void => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(ruleClassNames());
});

// GET /api/demo — hardcoded demo dataset. A read, but one a foreign page has no
// business receiving: it carries the same origin guard as the routes that run.
app.get("/api/demo", localOnlyRoute, (_req: Request, res: Response): void => {
  handleDemo(_req, res);
});

// GET /api/cities/default — city-mapped demo data consumed by the frontend.
// A read like /api/demo: a foreign page has no business receiving it either.
app.get("/api/cities/default", localOnlyRoute, (_req: Request, res: Response): void => {
  handleCitiesDefault(_req, res, analysisStore);
});

// POST /api/analyze-local — analyze a folder picked in the browser
// Large route-specific body limit: the client uploads the folder's source files
app.post(
  "/api/analyze-local",
  localOnlyRoute,
  localAnalyzeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    await handleLocalAnalyze(req, res, createOrchestrator, analysisStore);
  },
);

// POST /api/analyze-local/:id/cancel — throw a running local scan away. The job
// leaves the store, its progress stops, and the staged copy of the user's source
// is deleted instead of sitting out its TTL. Guarded like every route that acts
// on the machine, though it only ever destroys work this same client started.
app.post(
  "/api/analyze-local/:id/cancel",
  localOnlyRoute,
  async (req: Request, res: Response): Promise<void> => {
    await handleCancelLocalAnalyze(req, res, analysisStore);
  },
);

// POST /api/tests/:id/run — run the project's own tests from the staged copy
app.post(
  "/api/tests/:id/run",
  localOnlyRoute,
  testRunLimiter,
  (req: Request, res: Response): void => {
    void handleTestRun(req, res);
  },
);

// GET /api/tests/run/:runId — poll a test run
app.get("/api/tests/run/:runId", (req: Request, res: Response): void => {
  handleTestStatus(req, res);
});

// GET /api/result/:id — retrieve a completed analysis
app.get("/api/result/:id", (req: Request, res: Response): void => {
  handleResult(req, res, analysisStore);
});

// GET /api/result/:id/city — retrieve analysis mapped to city data
app.get("/api/result/:id/city", (req: Request, res: Response): void => {
  handleResultCity(req, res, analysisStore);
});

// GET /api/result/:id/sarif — SARIF export for InfoPanel + CI
app.get("/api/result/:id/sarif", (req: Request, res: Response): void => {
  handleResultSarif(req, res, analysisStore);
});

// GET /api/update/check — the one outbound question the app asks about itself
app.get("/api/update/check", readLimiter, (req: Request, res: Response): void => {
  void handleUpdateCheck(req, res);
});

// GET /api/rule-packs — which rule bundles exist, where they came from, and
// under what license (see routes/rule-packs.ts).
app.get("/api/rule-packs", localOnlyRoute, (_req: Request, res: Response): void => {
  handleRulePacks(_req, res);
});

// GET /api/footprint — what this program keeps on the machine it runs on, and
// POST /api/footprint/purge to sweep the part of it that is past its TTL. The
// entry screen renders its privacy note from here, so "nothing is kept forever"
// can be read as a number and acted on without a terminal. The snapshot counts
// the staged folder copies (footprintSnapshot); the machine's second home of
// the human's triage is the verdict store at ~/.ephemora-skyline/verdicts.json
// (CODECITY_VERDICTS_FILE overrides), cleared by POST /api/verdicts/reset — the
// entry screen's reset button deletes the browser buckets and that file. Both
// halves carry the origin guard — the GET names what is kept on disk, the
// purge is a write and deletes it, and neither is drivable from another website.
app.get(
  "/api/footprint",
  localOnlyRoute,
  readLimiter,
  async (_req: Request, res: Response): Promise<void> => {
    await handleFootprint(_req, res);
  },
);
app.post(
  "/api/footprint/purge",
  localOnlyRoute,
  async (_req: Request, res: Response): Promise<void> => {
    await handleFootprintPurge(_req, res);
  },
);

// GET /api/result/:id/handoff — newline-delimited JSON, one finding per line,
// keyed by the same fingerprint the panel, the city and the SARIF use. This is
// the channel a coding agent reads; the 3D city is the channel a human reads.
app.get("/api/result/:id/handoff", readLimiter, (req: Request, res: Response): void => {
  handleHandoff(req, res, analysisStore);
});

// The verdicts the human set for a project, stored machine-local so a re-scan
// and a restart find them. GET is a read (an agent's only door); PUT and the
// reset are writes and carry the same origin guard as the routes that run code.
app.get("/api/result/:id/verdicts", readLimiter, (req: Request, res: Response): void => {
  void handleGetVerdicts(req, res, analysisStore);
});
app.put("/api/result/:id/verdicts", localOnlyRoute, (req: Request, res: Response): void => {
  void handlePutVerdicts(req, res, analysisStore);
});
app.post("/api/verdicts/reset", localOnlyRoute, (req: Request, res: Response): void => {
  void handleResetVerdicts(req, res);
});

// POST /api/verify — did the findings of one scan survive a later one? A read of
// two RAM results, but a POST with a body, so it carries the same guard as the
// other routes that accept instructions from a page.
app.post("/api/verify", localOnlyRoute, (req: Request, res: Response): void => {
  void handleVerify(req, res, analysisStore);
});

app.get("/api/result/:id/source/:fileId", readLimiter, (req: Request, res: Response): void => {
  void handleSource(req, res, analysisStore);
});

// GET /api/status/:id — poll analysis progress
app.get("/api/status/:id", (req: Request, res: Response): void => {
  handleStatus(req, res, analysisStore);
});

// ── Error handling ─────────────────────────────────────────────────────────
app.use(uploadLimitAwareErrorHandler(logger));

// ── Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutdown signal received");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const HOST = bindHost();
// A busy port is the normal way a second checkout fails to start, and it used to
// end in an unhandled Node stack trace. Say the sentence, leave with 1.
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code !== "EADDRINUSE") {
    logger.fatal({ err }, "the HTTP server died");
    process.exit(1);
  }
  logger.fatal({ port: PORT, host: HOST }, portInUseMessage(PORT, HOST));
  logger.flush(() => process.exit(1));
  setTimeout(() => process.exit(1), 500);
});

/**
 * The port is bound only after the staging folder has been answered for.
 *
 * A scan reads the user's code from the copy staged under CODECITY_UPLOAD_DIR,
 * and the engines walking that copy follow the repository's ignore rules. A root
 * an ignore rule covers therefore reads no file and reports no finding — the city
 * goes on showing "the scanners ran" over a folder nobody opened. That is worse
 * than a start that fails, so it fails: nothing is swept, nothing is bound, and
 * the sentence names the folder, the rule over it and the knob to turn.
 */
const startBackend = async (): Promise<void> => {
  const verdict = await inspectStagingRoot(uploadsRoot());
  const decision = decideStart(verdict);
  if (decision.logLine) {
    if (decision.abort) logger.fatal(decision.logLine);
    else logger.warn(decision.logLine);
  }
  if (decision.abort) {
    logger.flush(() => process.exit(1));
    setTimeout(() => process.exit(1), 500);
    return;
  }
  server.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, "Ephemora Skyline backend listening");
    if (!isLoopbackHost(HOST)) {
      logger.warn(
        { host: HOST },
        "listening on a non-loopback address: this API can run the tests of any " +
          "folder it is handed, and has no authentication. Only do this on a network you own.",
      );
    }
  });

  // Prune stale staged uploads (test-runner copies) every 6 hours
  void pruneStaleUploadDirs();
  setInterval(() => void pruneStaleUploadDirs(), 6 * 60 * 60 * 1000);
};

void startBackend();

export { app, server };
