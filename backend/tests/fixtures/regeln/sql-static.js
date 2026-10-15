// Regeln-Lane fixture — the SQL rule must judge whether the query is actually
// being built, not whether a SELECT appears in a quote.
const { query, execute } = require("./db");

// MUST FIRE: concatenation with a request value (sec-critical/src/vulns.js:6)
function getUser(req, res) {
  const sql = "SELECT * FROM accounts WHERE id = '" + req.params.id + "'";
  return query(sql, (err, rows) => res.json(rows));
}

// MUST FIRE: interpolation of a variable inside the template literal
function search(req) {
  return execute(`SELECT id FROM users WHERE name = ${req.query.name}`);
}

// MUST FIRE: target/src/db.js:5 shape, the variable is the input
function loadUser(id) {
  return query("SELECT * FROM users WHERE id = " + id);
}

// MUST NOT FIRE: a quoted constant with no interpolation at all
// (this is the shipped P0 false alarm, sec-false-positive-bait/src/bait.js:14)
const metricsQuery = `SELECT COUNT(*) FROM metrics LIMIT 10`;

// MUST NOT FIRE: parameterised, and constant besides
const SAFE_SQL = "SELECT name FROM widgets WHERE kind = ?";
db.execute(SAFE_SQL, [kind]);

// MUST NOT FIRE: prose that only names the shape
const DOC = "the report table runs SELECT COUNT(*) FROM metrics LIMIT 10 on a timer";

module.exports = { getUser, search, loadUser, metricsQuery, SAFE_SQL, DOC };
