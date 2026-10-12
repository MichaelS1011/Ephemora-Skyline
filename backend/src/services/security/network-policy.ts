/**
 * Netzwerk-Ehrlichkeit braucht mehr als einen Text in der Doku: einen Schalter,
 * der die Maschine tatsächlich ruhigstellt.
 *
 * `SKYLINE_OFFLINE=1` — ausser dem Loopback-Port verlässt dann nichts mehr die
 * Rechnerplatte. Die Fundwege, die Datenbanken anzapfen (Semgrep-Regel-Pack,
 * OSV/npm-CVE, GitHub-Release-Check) bleiben zu; was fehlt, meldet die Stadt
 * über scanProvenance und zeigt die Gebäude als ungeprüft.
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export const OFFLINE_ENV = "SKYLINE_OFFLINE";

/** Gelesen wird bei jedem Aufruf, nicht beim Import — Tests schalten um. */
export function isOffline(env: NodeJS.ProcessEnv = process.env): boolean {
  return TRUTHY.has((env[OFFLINE_ENV] ?? "").trim().toLowerCase());
}

/**
 * Was ein Scan versucht, wenn Offline-Schalter NICHT gesetzt ist. Gemessen, nicht
 * vermutet: ein lokaler Lausch-Proxy (nicht ausgeliefert) stand vor den
 * Scannern und notierte jedes CONNECT. Quelle des Ausdrucks ist der Code selbst.
 */
export interface OutboundCall {
  readonly host: string;
  readonly by: string;
  readonly what: string;
  readonly when: string;
}

export const OUTBOUND_CALLS: readonly OutboundCall[] = [
  {
    host: "api.github.com",
    by: "update-check",
    what: "one anonymous GET for the newest release tag",
    when: "once per hour, when the app asks for an update",
  },
  {
    host: "semgrep.dev",
    by: "semgrep",
    what: "the rule pack named by SEMGREP_CONFIG (default p/security-audit)",
    when: "a scan with Semgrep on and no local rule pack selected",
  },
  {
    host: "api.osv.dev",
    by: "osv-scanner",
    what: "package names and versions read from the lockfiles",
    when: "a scan with the dependency engine switched on",
  },
  {
    host: "registry.npmjs.org",
    by: "npm audit",
    what: "the same dependency names, through npm's own advisory path",
    when: "a scan with no osv-scanner, but a package-lock.json in the folder",
  },
  {
    host: "api.deps.dev",
    by: "osv-scanner",
    what: "the same package names, resolved against the deps.dev index",
    when: "a scan with osv-scanner installed, alongside the api.osv.dev queries",
  },
  {
    host: "pypi.org",
    by: "pip-audit",
    what: "Python requirement names and versions from requirements.txt",
    when: "the OSV check is on, no osv-scanner, and a requirements.txt is in the folder",
  },
  {
    host: "registry-1.docker.io",
    by: "the Semgrep Docker fallback",
    what: "an image pull of semgrep/semgrep, nothing about the source",
    when: "Semgrep is selected, no binary on PATH, Docker present, image not cached",
  },
  {
    host: "registry.npmjs.org",
    by: "npm ci in the in-city test runner",
    what: "whatever the scanned project's own lockfile pins",
    when: "Run test file is pressed and the staged copy has no node_modules",
  },
] as const;
