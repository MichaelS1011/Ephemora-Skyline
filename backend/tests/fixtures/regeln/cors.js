// Regeln-Lane fixture — wildcard CORS combined with credentials (CWE-942).
// Mirrors sec-subtle/src/subtle.js:37-38.
app.use((req, res, next) => {
  // MUST FIRE: the wildcard origin line, credentials in the same block
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

const proxyConfig = {
  // MUST FIRE: the same pair in an object configuration
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
};

// MUST NOT FIRE: a wildcard alone — the finding is the wildcard PAIRED with
// credentials, and this origin is far away from any credentials setting.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // wildcard alone, no credentials

  next();
});

const safeConfig = {
  // MUST NOT FIRE: credentialed, but the origin is an allowlisted host
  "Access-Control-Allow-Origin": "https://app.example",
  "Access-Control-Allow-Credentials": true,
};

module.exports = { proxyConfig, safeConfig };
