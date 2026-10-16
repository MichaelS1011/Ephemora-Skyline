import type { SecurityIssue } from "../../models/index.js";
import { categoryOf } from "./categories.js";
import { maskIssueFrames, maskSecretText } from "./redact.js";

export interface FindingKnowledge {
  /** Plain-language: what does this finding mean for the code owner? */
  explain: string;
  /** German twin of `explain` — the card picks it when the UI speaks German. */
  explainDe?: string;
  /** German one-line remediation, mirroring the EN `fix` the adapters ship. */
  fixDe?: string;
  /** Standard taxonomy reference (CWE id) */
  cwe?: string;
  /** Authoritative documentation link (OWASP, CWE, semgrep, advisory) */
  refUrl?: string;
}

/**
 * Curated explanations per finding type — the "why is this flagged and why
 * should I care" layer that turns a scanner hit into something a developer
 * can act on. Sources: OWASP cheat sheets, CWE, semgrep rule docs.
 */
export const FINDING_KNOWLEDGE: Record<string, FindingKnowledge> = {
  CMD_INJECTION: {
    explain:
      "User-controlled input reaches a shell command. An attacker can append their own commands (e.g. `; rm -rf /`) and run anything with your process's permissions.",
    explainDe:
      "Benutzergesteuerte Eingaben erreichen einen Shell-Befehl. Ein Angreifer kann eigene Befehle anhängen (z. B. `; rm -rf /`) und alles mit den Rechten deines Prozesses ausführen.",
    fixDe: "spawn() mit Argument-Arrays verwenden und shell: true vermeiden",
    cwe: "CWE-78",
    refUrl: "https://owasp.org/www-community/attacks/Command_Injection",
  },
  SQL_INJECTION: {
    explain:
      "A database query is built by string concatenation, so attacker-supplied text can change its meaning — read, modify or delete any data the query can touch.",
    explainDe:
      "Eine Datenbankabfrage entsteht durch String-Verkettung, Angreifer-Text kann also ihre Bedeutung ändern — Daten lesen, ändern oder löschen, die die Abfrage erreicht.",
    fixDe: "Parameterisierte Abfragen oder einen ORM verwenden (z. B. Prisma, Drizzle)",
    cwe: "CWE-89",
    refUrl: "https://owasp.org/www-community/attacks/SQL_Injection",
  },
  EVAL_USAGE: {
    explain:
      "eval() executes a string as code. If any part of that string is attacker-influenced, it is arbitrary code execution. There is almost always a safe alternative.",
    explainDe:
      "eval() führt einen String als Code aus. Steht irgendein Teil davon unter Angreifer-Einfluss, ist das beliebige Codeausführung. Fast immer gibt es eine sichere Alternative.",
    fixDe: "Stattdessen JSON.parse() oder einen sicheren Parser verwenden",
    cwe: "CWE-95",
    refUrl:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval!",
  },
  DYNAMIC_FUNCTION: {
    explain:
      "new Function() compiles a string into executable code — same risk profile as eval(). Attackers who control the string control your process.",
    explainDe:
      "new Function() übersetzt einen String in ausführbaren Code — dasselbe Risikoprofil wie eval(). Wer den String kontrolliert, kontrolliert deinen Prozess.",
    fixDe: "Den Function-Konstruktor vermeiden; sichere Alternativen verwenden",
    cwe: "CWE-95",
    refUrl:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function",
  },
  PATH_TRAVERSAL: {
    explain:
      "User input flows into a filesystem path together with `../`. An attacker can escape the intended directory and read or overwrite any file the process can reach.",
    explainDe:
      "Benutzereingaben fließen zusammen mit `../` in einen Dateisystempfad. Ein Angreifer kann das vorgesehene Verzeichnis verlassen und jede erreichbare Datei lesen oder überschreiben.",
    fixDe:
      "Dateipfade prüfen und bereinigen; path.resolve() verwenden und gegen ein erlaubtes Basisverzeichnis vergleichen",
    cwe: "CWE-22",
    refUrl: "https://owasp.org/www-community/attacks/Path_Traversal",
  },
  XSS: {
    explain:
      "Untrusted data is rendered as HTML (innerHTML / dangerouslySetInnerHTML). Injected `<script>` runs in your users' browsers — session hijacking, keylogging, defacement.",
    explainDe:
      "Nicht vertrauenswürdige Daten werden als HTML gerendert (innerHTML / dangerouslySetInnerHTML). Eingeschleustes `<script>` läuft in den Browsern deiner Nutzer — Session-Diebstahl, Keylogging, Defacement.",
    fixDe:
      "textContent verwenden oder mit DOMPurify säubern; dangerouslySetInnerHTML bei fremden Inhalten vermeiden",
    cwe: "CWE-79",
    refUrl: "https://owasp.org/www-community/attacks/xss/",
  },
  PROTOTYPE_POLLUTION: {
    explain:
      "Manipulating object prototypes (__proto__, __defineGetter__ …) can poison every object of that type in the app — a common step towards remote code execution.",
    explainDe:
      "Manipulierte Objekt-Prototypen (__proto__, __defineGetter__ …) können jedes Objekt dieses Typs in der App vergiften — ein häufiger Schritt Richtung Remote Code Execution.",
    fixDe: "Object.freeze() oder Map für sichere Schlüssel-Wert-Speicherung verwenden",
    cwe: "CWE-1321",
    refUrl: "https://github.com/nicknisi/prototype-pollution",
  },
  UNSAFE_DESERIALIZATION: {
    explain:
      "Deserializing untrusted data (yaml.load, unserialize …) can instantiate arbitrary objects or trigger gadget chains — often remote code execution.",
    explainDe:
      "Das Deserialisieren nicht vertrauenswürdiger Daten (yaml.load, unserialize …) kann beliebige Objekte erzeugen oder Gadget-Ketten auslösen — oft Remote Code Execution.",
    fixDe: "JSON.parse() oder sicheres Deserialisieren mit Schema-Prüfung verwenden (z. B. zod)",
    cwe: "CWE-502",
    refUrl: "https://owasp.org/www-community/vulnerabilities/Deserialization_of_untrusted_data",
  },
  SETTIMEOUT_STRING: {
    explain:
      'setTimeout("…code…") evaluates the string like eval(). Pass a function reference instead: setTimeout(() => doWork(), 100).',
    explainDe:
      'setTimeout("…code…") wertet den String wie eval() aus. Stattdessen eine Funktionsreferenz übergeben: setTimeout(() => doWork(), 100).',
    fixDe: "Eine Funktionsreferenz statt eines Strings übergeben",
    cwe: "CWE-95",
    refUrl: "https://developer.mozilla.org/en-US/docs/Web/API/setTimeout#syntax",
  },
  HARDCODED_SECRET: {
    explain:
      "A credential is committed in plain text. Anyone with repo access (or the git history) owns it. Rotate the credential, move it to an environment variable or a secrets manager.",
    explainDe:
      "Ein Zugangsdatum steht im Klartext im Code. Jeder mit Repo-Zugriff (oder die Git-Historie) besitzt es. Das Zugangsdatum rotieren und in eine Umgebungsvariable oder einen Secrets-Manager verschieben.",
    fixDe:
      "Den Wert aus der Umgebung oder einem Secret-Manager laden und alles Committete rotieren",
    cwe: "CWE-798",
    refUrl: "https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password",
  },
  VULNERABLE_DEPENDENCY: {
    explain:
      "The installed package version matches a published vulnerability advisory. Check whether the affected API and inputs are reachable, including in build tools. Review the advisory for a fix or mitigation.",
    explainDe:
      "Die installierte Paketversion passt zu einem veröffentlichten Sicherheitshinweis. Prüfen, ob die betroffene API samt Eingaben erreichbar ist, auch in Build-Werkzeugen. Den Hinweis auf Fix oder Gegenmaßnahme lesen.",
    fixDe: "Im Advisory nach einer gepatchten Version suchen (Referenz-Link öffnen)",
    cwe: "CWE-1104",
    refUrl: "https://osv.dev/",
  },
  CONSOLE_USAGE: {
    explain:
      "This rule detects console output, not a proven data leak. Inspect the logged values and the runtime context. Ordinary status messages may need no change; redact sensitive data and use log levels where appropriate.",
    explainDe:
      "Diese Regel meldet Konsolenausgaben, keinen bewiesenen Datenabfluss. Die geloggten Werte und den Laufzeitkontext prüfen. Normale Statusmeldungen brauchen oft keine Änderung; sensible Daten schwärzen und wo sinnvoll Log-Level nutzen.",
    fixDe: "Einen strukturierten Logger (pino, winston) mit Log-Leveln verwenden",
    cwe: "CWE-532",
    refUrl: "https://cwe.mitre.org/data/definitions/532.html",
  },
  LOOSE_EQUALITY: {
    explain:
      "== coerces types before comparing ('0' == false is true). These surprising rules cause subtle logic bugs — prefer === / !==.",
    explainDe:
      "== erzwingt vor dem Vergleich eine Typumwandlung ('0' == false ist true). Diese überraschenden Regeln verursachen subtile Logikfehler — === / !== bevorzugen.",
    fixDe: "== durch === für strikte Gleichheit ersetzen",
    refUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Equality",
  },
  LOCALSTORAGE_USAGE: {
    explain:
      "localStorage is readable by any script on the page — never store tokens or personal data there; XSS turns directly into account takeover.",
    explainDe:
      "localStorage kann jedes Skript der Seite lesen — dort nie Tokens oder personenbezogene Daten ablegen; XSS wird so direkt zur Kontoübernahme.",
    fixDe: "httpOnly-Cookies oder sichere serverseitige Speicherung verwenden",
    cwe: "CWE-922",
    refUrl: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API",
  },
  INSECURE_HTTP: {
    explain:
      "A request goes over plain http:// — anyone on the network can read and modify it. Use https:// everywhere.",
    explainDe:
      "Eine Anfrage läuft über unverschlüsseltes http:// — jeder im Netz kann sie lesen und verändern. Überall https:// verwenden.",
    fixDe: "HTTPS für alle API-Aufrufe verwenden",
    cwe: "CWE-319",
    refUrl: "https://owasp.org/www-project-top-ten/2021/A02_2021-Cryptographic_Failures",
  },
  WEAK_CRYPTO: {
    explain:
      "A weak hash (md5/sha1) is used where collision resistance matters. Attackers can forge signatures or passwords — use SHA-256 or better (bcrypt/argon2 for passwords).",
    explainDe:
      "Ein schwacher Hash (md5/sha1) steht dort, wo Kollisionsresistenz zählt. Angreifer können Signaturen oder Passwörter fälschen — SHA-256 oder besser verwenden (bcrypt/argon2 für Passwörter).",
    fixDe: "SHA-256 oder besser verwenden (bcrypt/argon2 für Passwörter)",
    cwe: "CWE-327",
    refUrl: "https://owasp.org/www-project-top-ten/2021/A02_2021-Cryptographic_Failures",
  },
  QUALITY_ASSERT: {
    explain:
      "An assert statement validates runtime input. When Python runs with -O optimization, asserts are stripped entirely — the check silently disappears.",
    explainDe:
      "Eine assert-Anweisung prüft Eingaben zur Laufzeit. Läuft Python mit -O-Optimierung, werden asserts komplett entfernt — die Prüfung verschwindet still.",
    fixDe:
      "Statt assert eine reguläre Prüfung (if/raise) verwenden, die auch mit -O bestehen bleibt",
    refUrl: "https://docs.python.org/3/using/cmdline.html#cmdoption-O",
  },
  QUALITY_F401: {
    explain:
      "An imported module is never used. Dead imports slow readers down and can hide dependency cycles — remove it.",
    explainDe:
      "Ein importiertes Modul wird nie benutzt. Tote Imports bremsen Leser und können Abhängigkeitszyklen verstecken — entfernen.",
    fixDe: "Den unbenutzten Import entfernen",
  },
  QUALITY_F811: {
    explain:
      "A name is redefined, silently overwriting the earlier definition — often a copy-paste bug or a missing rename.",
    explainDe:
      "Ein Name wird neu definiert und überschreibt still die frühere Definition — oft ein Copy-Paste-Fehler oder eine vergessene Umbenennung.",
    fixDe: "Die doppelte Definition zusammenführen oder den Namen eindeutig benennen",
  },
  QUALITY_F841: {
    explain:
      "A local variable is assigned but never used — usually a leftover or a forgotten return value.",
    explainDe:
      "Eine lokale Variable wird zugewiesen, aber nie benutzt — meist ein Überbleibsel oder ein vergessener Rückgabewert.",
    fixDe: "Die unbenutzte Zuweisung entfernen oder den Wert verwenden",
  },
  QUALITY_F821: {
    explain:
      "The code references a name that is never defined in this scope. This is a runtime crash waiting to happen when the code path executes.",
    explainDe:
      "Der Code verweist auf einen Namen, der in diesem Scope nie definiert ist. Läuft dieser Codepfad, ist das ein Laufzeitabsturz mit Ansage.",
    fixDe: "Den Namen definieren oder den fehlenden Import ergänzen",
  },
  QUALITY_E711: {
    explain:
      "Comparing to None with == instead of `is` — None is a singleton, identity is the correct check.",
    explainDe:
      "Vergleich mit None über == statt `is` — None ist ein Singleton, der Identitätscheck ist der richtige.",
    fixDe: "`is None` / `is not None` verwenden",
  },
  QUALITY_E712: {
    explain:
      "Comparing to True/False with == — use the boolean directly (`if flag:` instead of `if flag == True:`).",
    explainDe:
      "Vergleich mit True/False über == — das Boolean direkt verwenden (`if flag:` statt `if flag == True:`).",
    fixDe: "Den Wahrheitswert direkt prüfen (`if flag:` statt `if flag == True:`)",
  },
  QUALITY_B006: {
    explain:
      "A mutable default argument (list/dict/set) is shared across every call of the function — mutations leak between invocations. Use None and create a fresh value inside.",
    explainDe:
      "Ein veränderliches Default-Argument (list/dict/set) teilen sich alle Aufrufe der Funktion — Änderungen lecken zwischen Aufrufen. None verwenden und den Wert innen frisch erzeugen.",
    fixDe: "Default auf None setzen und den Wert im Funktionskörper erzeugen",
  },
  INSTALL_HOOKS: {
    explain:
      "A lifecycle hook (preinstall/postinstall) runs automatically whenever someone installs this package — on their machine, in their build, with their credentials. This is the standard route by which a careless or compromised dependency executes code.",
    explainDe:
      "Ein Lifecycle-Hook (preinstall/postinstall) läuft automatisch bei jeder Installation dieses Pakets — auf fremden Rechnern, in deren Builds, mit deren Zugangsdaten. So führt eine nachlässige oder kompromittierte Abhängigkeit üblicherweise Code aus.",
    fixDe:
      "Statt eines Lifecycle-Hooks ein dokumentiertes Skript anbieten, damit die Einrichtung eine bewusste Handlung bleibt",
    cwe: "CWE-829",
    refUrl: "https://cwe.mitre.org/data/definitions/829.html",
  },
  CURL_PIPE_BASH: {
    explain:
      "A script is downloaded and executed in one step, so whatever the server returns that day runs with your privileges. A hijacked domain or a compromised server becomes code execution on this machine.",
    explainDe:
      "Ein Skript wird in einem Schritt heruntergeladen und ausgeführt — was der Server an dem Tag liefert, läuft mit deinen Rechten. Eine gekaperte Domain oder ein kompromittierter Server wird so zur Codeausführung auf dieser Maschine.",
    fixDe: "In eine Datei herunterladen, Prüfsumme oder Signatur verifizieren, dann ausführen",
    cwe: "CWE-494",
    refUrl: "https://cwe.mitre.org/data/definitions/494.html",
  },
  WORLD_WRITABLE: {
    explain:
      "The file or directory is writable by every user on the machine. Any local process can replace its content — a script, socket or config that something else executes becomes a path to running code as another user.",
    explainDe:
      "Die Datei oder das Verzeichnis ist für jeden Nutzer der Maschine schreibbar. Jeder lokale Prozess kann den Inhalt ersetzen — ein Skript, Socket oder eine Config, die etwas anderes ausführt, wird zum Weg, Code als anderer Nutzer zu starten.",
    fixDe:
      "Die engsten Rechte verwenden, die funktionieren (üblich: 755 für Verzeichnisse, 644 für Dateien)",
    cwe: "CWE-732",
    refUrl: "https://cwe.mitre.org/data/definitions/732.html",
  },
  TLS_VERIFICATION_DISABLED: {
    explain:
      "Certificate validation is switched off, so the connection no longer proves who is on the other end. Anything a network attacker can route through can read or change the traffic — including credentials and tokens.",
    explainDe:
      "Die Zertifikatsprüfung ist ausgeschaltet, die Verbindung weist nicht mehr nach, wer am anderen Ende steht. Alles, was ein Netz-Angreifer umleiten kann, liest oder verändert den Verkehr — samt Zugangsdaten und Tokens.",
    fixDe:
      "Das Zertifikat (oder den Trust-Store) reparieren; nie die Prüfung abschalten, damit ein Aufruf durchläuft",
    cwe: "CWE-295",
    refUrl: "https://cwe.mitre.org/data/definitions/295.html",
  },
  DESTRUCTIVE_COMMAND: {
    explain:
      "This deletes down the filesystem root or writes to a raw device. If the path above it is ever empty or unset, the command stops being a cleanup and destroys the machine it runs on.",
    explainDe:
      "Das löscht bis zur Dateisystem-Wurzel oder schreibt auf ein rohes Gerät. Ist der Pfad darüber je leer oder nicht gesetzt, hört der Befehl auf, Aufräumarbeit zu sein, und zerstört die Maschine, auf der er läuft.",
    fixDe:
      "Absolute oder nicht gesetzte Pfade vor dem Löschen ablehnen und nie aus einem Skript auf einen Geräteknoten schreiben",
  },
  SSRF: {
    explain:
      "A URL that arrived in the request is fetched by the server itself, so the caller decides where your process connects. From outside you only ever see the reply, but the target can be an internal service, a neighbour on the localhost, or the cloud provider's metadata endpoint — all of which trust a request because it came from inside. Take the target from an allowlist of hosts and schemes, refuse link-local and private addresses, and do not forward the response body to the caller.",
    explainDe:
      "Eine URL aus der Anfrage ruft der Server selbst ab, der Aufrufer bestimmt also, wohin dein Prozess sich verbindet. Von außen sieht man nur die Antwort, doch das Ziel kann ein interner Dienst sein, ein Nachbar auf dem localhost oder der Metadata-Endpunkt des Cloud-Anbieters — sie alle vertrauen der Anfrage, weil sie von innen kam. Das Ziel einer Positivliste von Hosts und Schemas entnehmen, Link-lokale und private Adressen ablehnen und den Antwort-Body nicht an den Aufrufer weiterreichen.",
    fixDe:
      "Das Ziel vor dem Abruf auflösen und gegen eine Positivliste von Schemas und Hosts prüfen",
    cwe: "CWE-918",
    refUrl: "https://cwe.mitre.org/data/definitions/918.html",
  },
  WEAK_RANDOMNESS: {
    explain:
      "Math.random() is a statistical generator, not a cryptographic one: its output is derived from its previous state, so seeing a few values lets an attacker predict the rest. That is fine for a jitter delay and fatal for anything meant to be unguessable — a reset token, a session id, a verification code — because the value is only a secret if nobody can compute it. Draw these from crypto.randomBytes() or crypto.randomUUID() instead.",
    explainDe:
      "Math.random() ist ein statistischer, kein kryptografischer Generator: Die Ausgabe folgt aus dem vorigen Zustand, ein paar gesehene Werte erlauben dem Angreifer, den Rest vorherzusagen. Für eine Jitter-Verzögerung ist das in Ordnung, für alles, was unerratbar sein soll — ein Reset-Token, eine Session-Id, ein Verifikationscode — fatal, denn der Wert ist nur geheim, solange ihn niemand berechnen kann. Solche Werte aus crypto.randomBytes() oder crypto.randomUUID() ziehen.",
    fixDe:
      "crypto.randomBytes() oder crypto.randomUUID() für Tokens, Sessions und Secrets verwenden",
    cwe: "CWE-330",
    refUrl: "https://cwe.mitre.org/data/definitions/330.html",
  },
  CORS: {
    explain:
      "Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true is a CORS misconfiguration. Browsers block JavaScript from reading the response to a credentialed cross-origin request with a wildcard origin; this combination does not demonstrate authenticated data exposure. For credentialed requests, return a specific origin from an allowlist and Vary: Origin when it varies. For public responses, omit credential support and send requests without credentials. CORS is not authentication or CSRF protection.",
    explainDe:
      "Access-Control-Allow-Origin: * zusammen mit Access-Control-Allow-Credentials: true ist eine CORS-Fehlkonfiguration. Browser verbieten JavaScript, die Antwort auf eine credentialed Cross-Origin-Anfrage mit Wildcard-Origin zu lesen; diese Kombination belegt keinen Zugriff auf authentifizierte Daten. Für credentialed Anfragen einen konkreten Origin aus einer Positivliste liefern und Vary: Origin setzen, wenn er variiert. Für öffentliche Antworten die Credential-Unterstützung weglassen und Anfragen ohne Credentials senden. CORS ist weder Authentifizierung noch CSRF-Schutz.",
    fixDe:
      "Einen konkreten, positivgelisteten Origin für credentialed Anfragen verwenden oder bei öffentlichen Antworten auf Credentials verzichten",
    cwe: "CWE-942",
    refUrl:
      "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSNotSupportingCredentials",
  },
};

export function knowledgeFor(type: string): FindingKnowledge {
  return (
    FINDING_KNOWLEDGE[type] ?? {
      explain: "Scanner flagged this construct as a potential security or quality issue.",
      explainDe:
        "Der Scanner hat dieses Konstrukt als mögliches Sicherheits- oder Qualitätsproblem markiert.",
    }
  );
}

export interface CodeSnippet {
  /** Up to 2 lines before the finding */
  before: string[];
  /** The flagged line */
  line: string;
  /** Up to 2 lines after the finding */
  after: string[];
  number: number;
}

const CONTEXT_LINES = 2;
const MAX_SNIPPET_LINE = 160;

/**
 * Build a small code frame around the flagged line (semgrep/ESLint codeframe
 * style) so every finding can show WHERE in the file the problem lives.
 */
export function buildSnippet(
  content: string | undefined,
  line: number,
  knownValues: readonly string[] = [],
): CodeSnippet | undefined {
  if (!content) return undefined;
  const lines = content.split("\n");
  const idx = Math.min(Math.max(line - 1, 0), lines.length - 1);
  const trim = (s: string): string => {
    // Mask complete values before clipping can turn them into unrecognisable fragments.
    const masked = maskSecretText(s, knownValues);
    return masked.length > MAX_SNIPPET_LINE ? `${masked.slice(0, MAX_SNIPPET_LINE)}…` : masked;
  };
  const before = lines.slice(Math.max(0, idx - CONTEXT_LINES), idx).map(trim);
  const flagged = trim(lines[idx] ?? "");
  const after = lines.slice(idx + 1, idx + 1 + CONTEXT_LINES).map(trim);
  if (flagged === undefined) return undefined;
  return { before, line: flagged, after, number: idx + 1 };
}

/**
 * Attach knowledge + code frame to issues, in place. Cheap and idempotent —
 * called by every adapter/facade merge that has the file content at hand.
 */
export function enrichIssues(issues: SecurityIssue[], content?: string): void {
  // Capture all matched values before masking consumes them, including neighbours.
  const knownValues = issues.flatMap((issue) => (issue.secretValue ? [issue.secretValue] : []));
  for (const issue of issues) {
    const knowledge = knowledgeFor(issue.type);
    if (!issue.explanation) {
      issue.explanation = knowledge.explain;
      if (knowledge.cwe) issue.cwe = knowledge.cwe;
      if (knowledge.refUrl) issue.refUrl = knowledge.refUrl;
    }
    // The German twin rides along whenever the curated entry has one — also for
    // findings whose explanation an adapter already wrote, so a German card
    // never depends on which engine found the thing. Old payloads without the
    // fields render exactly what they rendered before.
    if (!issue.explanationDe && knowledge.explainDe) issue.explanationDe = knowledge.explainDe;
    if (!issue.fixDe && knowledge.fixDe) issue.fixDe = knowledge.fixDe;
    // After the knowledge pass, because the category is derived from the CWE
    // this is the place that attaches.
    if (!issue.category) issue.category = categoryOf(issue.type, issue.cwe);
    if (content && issue.packageName && !issue.snippet) {
      const lines = content.split("\n");
      const needle = JSON.stringify(`node_modules/${issue.packageName}`);
      const row = lines.findIndex(
        (line, i) =>
          line.includes(needle) &&
          (!issue.packageVersion ||
            lines.slice(i, i + 5).some((l) => l.includes(JSON.stringify(issue.packageVersion)))),
      );
      if (row >= 0) issue.line = row + 1;
    }
    if (!issue.snippet && !issue.historyCommit && issue.provenance !== "gitleaks-history") {
      issue.snippet = buildSnippet(content, issue.line, knownValues);
    }
    // Also mask adapter-provided frames and non-secret findings beside a credential.
    maskIssueFrames(issue, knownValues);
  }
}
