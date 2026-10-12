/**
 * Where the HTTP server binds.
 *
 * Its own module because src/server/index.ts starts listening on import — a
 * test that wants to pin the bind rule must not have to open a socket.
 */

/** Loopback names that all mean "this machine only". */
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Default to loopback. This API takes a folder and can be told to run that
 * folder's own tests, so a listener on every interface is a code-execution
 * service for whoever else is on the network — a laptop in a cafe should not
 * be one. An operator who means it can say so with HOST.
 */
export function bindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOST?.trim() || "127.0.0.1";
}

export function isLoopbackHost(host: string): boolean {
  // ::ffff:127.0.0.1 and a bracketed [::1] both arrive from real configs
  const h = host
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/i, "")
    .toLowerCase();
  return LOOPBACK.has(h);
}

/**
 * What to say when the port is taken.
 *
 * A second checkout on the same machine ends here, and until now it ended in a
 * raw Node stack trace (`Unhandled 'error' event`, `code: 'EADDRINUSE'`) — the
 * first thing a contributor sees after `npm run dev`, and it reads as a broken
 * install rather than as a port that is busy. The three settings that solve it
 * are named here because the person in front of it cannot know them yet.
 */
export function portInUseMessage(port: number, host: string): string {
  return (
    `Port ${port} on ${host} is already in use, so this backend did not start. ` +
    `Either stop the other Ephemora Skyline, or run this one beside it: ` +
    `PORT=<free port> FRONTEND_ORIGIN=http://localhost:<dev port> npm run dev --workspace backend, ` +
    `and start the dev server with BACKEND_PORT=<free port> so its proxy follows.`
  );
}
