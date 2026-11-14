"use strict";
/** "Rabattrechner": Die Kundenformel wird mit utils.calcTotal ausgewertet. */
const { calcTotal } = require("../src/utils");

function handleCheckout(req, send) {
  const formel = req.query.formel ?? "0";
  send(200, { summe: calcTotal(formel) });
}

module.exports = { handleCheckout };
