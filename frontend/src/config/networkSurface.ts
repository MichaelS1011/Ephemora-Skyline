/**
 * The same list the backend enforces, copied here because the landing page has
 * to state it before a backend answers at all. A backend test compares the two
 * entry by entry, so this cannot quietly become a second, friendlier version of
 * the truth.
 *
 * `de` carries the German wording of the same row: the entry screen is bilingual
 * and a table of English prose on a German page is the gap task #49 was about.
 * The host itself is never translated — it is what the request goes to.
 */
export interface OutboundCall {
  readonly host: string;
  readonly by: string;
  readonly what: string;
  readonly when: string;
  readonly de: { by: string; what: string; when: string };
}

export const OUTBOUND_CALLS: readonly OutboundCall[] = [
  {
    host: "api.github.com",
    by: "update-check",
    what: "one anonymous GET for the newest release tag",
    when: "once per hour, from the first run — one click in a city's More menu ends it for good",
    de: {
      by: "Update-Prüfung",
      what: "ein anonymer Abruf des neuesten Release-Tags",
      when: "einmal pro Stunde, ab dem ersten Lauf — ein Klick im Mehr-Menü einer Stadt beendet es endgültig",
    },
  },
  {
    host: "semgrep.dev",
    by: "semgrep",
    what: "the rule pack named by SEMGREP_CONFIG (default p/security-audit)",
    when: "a scan with Semgrep on and no local rule pack selected",
    de: {
      by: "semgrep",
      what: "der Regel-Pack, den SEMGREP_CONFIG nennt (Standard p/security-audit)",
      when: "ein Scan mit Semgrep an, ohne gewählten lokalen Regel-Pack",
    },
  },
  {
    host: "api.osv.dev",
    by: "osv-scanner",
    what: "package names and versions read from the lockfiles",
    when: "a scan with the dependency engine switched on",
    de: {
      by: "osv-scanner",
      what: "Paketnamen und Versionen aus den Lockfiles",
      when: "ein Scan mit eingeschalteter Abhängigkeitsprüfung",
    },
  },
  {
    host: "registry.npmjs.org",
    by: "npm audit",
    what: "the same dependency names, through npm's own advisory path",
    when: "a scan with no osv-scanner, but a package-lock.json in the folder",
    de: {
      by: "npm audit",
      what: "dieselben Namen, über npm-eigenen Advisory-Pfad",
      when: "Scan ohne osv-scanner, aber mit package-lock.json im Ordner",
    },
  },
  {
    host: "api.deps.dev",
    by: "osv-scanner",
    what: "the same package names, resolved against the deps.dev index",
    when: "a scan with osv-scanner installed, alongside the api.osv.dev queries",
    de: {
      by: "osv-scanner",
      what: "dieselben Paketnamen gegen den deps.dev-Index",
      when: "mit installiertem osv-scanner, neben den api.osv.dev-Anfragen",
    },
  },
  {
    host: "pypi.org",
    by: "pip-audit",
    what: "Python requirement names and versions from requirements.txt",
    when: "the OSV check is on, no osv-scanner, and a requirements.txt is in the folder",
    de: {
      by: "pip-audit",
      what: "Python-Anforderungen und Versionen aus requirements.txt",
      when: "OSV-Prüfung an, kein osv-scanner, requirements.txt im Ordner",
    },
  },
  {
    host: "registry-1.docker.io",
    by: "the Semgrep Docker fallback",
    what: "an image pull of semgrep/semgrep, nothing about the source",
    when: "Semgrep is selected, no binary on PATH, Docker present, image not cached",
    de: {
      by: "der Semgrep-Docker-Fallback",
      what: "ein Image-Pull von semgrep/semgrep, nichts zum Quellcode",
      when: "Semgrep gewählt, keine Binary im PATH, Docker da, Image nicht gecacht",
    },
  },
  {
    host: "registry.npmjs.org",
    by: "npm ci in the in-city test runner",
    what: "whatever the scanned project's own lockfile pins",
    when: "Run test file is pressed and the staged copy has no node_modules",
    de: {
      by: "npm ci im Test-Läufer der Stadt",
      what: "was auch immer das Lockfile des gescannten Projekts festlegt",
      when: "»Testdatei ausführen« wird gedrückt und die Kopie hat keine node_modules",
    },
  },
] as const;
