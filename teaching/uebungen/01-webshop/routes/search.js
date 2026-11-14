"use strict";
/** Produktsuche: /api/search?q=... */
const db = require("../src/db");

function handleSearch(req, send) {
  const keyword = req.query.q ?? "";
  const products = db.searchProducts(keyword);
  send(200, { anzahl: products.length, produkte: products });
}

module.exports = { handleSearch };
