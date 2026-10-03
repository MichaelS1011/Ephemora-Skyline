import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * The progress path is HTTP polling (`GET /api/status/:id`). A server-side
 * socket nothing ever connected to is unexercised code on a machine that runs
 * the scanned folder's own tests, so it was deleted rather than left in place.
 * These checks keep the deletion from silently regrowing.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function sources(dir: string, extensions: string[]): Array<{ file: string; text: string }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => extensions.includes(path.extname(p)))
    .filter((p) => !/(^|\/)(node_modules|dist|\.turbo)(\/|$)/.test(p))
    .map((p) => ({ file: path.join(dir, p), text: readFileSync(path.join(dir, p), "utf-8") }));
}

const WS_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "imports the ws package", re: /from\s+"ws"/ },
  { label: "constructs a WebSocketServer", re: /new\s+WebSocketServer\s*\(/ },
  { label: "listens for upgrade requests", re: /\.on\(\s*["']upgrade["']/ },
  { label: "names a WebSocket symbol", re: /WebSocket/ },
];

describe("no WebSocket surface in the product", () => {
  it("keeps the backend source free of sockets and upgrade listeners", () => {
    const files = sources(path.join(repoRoot, "backend/src"), [".ts"]);
    expect(files.length).toBeGreaterThan(10);
    for (const { label, re } of WS_PATTERNS) {
      const hits = files.filter((f) => re.test(f.text)).map((f) => path.relative(repoRoot, f.file));
      expect(hits, `backend ${label}: ${hits.join(", ")}`).toEqual([]);
    }
  });

  it("deletes the streaming service directory instead of leaving it empty", () => {
    expect(existsSync(path.join(repoRoot, "backend/src/services/streaming"))).toBe(false);
  });

  it("keeps the frontend free of a client that would connect", () => {
    const files = sources(path.join(repoRoot, "frontend/src"), [".ts", ".tsx"]);
    for (const f of files) {
      expect(/new\s+WebSocket\s*\(/.test(f.text), `frontend ${f.file} opens a socket`).toBe(false);
      expect(/ws:\/\//.test(f.text), `frontend ${f.file} names a ws:// url`).toBe(false);
    }
  });

  it("keeps the dev proxy, the reverse proxy and the host rewrite without a /ws route", () => {
    const configs = [
      "frontend/vite.config.ts",
      "docker/nginx.conf",
      "vercel.json",
      "backend/src/server/index.ts",
    ];
    for (const rel of configs) {
      const text = readFileSync(path.join(repoRoot, rel), "utf-8");
      expect(text.includes("/ws"), `${rel} still routes /ws`).toBe(false);
    }
  });
});
