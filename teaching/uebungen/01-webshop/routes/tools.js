"use strict";
/** Miniaturbilder für Produktfotos (benötigt ImageMagicks `convert`). */
const { exec } = require("child_process");

// ACHTUNG (absichtlich): der Dateiname aus dem Query-String wandert direkt
// in einen Shell-Befehl — Anführungszeichen und Sonderzeichen egal.
function handleThumb(req, send) {
  const file = req.query.file ?? "platzhalter.png";
  const cmd = "convert " + file + " -resize 200x200 thumbs/" + file;
  exec(cmd, (err) => {
    if (err) return send(500, { fehler: "Umwandlung fehlgeschlagen" });
    send(200, { datei: file, status: "klein" });
  });
}

module.exports = { handleThumb };
