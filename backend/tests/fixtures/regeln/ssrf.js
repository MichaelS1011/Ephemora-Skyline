// Regeln-Lane fixture — server-side request forgery (CWE-918): the URL is taken
// straight from the request. Mirrors sec-subtle/src/subtle.js:13.
exports.preview = async (req, res) => {
  // MUST FIRE: the fetched URL is user input
  const resp = await fetch(req.body.url);
  res.send(await resp.text());
};

exports.probe = (req, res) => {
  // MUST FIRE: same flow through http.get and axios
  https.get(req.query.target, () => {});
  axios.post(req.params.hook, payload);
};

// MUST NOT FIRE: fixed URLs and a config object are not request-fed
exports.health = (req, res) => {
  fetch("/api/health");
  axios.get(config.url);
  https.get("https://status.example/ping");
};
