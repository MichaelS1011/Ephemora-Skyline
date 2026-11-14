"use strict";
/** Download von Anhang-Dateien aus dem uploads-Ordner: /api/download?file=... */
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// ACHTUNG (absichtlich): der Dateiname kommt ungeprüft aus dem Query-String.
function handleDownload(req, send) {
  const content = fs.readFileSync(path.join(UPLOAD_DIR, req.query.file ?? "README.txt"), "utf8");
  send(200, { datei: req.query.file ?? "README.txt", inhalt: content });
}

module.exports = { handleDownload };
