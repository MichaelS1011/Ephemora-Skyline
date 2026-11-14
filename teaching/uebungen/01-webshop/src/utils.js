"use strict";
/** Hilfsfunktionen für Warenkorb und "Rabattrechner". */

// ACHTUNG (absichtlich): Kunden dürfen ihre eigene Rabattformel als Text
// mitschicken — und der Server rechnet sie mit eval() aus.
function calcTotal(expr) {
  return eval(expr);
}

// Gegenbeispiel (sauber): HTML wird escaped, bevor es irgendwo eingefügt wird.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

module.exports = { calcTotal, escapeHtml };
