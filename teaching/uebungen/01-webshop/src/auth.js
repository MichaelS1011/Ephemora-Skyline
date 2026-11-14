"use strict";
/** Anmeldung und Admin-Zugang für den Mini-Webshop. */
const crypto = require("crypto");

// ACHTUNG (absichtlich): Zugangsdaten im Quelltext statt in einer .env-Datei.
// Nur für die Übung erfunden — kein echter Schlüssel.
const ADMIN_API_TOKEN = "demo-not-a-real-key-9f3k2";

// Gegenbeispiel (sauber): das Demo-Passwort liegt nicht als Klartext im Code.
const NUTZER = [{ name: "sven", passHash: hashPassword("demo-nicht-echt") }];

// ACHTUNG (absichtlich): MD5 ist für Passwörter längst gebrochen.
function hashPassword(passwort) {
  return crypto.createHash("md5").update(passwort).digest("hex");
}

function handleLogin(req, send) {
  const name = req.query.user ?? "";
  const passwort = req.query.passwort ?? "";
  const fund = NUTZER.find((n) => n.name === name && n.passHash === hashPassword(passwort));
  if (!fund) return send(401, { ok: false });
  send(200, { ok: true, rolle: "kunde" });
}

function istAdmin(req) {
  return req.headers["x-admin-token"] === ADMIN_API_TOKEN;
}

module.exports = { handleLogin, istAdmin, hashPassword };
