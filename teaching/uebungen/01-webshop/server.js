"use strict";
/**
 * Mini-Webshop für den Unterricht (Übung 1).
 *
 * Bewusst ohne npm-Abhängigkeiten: nur Node-Bordmittel, damit
 * `node server.js` ohne Installation läuft.
 *
 * Das hier ist eine Lernumgebung: Einige Stellen sind absichtlich
 * fehlerhaft, damit der Ephemora-Skyline-Scanner sie findet. Die Auflösung
 * liegt für die Lehrkraft in .skyline-uebung.json — für die Blindvariante
 * der Ordner ohne diese Datei verteilen (siehe ARBEITSBLATT.md).
 */
const http = require("http");
const { handleSearch } = require("./routes/search");
const { handleDownload } = require("./routes/download");
const { handleThumb } = require("./routes/tools");
const { handleCheckout } = require("./routes/checkout");
const { handleLogin } = require("./src/auth");

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  req.query = Object.fromEntries(url.searchParams);

  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/api/search") return handleSearch(req, send);
  if (url.pathname === "/api/download") return handleDownload(req, send);
  if (url.pathname === "/api/thumb") return handleThumb(req, send);
  if (url.pathname === "/api/checkout") return handleCheckout(req, send);
  if (url.pathname === "/api/login") return handleLogin(req, send);
  send(404, { error: "unbekannter Pfad" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Webshop läuft auf http://127.0.0.1:${PORT}`);
});
