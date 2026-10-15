// Regeln-Lane fixture — path traversal (CWE-22) through user input, plus the
// lines the rule must leave alone. A future lane re-measures S3 from this file
// without needing the temporary corpus folders under /tmp.
const fs = require("fs");
const path = require("path");

// 1. MUST FIRE: user input concatenated into the path, no literal '../' anywhere
//    (this is the exact shape of sec-critical/src/vulns.js:13)
function readFileHandler(req, res) {
  const data = fs.readFileSync("/var/data/" + req.query.name);
  res.send(data);
}

// 2. MUST FIRE: the same flow through a write and a stream call
function saveUpload(req) {
  fs.writeFileSync("/var/uploads/" + req.body.filename, req.body.data);
}
function streamOut(req) {
  return fs.createReadStream(path.join("/srv/files", req.params.file));
}

// 3. MUST FIRE: climbing segment as a supporting signal
function legacyClone(req) {
  return fs.readFile("/tmp/" + req.query.p + "/../../etc/passwd", "utf8");
}

// MUST NOT FIRE: fixed paths, no user input in the call
const pkg = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
function serveIndex(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
}
// MUST NOT FIRE: an import-time relative specifier is not a traversal
const helpers = require("./helpers/privateStaging");
module.exports = { readFileHandler, saveUpload, streamOut, legacyClone, pkg, serveIndex, helpers };
