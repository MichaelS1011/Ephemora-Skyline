/**
 * CodeCity CyberDefense — Express + WebSocket Server
 *
 * All analysis results live in a single `analysisStore`.
 * WebSocket progress is routed exclusively through the WS client socket;
 * HTTP endpoints use normal request/response.
 */

import type { Request, Response, NextFunction } from "express";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import http from "http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import pino from "pino";

import type { AnalysisResult } from "../models/index.js";
import type { ResolvedScanConfig } from "../services/security/scan-config.js";
import { AnalysisOrchestrator } from "../services/analyzer/orchestrator.js";
import { localOnlyRoute } from "./local-only.js";
import { SecurityScanner } from "../services/security/scanner.js";
import { getHealth } from "./routes/health.js";
import { getDemoResult } from "./routes/demo.js";
import { getJobProgress } from "./routes/job-progress.js";
import { bindHost, isLoopbackHost } from "./bind-address.js";
import { handleLocalAnalyze, pruneStaleUploadDirs } from "./routes/local-analyze.js";
import { handleSource } from "./routes/source.js";
import { handleUpdateCheck } from "./routes/update-check.js";
import { handleTestRun, handleTestStatus } from "./routes/tests.js";
import { WebSocketServerManager } from "../services/streaming/websocket-server.js";
import { mapResultToCityData } from "../utils/cityMapper.js";
import { resultToSarif } from "../utils/sarif.js";

dotenv.config();

const logger = pino({ name: "codecity" });

const app = express();
const server = http.createServer(app);

// ── Single source of truth for all analysis results ───────────────────────
/**
 * Bounded in-memory store for analysis results (LRU + TTL).
 * Without bounds, every analysis accumulates in RAM until restart.
 */
class AnalysisStore {
  private map = new Map<string, AnalysisResult>();
  private stamps = new Map<string, number>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor() {
    this.maxEntries = parseInt(process.env.ANALYSIS_MAX_ENTRIES || "20", 10);
    this.ttlMs = parseInt(process.env.ANALYSIS_TTL_MS || String(24 * 60 * 60 * 1000), 10);
  }

  get(id: string): AnalysisResult | undefined {
    const result = this.map.get(id);
    if (!result) return undefined;
    // LRU touch: re-insert to move to the back of eviction order and
    // refresh the TTL stamp — actively browsed results must not expire
    this.map.delete(id);
    this.map.set(id, result);
    if (this.stamps.has(id)) this.stamps.set(id, Date.now());
    return result;
  }

  set(id: string, result: AnalysisResult): void {
    this.map.delete(id);
    this.stamps.delete(id);
    this.map.set(id, result);
    this.stamps.set(id, Date.now());
    this.evict();
  }

  delete(id: string): void {
    this.map.delete(id);
    this.stamps.delete(id);
  }

  private evict(): void {
    const now = Date.now();
    for (const [id, stamp] of this.stamps) {
      if (now - stamp > this.ttlMs) {
        this.map.delete(id);
        this.stamps.delete(id);
      }
    }
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.stamps.delete(oldest);
    }
  }
}

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
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// The local-folder route serves the main UI flow of a single-user local tool —
// a generous budget instead of the shared analyze limit
const localAnalyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many analyses — take a short break." },
});

// A test run installs packages and executes the scanned project's own code, so
// it is not on the generous read budget the polling endpoint shares
const testRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many test runs — give the finished one a moment." },
});

// ── WS analyze budget ─────────────────────────────────────────────────────

// ── Middleware ─────────────────────────────────────────────────────────────
// Behind a reverse proxy (nginx in compose, Render's router) express-rate-limit
// must key on the client IP from X-Forwarded-For, not on the proxy's IP.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", process.env.TRUST_PROXY);
}
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3010",
    credentials: true,
  }),
);
// Large-body parser must run BEFORE the global one: the global 10mb parser
// would otherwise reject big local-folder uploads with 413 first
app.use("/api/analyze-local", express.json({ limit: "80mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", readLimiter);

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/health
app.get("/api/health", async (_req: Request, res: Response): Promise<void> => {
  const health = await getHealth();
  res.json(health);
});

// GET /api/demo — hardcoded demo dataset
app.get("/api/demo", (_req: Request, res: Response): void => {
  try {
    res.json(getDemoResult());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/cities/default — city-mapped demo data consumed by the frontend
app.get("/api/cities/default", (_req: Request, res: Response): void => {
  try {
    const demo = getDemoResult();
    res.json(mapResultToCityData(demo));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
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
app.get("/api/tests/run/:runId", readLimiter, (req: Request, res: Response): void => {
  handleTestStatus(req, res);
});

// GET /api/result/:id — retrieve a completed analysis
app.get("/api/result/:id", (req: Request, res: Response): void => {
  const id = req.params["id"];
  if (!id || Array.isArray(id)) {
    res.status(400).json({ error: "Missing analysis ID" });
    return;
  }

  const result = analysisStore.get(id);
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  if (result.status === "analyzing") {
    res.json({ status: "pending", progress: 0 });
    return;
  }

  res.json(result);
});

// GET /api/result/:id/city — retrieve analysis mapped to city data
app.get("/api/result/:id/city", (req: Request, res: Response): void => {
  const id = req.params["id"];
  const result = analysisStore.get(typeof id === "string" ? id : "");
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  res.json(mapResultToCityData(result));
});

// GET /api/result/:id/sarif — SARIF export for InfoPanel + CI
app.get("/api/result/:id/sarif", (req: Request, res: Response): void => {
  const id = req.params["id"];
  const result = analysisStore.get(typeof id === "string" ? id : "");
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  res.setHeader("Content-Type", "application/sarif+json");
  res.json(resultToSarif(result));
});

// GET /api/result/:id/source/:fileId — raw source of one analyzed file
app.get("/api/update/check", readLimiter, (req: Request, res: Response): void => {
  void handleUpdateCheck(req, res);
});

app.get("/api/result/:id/source/:fileId", readLimiter, (req: Request, res: Response): void => {
  void handleSource(req, res, analysisStore);
});

// GET /api/status/:id — poll analysis progress
app.get("/api/status/:id", (req: Request, res: Response): void => {
  const id = req.params["id"];
  if (!id || Array.isArray(id)) {
    res.status(400).json({ error: "Missing analysis ID" });
    return;
  }

  const result = analysisStore.get(id);
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const live = getJobProgress(id);
  res.json({
    status: result.status,
    progress: result.status === "complete" ? 100 : (live?.progress ?? 0),
    stage: result.status === "complete" ? "Complete" : live?.stage,
    filesParsed: result.files.length,
    totalFiles: result.summary.totalFiles,
    error: result.status === "failed" ? result.error : undefined,
  });
});

// ── Error handling ─────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

// ── WebSocket server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });
const wsManager = new WebSocketServerManager(logger);

wsManager.startHeartbeat();
wsManager.startCleanup();

wss.on("connection", (wsClient: WebSocket, request: http.IncomingMessage) => {
  const clientId = crypto.randomUUID();
  logger.info({ clientId }, "WebSocket client connected");

  // Register with manager for heartbeat + cleanup tracking
  wsManager.handleConnection(wsClient, request.url ?? "/ws");

  // Allow 5s for client activity before defaulting to demo data
  const startAnalysisTimeout = setTimeout(() => {
    if (wsClient.readyState === wsClient.OPEN) {
      logger.info({ clientId }, "No activity received — sending demo data");
      try {
        wsClient.send(
          JSON.stringify({
            type: "analysis_progress",
            payload: { progress: 0, stage: "Loading demo data...", connected: true },
            timestamp: new Date().toISOString(),
          }),
        );
        // Stream the demo result as a completed analysis
        const demo = getDemoResult();
        analysisStore.set(demo.id, demo);
        wsClient.send(
          JSON.stringify({
            type: "analysis_complete",
            payload: { id: demo.id, totalFiles: demo.summary.totalFiles },
            timestamp: new Date().toISOString(),
          }),
        );
      } catch {
        /* client already closed */
      }
    }
  }, 5000);

  wsClient.on("close", () => {
    clearTimeout(startAnalysisTimeout);
    logger.info({ clientId }, "WebSocket client disconnected");
  });
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutdown signal received");
  wsManager.closeAll();
  server.close(() => {
    logger.info("HTTP server closed");
    wss.close(() => {
      logger.info("WebSocket server closed");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const HOST = bindHost();
server.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST }, "CodeCity backend listening");
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

export { app, server };
