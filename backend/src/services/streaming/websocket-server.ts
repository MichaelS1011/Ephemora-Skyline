/**
 * WebSocketServerManager — Manages WebSocket connections for real-time progress streaming.
 *
 * Responsibilities:
 * - Track active connections with heartbeats
 * - Route analysis progress events to connected clients
 * - Clean up stale/disconnected clients
 * - Timeout-triggered default analysis when no client sends a URL
 */

import type pino from "pino";
import { WebSocket } from "ws";
import type { WebSocketEvent } from "../../models/index.js";

interface WsClientInfo {
  ws: WebSocket;
  connectedAt: number;
  lastPong: number;
  clientId: string;
  analysisInProgress?: boolean;
  analysisId?: string;
}

const HEARTBEAT_INTERVAL = 30000; // 30s
const STALE_THRESHOLD = 60000; // 60s without pong
const MAX_CONNECTIONS = 50;
const CLEANUP_INTERVAL = 60000; // 60s

export class WebSocketServerManager {
  private logger: pino.Logger;
  private clients: Map<string, WsClientInfo> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(logger: pino.Logger) {
    this.logger = logger.child({ service: "ws-manager" });
  }

  /** Handle a new WebSocket connection */
  handleConnection(ws: WebSocket, _url: string | null): void {
    if (this.clients.size >= MAX_CONNECTIONS) {
      this.logger.warn(
        { size: this.clients.size, max: MAX_CONNECTIONS },
        "Max connections reached, rejecting",
      );
      ws.close(1013, "Server full");
      return;
    }

    const clientId = crypto.randomUUID();
    const info: WsClientInfo = {
      ws,
      connectedAt: Date.now(),
      lastPong: Date.now(),
      clientId,
    };

    this.clients.set(clientId, info);
    this.logger.info({ clientId }, "WebSocket client connected");

    // Send welcome event
    this.send(clientId, {
      type: "connected",
      payload: { clientId, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });

    // Set up handlers
    ws.on("pong", () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPong = Date.now();
      }
    });

    ws.on("close", () => {
      this.logger.info({ clientId }, "WebSocket client disconnected");
      this.clients.delete(clientId);
    });

    ws.on("error", (error) => {
      this.logger.error({ clientId, error }, "WebSocket error");
      this.clients.delete(clientId);
    });
  }

  /** Send a typed event to a specific client by ID */
  send(clientId: string, event: WebSocketEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      this.clients.delete(clientId);
      return false;
    }

    try {
      client.ws.send(JSON.stringify(event));
      return true;
    } catch (error) {
      this.logger.error({ clientId, error }, "Failed to send WS event");
      this.clients.delete(clientId);
      return false;
    }
  }

  /** Broadcast an event to all connected clients */
  broadcast(event: WebSocketEvent): void {
    const results: boolean[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(event));
          results.push(true);
        } else {
          results.push(false);
          this.clients.delete(clientId);
        }
      } catch {
        results.push(false);
        this.clients.delete(clientId);
      }
    }

    const sent = results.filter(Boolean).length;
    if (sent > 0) {
      this.logger.debug({ sent, event: event.type }, "Broadcast sent");
    }
  }

  /** Start heartbeat — ping all connected clients */
  startHeartbeat(intervalMs: number = HEARTBEAT_INTERVAL): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients) {
        // Send ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }

        // Check stale
        if (now - client.lastPong > STALE_THRESHOLD) {
          this.logger.warn({ clientId }, "Client stale, removing");
          client.ws.terminate();
          this.clients.delete(clientId);
        }
      }
    }, intervalMs);
  }

  /** Start periodic cleanup of stale clients */
  startCleanup(intervalMs: number = CLEANUP_INTERVAL): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients) {
        const age = now - client.connectedAt;
        if (age > 1800000) {
          // 30 min max lifetime
          this.logger.info({ clientId, age }, "Client expired, closing");
          client.ws.close();
          this.clients.delete(clientId);
        }
      }
    }, intervalMs);
  }

  /** Get count of active connections */
  getActiveConnectionCount(): number {
    return this.clients.size;
  }

  /** Stop all timers */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Close all connections */
  closeAll(): void {
    for (const [, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1001, "Server shutting down");
      }
    }
    this.clients.clear();
    this.stop();
  }
}
