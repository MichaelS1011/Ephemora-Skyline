"use strict";
/**
 * Spielzeug-"Datenbank" für die Übung: kein echtes SQL, aber die Aufrufe
 * sehen aus wie bei einer echten Datenbank. So lernen die Lernenden,
 * gefährliche Muster im Code zu erkennen, ohne eine DB zu brauchen.
 */
const PRODUKTE = [
  { id: 1, name: "Tastatur", preis: 39.9 },
  { id: 2, name: "Maus", preis: 19.9 },
  { id: 3, name: "Monitorstaender", preis: 24.5 },
  { id: 4, name: "Webcam", preis: 29.0 },
];

function runQuery(sql) {
  // Nachbau einer DB-Abfrage: holt den Wert hinter dem letzten Gleichzeichen
  // heraus und filtert die Liste — grob, aber für die Übung reicht das.
  const match = /= '([^']*)'/.exec(sql);
  const needle = match ? match[1].toLowerCase() : "";
  return PRODUKTE.filter((p) => p.name.toLowerCase() === needle);
}

// ACHTUNG (absichtlich): Der SQL-Text wird aus Nutzereingaben zusammengebaut.
function searchProducts(keyword) {
  const sql = "SELECT * FROM products WHERE name = '" + keyword + "'";
  return runQuery(sql);
}

module.exports = { searchProducts, runQuery };
