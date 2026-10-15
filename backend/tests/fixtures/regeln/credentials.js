// Regeln-Lane fixture — credential literal in ordinary source (CWE-798).
// gitleaks is silent on the first one and the regex layer had no always-on rule
// for it at all; this file is the re-measurable source of that gap.
const mysql = require("mysql2");

const DB_PASSWORD = "Sup3rS3cretPg!"; // mirrors sec-critical/src/vulns.js:24

const awsCreds = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

const session = {
  api_key: "sk-live-1234567890abcdefghijklmnop",
};

// MUST NOT FIRE: labels, placeholders and env reads are not credentials
const password = "password-field-selector"; // the shipped bait, sec-false-positive-bait/src/bait.js:8
const loginHint = "changeme";
const cfg = { secret: "example", token: "placeholder-value" };
const fromEnv = { password: process.env.DB_PASSWORD, token: `${process.env.JWT_SECRET}` };
const shortOrEmpty = { token: "", key: "abc123" };

function connect() {
  return mysql.createConnection({ password: DB_PASSWORD });
}

// Provider-prefix form (rule 4): the value shape alone is the finding, no
// credential keyword needed — line 9 (AKIA…) above is its firing case, and it
// must be classified as the vendor-documented example, never shouted as P0.

// MUST NOT FIRE: key-format documentation and a bare prefix are not keys
const awsKeyFormat = "AKIA followed by 16 uppercase letters or digits";
const slackShape = "xoxb-";

module.exports = {
  DB_PASSWORD,
  awsCreds,
  session,
  password,
  loginHint,
  cfg,
  fromEnv,
  connect,
  awsKeyFormat,
  slackShape,
};
