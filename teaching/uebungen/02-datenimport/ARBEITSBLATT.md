# Arbeitsblatt 02 — Datenimport-Pipeline (Python)

**Niveau:** Sekundarstufe II / Uni-Einführung (Vorkenntnis Python-Grundlagen hilfreich) ·
**Zeit:** ca. 45 Minuten · **Sprache:** Python 3 (Standardbibliothek + `requests`)

Ein kleines Import-Programm liest CSV- und Pickle-Dateien, holt eine Liste von einem
Demo-Feed und packt Archive: `loader.py` (Daten laden), `api_client.py` (Netzwerk),
`report.py` (Bericht — absichtlich sauber), `config.ini` und `data/imports.csv`.
Fünf Stellen sind absichtlich unsicher gebaut.

> **Wichtig:** Lernmaterial. Alle Zugangsdaten sind erfunden (`demo-nicht-echt-…`),
> die Feed-Adresse existiert nicht wirklich, und nichts davon auf echte Daten oder
> Systeme loslassen.

## Lernziele

Die Lernenden

1. übertragen das Muster „Nutzereingabe wird als Befehl interpretiert“ auf Python,
2. verstehen, warum Deserialisierung (`pickle`) Vertrauensbruch sein kann,
3. erkennen, dass `verify=False` und Secrets im Code häufige Praxisfehler sind,
4. erleben, dass verschiedene Prüfkanäle unterschiedliche Dinge finden (Gespräch über
   Scanner-Architektur: eingebaute Regeln vs. optionale Werkzeuge).

## Ablauf

1. **Ordner öffnen** (`teaching/uebungen/02-datenimport`) und lesen: Wo kommen Daten von
   außen herein (CSV-Datei, Pickle-Datei, Netzwerk, Funktionsargumente)?
2. **Scannen:** Ephemora Skyline starten (`npm start` im Projektstamm →
   <http://127.0.0.1:4173>), diesen Übungsordner analysieren lassen.
3. **Vergleichen und notieren:** pro Befund — Datei, Zeile, was passiert, was könnte
   eine Angreiferin damit?
4. **Urteilen:** jedes Ergebnis im Panel mit einem Urteil versehen.
5. **Diskutieren:** `report.py` ist sauber. Woran erkennt man „unauffälligen“ Code, und
   warum gehört eine saubere Datei in eine Übung?

Hinweis: Wenn auf dem Rechner zusätzliche Prüfwerkzeuge installiert sind (semgrep,
ruff, gitleaks), erscheinen **mehr** Meldungen als die gesuchten fünf — z. B. zu MD5
oder zur `http://`-Feed-Adresse. Das sind keine Fehler: verschiedene Kanäle,
verschiedene Blickwinkel. Welche Meldung gehört zu welcher Stelle?

## Hint-Leiter (erst schauen, wenn es klemmt)

| #   | Datei           | Hinweis (Deutsch)                                                                                                                                   |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `loader.py`     | Eine Abfrage wird aus Text zusammengesetzt, bevor sie zur Datenbank geht. Was landet in den geschweiften Klammern?                                  |
| 2   | `loader.py`     | Ein gespeicherter Import-Zustand wird aus einer Datei wiederhergestellt. Welchem Format wird vertraut — und wer könnte die Datei geschrieben haben? |
| 3   | `api_client.py` | Die Datei redet mit einem anderen Rechner. Ein Schlüsselwort-Schalter schwächt die Schutzschicht des Gesprächs.                                     |
| 4   | `api_client.py` | Ganz oben steht etwas, das Zugang irgendwohin gibt.                                                                                                 |
| 5   | `api_client.py` | Das Programm bittet das Betriebssystem, ein Archiv zu packen. Der Archivname kommt nicht nur aus dem Code.                                          |

## Reflexionsfragen

1. `pickle` ist praktisch. Warum ist `pickle.loads` auf eine fremde Datei in etwa so
   riskant wie fremden Code ausführen?
2. `verify=False` steht oft in Tutorials mit dem Kommentar „damit es funktioniert“.
   Was genau geht verloren, wenn man es einschaltet?
3. In dieser Übung finden eingebaute Regeln vier der fünf Stellen, die fünfte braucht
   ein zusätzliches Prüfwerkzeug. Was folgt daraus für die Aussage „der Scanner hat
   nichts gefunden“?
4. `config.ini` enthält keine Secrets. Warum ist `config.ini` trotzdem der schlechteste
   Ort für welche — und wo ist der beste?

---

## Lehrkraft-Teil (Lösung)

> **Blind-Variante:** Für die Blintherausforderung den Ordner **ohne**
> `.skyline-uebung.json` austeilen (Datei vorher entfernen oder eine Kopie ohne sie
> anlegen); in der Übungsphase darf die Datei bleiben — das Hinweis-Panel zeigt daraus
> nur Hinweise zu noch nicht gefundenen Stellen, niemals Fundorte.

### Lösungstabelle

| #   | Datei:Zeile        | Befundtyp (Scanner)         | Punkte | Einge-baut?      |
| --- | ------------------ | --------------------------- | ------ | ---------------- |
| 1   | `loader.py:22`     | `SQL_INJECTION`             | 20     | ja               |
| 2   | `loader.py:35`     | `UNSAFE_DESERIALIZATION`    | 20     | ja               |
| 3   | `api_client.py:17` | `TLS_VERIFICATION_DISABLED` | 15     | ja               |
| 4   | `api_client.py:11` | `HARDCODED_SECRET`          | 15     | ja               |
| 5   | `api_client.py:24` | `CMD_INJECTION`             | 20     | nur mit semgrep* |

Summe: 90 Punkte. Antwortliste: `.skyline-uebung.json`
(`schema: ephemora.exercise-key.v1`), Zeilen ±6.

\* Die `os.system(f"…")`-Stelle meldet das mitgelieferte Regelpaket
(`ephemora-python-command-injection`); dessen Python-Regeln laufen über das optional
installierte Werkzeug semgrep, nicht im eingebauten Kanal. Ohne semgrep auf dem
Rechner bleibt diese Stelle im Report unsichtbar — ein guter Aufhänger für
Reflexionsfrage 3. (Empirisch geprüft: ohne alle optionalen Werkzeuge meldet der
Scanner diese Übung mit exakt den Befunden 1–4.)

### Was, warum, wie beheben

**1 · `loader.py:22` — SQL Injection.**
_Was:_ Die SQLite-Abfrage wird als String zusammengemischt
(`f"SELECT … WHERE quelle = '{quelle}'"`), `quelle` kommt von außen.
_Warum:_ `' OR '1'='1` in der Quelle verändert die Abfrage; bei Datenbanken mit
Schreibrechten reicht das bis zu Manipulation/Abluss.
_Beheben:_ Parameterübergabe — `cur.execute("SELECT … WHERE quelle = ?", (quelle,))`;
die Treiberschicht hält Wert und Befehl getrennt.

**2 · `loader.py:35` — Unsichere Deserialisierung.**
_Was:_ `pickle.loads(fh.read())` auf einer Datei, die von außen kommen kann.
_Warum:_ Pickle führt beim Entladen beliebigen Code aus — eine präparierte Datei ist
ein Ausführbarkeits-Boom.
_Beheben:_ Datenformate ohne Code-Ausführung (JSON mit Schema-Prüfung); Pickle nur für
selbsterzeugte, vertrauenswürdige Zustände.

**3 · `api_client.py:17` — TLS-Prüfung abgeschaltet.**
_Was:_ `requests.get(FEED_URL, verify=False)`.
_Warum:_ Das Zertifikat wird nicht mehr geprüft — wer im Netz mithört oder umleitet,
kann sich als Demo-Feed ausgeben; der Verkehr ist nicht mehr vertrauenswürdig.
_Beheben:_ `verify` weglassen (Standard: prüfen); bei Selbstsignierung das eigene
Zertifikat hinterlegen, nicht die Prüfung abschalten.
_Scanner-Hinweis:_ Mit installiertem semgrep erscheint auf derselben Zeile ein zweiter
Befund (`EPHEMORA_PYTHON_TLS_VERIFICATION_DISABLED`) — dieselbe Stelle, anderer Kanal.
Gut, um Deduplizierung und „Kanäle ≠ doppelte Arbeit“ zu besprechen.

**4 · `api_client.py:11` — Secret im Quelltext.**
_Was:_ `API_TOKEN = "demo-nicht-echt-4f7c1"` im Code.
_Warum:_ Code wird geteilt, gespiegelt, versioniert — das Token wandert mit.
_Beheben:_ Aus Umgebung/Vault zur Laufzeit lesen (`os.environ`), Tokens rotieren.
(Der Wert ist erfunden.)

**5 · `api_client.py:24` — Befehls-Injection.**
_Was:_ `os.system(f"tar -czf archive/{name}.tar.gz uploads/{name}")` mit extern
beeinflusstem `name`.
_Warum:_ In einem `os.system`-String sind `;`, `` ` `` und `$()` Betriebssystem-Steuerung —
wer `x; rm -rf …` als Namen schickt, führt zusätzliche Befehle aus.
_Beheben:_ `subprocess.run(["tar", "-czf", ziel, quelle], shell=False)` mit
Argumentliste; Namen validieren (oder besser: `shutil.make_archive`).

### Zusätzliche Meldungen (nur mit installierten Zusatz-Werkzeugen)

| Stelle                                 | Meldung                                                                        | Kanal          | Einordnung                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader.py:41` (`hashlib.md5`)         | `EPHEMORA_PYTHON_WEAK_HASH` (semgrep) und `WEAK_CRYPTO`/`SECURITY_S324` (ruff) | semgrep / ruff | **Diskussionsfall**, nicht in der Punkte­liste: MD5 für Prüfsummen ist harmlos, für Passwörter fatal. Wann ist es hier was?                                          |
| `api_client.py:11`                     | `SECURITY_S105` (ruff)                                                         | ruff           | derselbe Fund wie #4, anderer Kanal                                                                                                                                  |
| `api_client.py:17`                     | `SECURITY_S501` (ruff), `EPHEMORA_PYTHON_TLS_VERIFICATION_DISABLED` (semgrep)  | ruff / semgrep | derselbe Fund wie #3                                                                                                                                                 |
| `loader.py:35`                         | `SECURITY_S301` (ruff)                                                         | ruff           | derselbe Fund wie #2                                                                                                                                                 |
| `api_client.py:13/17` (`http://`-Feed) | keine automatische Meldung                                                     | —              | **Diskussionsfall:** Klartext-HTTP für einen Feed ist ein Praxisproblem, das diese eingebauten Regeln für Python nicht melden. Finden es die Lernenden ohne Meldung? |

### Einordnung für den Unterricht

- Übung 01 und 02 bewusst gemischt arbeiten (JS + Python): Die Injektions-Muster
  (1, 5) sind dieselben wie im Webshop — Sprache und Bibliothek wechseln, das Muster bleibt.
- Die „Kanäle“-Tabelle ist der Einstieg in die Frage, was ein Scanner ist: eingebaute
  Muster, ein Regelpaket und optionale Werkzeuge — und warum „nichts gefunden“ selten
  „nichts da“ heißt.

---

## English section

**Level:** upper secondary / intro university (basic Python helps) · **Time:** ~45 minutes

A small Python import pipeline: `loader.py` (CSV/pickle loading), `api_client.py`
(network + archiving), `report.py` (deliberately clean), plus `config.ini` and
`data/imports.csv`. Five issues are planted; all credentials are invented
(`demo-nicht-echt-…`), the feed URL is not real, and nothing should be run against
real data or systems.

**Flow:** read the code → scan this folder with Ephemora Skyline (`npm start` in the
project root → <http://127.0.0.1:4173>) → compare, note impact per finding → set
verdicts → discuss why a clean file (`report.py`) belongs in the exercise.

**Solutions (details above, German):** (1) `loader.py:22` SQL injection via f-string
query → use parameters; (2) `loader.py:35` `pickle.loads` on an external file → JSON
with schema checks; (3) `api_client.py:17` `verify=False` → keep certificate
verification on; (4) `api_client.py:11` token in source → read from environment at
runtime; (5) `api_client.py:24` `os.system(f"tar …")` → `subprocess.run` with an
argument list. Answer key: `.skyline-uebung.json`; lines ±6.

**Engine honesty:** items 1–4 are found by the always-on built-in channels; item 5 is
reported by the shipped rule pack through the optional semgrep integration — without
semgrep installed it stays invisible (verified: a scan with all optional tools
disabled reports exactly items 1–4). With semgrep/ruff installed you will also see
the MD5 checksum at `loader.py:41` (discussion case, not in the point list), the
http-feed URL (not flagged by the built-in channels for Python), and duplicate
findings of items 2–4 from the other channels.
