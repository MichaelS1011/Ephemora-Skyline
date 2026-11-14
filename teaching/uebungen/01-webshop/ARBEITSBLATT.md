# Arbeitsblatt 01 — Mini-Webshop (Node.js)

**Niveau:** Sekundarstufe II / Berufsschule / Uni-Einführung · **Zeit:** ca. 45 Minuten · **Sprache:** JavaScript (Node.js, ohne Framework)

Dieses Verzeichnis enthält einen kleinen Demo-Webshop: ein HTTP-Server (`server.js`),
Produkt-/Suchcode (`src/db.js`), Anmeldung (`src/auth.js`), Rechenhilfe (`src/utils.js`)
und vier Routen unter `routes/`. Er ist absichtlich unsicher gebaut — sechs Stellen
warten darauf, gefunden zu werden.

> **Wichtig:** Der Shop ist Lernmaterial. Die Zugangsdaten sind erfunden
> (`demo-not-a-real-key-…`), es laufen keine echten Zahlungen, und der Server
> antwortet nur auf `127.0.0.1`. Nichts davon ins Internet stellen.

## Lernziele

Die Lernenden

1. finden selbstständig sicherheitsrelevante Stellen in echtem (wenn auch kleinem) Quelltext,
2. erklären in eigenen Worten, _warum_ jede Stelle problematisch ist und _was_ eine
   Angreiferin damit anstellen könnte,
3. lernen den Scanner als Werkzeug kennen: eigene Analyse eines Ordners, Befundliste lesen,
   Befunde mit Urteil versehen.

## Ablauf

1. **Ordner öffnen** (`teaching/uebungen/01-webshop`) und 5 Minuten nur lesen:
   Welche Datei macht was? Wo kommt Nutzereingabe herein (`req.query`, `req.headers`)?
2. **Scannen:** Ephemora Skyline starten (`npm start` im Projektstamm, dann
   <http://127.0.0.1:4173>), über „Ordner analysieren“ diesen Übungsordner auswählen.
   Alternativ darf zuerst ohne Scanner gesucht werden (Blintherausforderung, siehe Lehrkraft-Teil).
3. **Vergleichen:** Befunde der Reihe nach ansehen. Für jeden Befund notieren:
   Datei, Zeile, was dort passiert, was eine Angreiferin damit könnte.
4. **Urteilen:** Im Panel jedes Ergebnis mit einem Urteil versehen (z. B. „echtes Problem“).
5. **Diskutieren:** Welche der sechs Stellen wäre im echten Betrieb am schlimmsten? Warum?

Tipp: Der Scanner meldet manchmal auch Dinge, die nicht zu den sechs gesuchten Stellen
gehören (z. B. `console.log`-Aufrufe). Entscheide selbst, ob ein Befund ein echtes
Problem ist — auch das ist eine Kernfähigkeit in der Sicherheitsarbeit.

## Hint-Leiter (erst schauen, wenn es klemmt)

Jede Stufe nennt nur eine Richtung, nie die Lösung.

| #   | Datei                | Hinweis (Deutsch)                                                                                |
| --- | -------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | `src/db.js`          | Wie entsteht der Abfrage-Text aus dem, was Kundinnen und Kunden eintippen?                       |
| 2   | `src/utils.js`       | Ein Helfer rechnet eine Formel aus. Wie wird daraus Text zu einem Ergebnis?                      |
| 3   | `src/auth.js`        | Oben in der Datei steht etwas, das nicht im Quelltext mitreisen sollte.                          |
| 4   | `src/auth.js`        | Auf welchen Algorithmus setzt der Passwort-Helfer — und gilt er noch als stark?                  |
| 5   | `routes/download.js` | Die Kundschaft nennt die Datei. Was passiert bei einem Namen wie `../../etc/passwd`?             |
| 6   | `routes/tools.js`    | Die Route bittet das Betriebssystem um Hilfe. Welcher Teil der Anfrage landet in diesem Auftrag? |

## Reflexionsfragen

1. Welche der sechs Stellen hat die _größte_ Auswirkung, wenn sie ausgenutzt wird — und welche die kleinste? Begründe.
2. Mehrere Stellen haben dasselbe Muster: Nutzereingabe landet ungeprüft in einem „Auftrag“
   (an die Datenbank, ans Betriebssystem, an den Code-Interpreter). Nenne das Muster in eigenen Worten.
3. Warum ist ein „geheimer“ Wert im Quelltext auch dann ein Problem, wenn niemand ihn „sieht“?
4. Der Scanner hat alle sechs Stellen gefunden. Heißt das, der Shop ist jetzt sicher? Was kann ein Scanner _nicht_ finden?

---

## Lehrkraft-Teil (Lösung)

> **Blind-Variante:** Für die Blintherausforderung den Ordner **ohne**
> `.skyline-uebung.json` austeilen (Datei vorher entfernen oder eine Kopie ohne sie
> anlegen); in der Übungsphase darf die Datei bleiben — das Hinweis-Panel zeigt daraus
> nur Hinweise zu noch nicht gefundenen Stellen, niemals Fundorte.

### Lösungstabelle

| #   | Datei:Zeile             | Befundtyp (Scanner)       | Punkte |
| --- | ----------------------- | ------------------------- | ------ |
| 1   | `src/db.js:24`          | `SQL_INJECTION`           | 20     |
| 2   | `src/utils.js:7`        | `EVAL_USAGE`              | 20     |
| 3   | `src/auth.js:7`         | `HARDCODED_SECRET`        | 15     |
| 4   | `src/auth.js:16`        | `EPHEMORA_NODE_WEAK_HASH` | 15     |
| 5   | `routes/download.js:10` | `PATH_TRAVERSAL`          | 15     |
| 6   | `routes/tools.js:10`    | `CMD_INJECTION`           | 20     |

Summe: 105 Punkte. Die Antwortliste liegt in `.skyline-uebung.json`
(`schema: ephemora.exercise-key.v1`); Zeilen dürfen um ±6 abweichen.

### Was, warum, wie beheben

**1 · `src/db.js:24` — SQL Injection.**
_Was:_ Der Suchbegriff wird per Zeichenkette in ein SQL-Statement gebaut
(`"SELECT … WHERE name = '" + keyword + "'").
*Warum:* Wer `' OR '1'='1` eingibt, verändert die Abfrage und kann an Daten kommen,
die für ihn nicht bestimmt sind.
*Beheben:* Parametrisierte Abfragen — Platzhalter (`?`) und Werte als getrenntes
Argument an die Datenbank-Treiber-API übergeben, niemals zusammengesetzte SQL-Texte.

**2 · `src/utils.js:7` — Code-Ausführung mit `eval`.**
_Was:_ Die Kassensummen-Formel wird als Text direkt an `eval()` übergeben.
_Warum:_ `eval` führt beliebigen JavaScript-Code aus — wer
`process.exit()` oder Ähnliches als „Formel“ schickt, steuert den Server.
_Beheben:_ Formeln mit einem Parser mit festem Funktionsumfang auswerten
(eigener kleiner Tokenizer oder geprüfte Whitelist) — `eval` entfernen.

**3 · `src/auth.js:7` — Geheimnis im Quelltext.**
_Was:_ Das Admin-Token steht als Klartext im Code.
_Warum:_ Wer den Code liest (Repository, Backup, Weitergabe), hat das Token.
Aus Quelltext kommt man Secrets nicht mehr sauber heraus („weggelöschte“ Historie).
_Beheben:_ Secret zur Laufzeit aus Umgebung/Vault lesen (`process.env`), im Repository
nur Platzhalter; vergebene Tokens rotieren. (Das Demo-Token ist erfunden — das Muster ist echt.)

**4 · `src/auth.js:16` — Schwacher Hash.**
_Was:_ Passwörter werden mit MD5 gehasht.
_Warum:_ MD5 ist für Integrität gebrochen und viel zu schnell — Hashlisten sind damit
in Minuten durchprobiert.
_Beheben:_ Für Passwörter bewusst langsame Speicher-hash-Verfahren (scrypt, bcrypt,
argon2) mit Salt; MD5/SHA-1 nur noch für harmlose Prüfsummen.
_Scanner-Hinweis:_ Dieser Typ kommt aus dem mitgelieferten Regelpaket
(`ephemora-node-weak-hash`); es läuft im eingebauten Kanal, ein installiertes
semgrep meldet denselben Befund zusätzlich (Deduplizierung hält einen zurück).

**5 · `routes/download.js:10` — Pfad-Traversierung.**
_Was:_ Der Dateiname aus `req.query.file` wird direkt an `path.join(UPLOAD_DIR, …)`
und `fs.readFileSync` gereicht.
_Warum:_ Mit `../../` verlässt die Anfrage den Upload-Ordner und liest beliebige Dateien
des Servers.
_Beheben:_ Pfad auflösen (`path.resolve`) und prüfen, dass er innerhalb des
Upload-Verzeichnisses bleibt; Dateinamen auf ein erlaubtes Muster prüfen.

**6 · `routes/tools.js:10` — Befehls-Injection.**
_Was:_ Ein `convert`-Aufruf wird als Text zusammengesetzt und an `exec()` übergeben;
der Dateiname stammt (über die Route) von außen.
_Warum:_ `; rm -rf …`-artige Eingaben führen zusätzliche Betriebssystembefehle aus.
_Beheben:_ `execFile`/`spawn` mit Argumentliste ohne Shell verwenden; Eingaben streng
validieren.

### Einordnung für den Unterricht

- Drei der sechs Stellen sind Injektionsmuster (SQL, OS-Befehl, Code) — gut, um das
  gemeinsame Prinzip „Daten werden als Befehl interpretiert“ zu erarbeiten.
- Diskutiert nach der Lösung, dass der Code an vielen Stellen _bewusst sauber_ ist
  (z. B. überall `===` statt `==`) — wer weitere Stellen meldet, sollte das Urteil
  begründen können; und warum ein grüner Scanner-Report keine Sicherheitsgarantie ist
  (Reflexionsfrage 4).

---

## English section

**Level:** upper secondary / intro university · **Time:** ~45 minutes

This folder is a deliberately vulnerable demo webshop in plain Node.js. Six issues are
planted and meant to be found — by reading, by scanning with Ephemora Skyline
(start it with `npm start`, open <http://127.0.0.1:4173>, choose „Ordner analysieren“
on this folder), or both. All credentials in the code are invented
(`demo-not-a-real-key-…`); the server binds to `127.0.0.1` only.

**Learning goals:** find security issues in real source code; explain impact in your own
words; use the scanner as a tool (scan a folder, read the finding list, attach verdicts).

**Flow:** read the code (5 min) → scan → compare your list with the findings → write down
for each finding: file, line, what happens, attacker impact → set a verdict in the panel
→ discuss which issue is worst in production and why.

The scanner also reports things that are not part of the six (e.g. `console.log`).
Deciding whether a finding is real is itself a core skill.

**Hint ladder (the short version):** (1) `src/db.js` — how is the query text assembled
from user input? (2) `src/utils.js` — how does text become a computed result?
(3) `src/auth.js` top — what should not travel inside source code? (4) `src/auth.js`
password helper — which algorithm, still strong? (5) `routes/download.js` — what if the
file name is `../../etc/passwd`? (6) `routes/tools.js` — which part of the request ends
up in the command sent to the operating system?

**Teacher section:** the solution table and per-issue what/why/fix are above (German);
the answer key is `.skyline-uebung.json`. For a blind challenge hand out the folder
**without** `.skyline-uebung.json`; keep it in for the practice phase — the hint panel
only shows hints for not-yet-found items, never locations. Items 1–3, 5 and 6 are found
by the always-on built-in channels; item 4 (`EPHEMORA_NODE_WEAK_HASH`) comes from the
shipped rule pack running in the in-process channel (an installed semgrep reports the
same finding, deduplicated to one).
