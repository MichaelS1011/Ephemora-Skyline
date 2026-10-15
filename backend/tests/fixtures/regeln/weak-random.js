// Regeln-Lane fixture — weak randomness feeding a security value (CWE-330).
// Mirrors sec-subtle/src/subtle.js:27 (the Math.random line inside a token
// factory: the finding sits on the Math.random call, not on the function).
exports.reset = () => {
  // MUST FIRE: Math.random() assigned to a security-shaped name
  const resetToken = Math.random().toString(36).slice(2);
  return resetToken;
};

function makeSessionToken() {
  // MUST FIRE: the return line carries the Math.random call
  return Math.random().toString(36) + Math.random().toString(36);
}

// MUST NOT FIRE: nothing security-shaped consumes the number
const jitter = Math.random() * 50;
const dice = Math.floor(Math.random() * 6);

// MUST NOT FIRE: the strong source is not a finding
const requestId = crypto.randomUUID();

module.exports = { reset, makeSessionToken, jitter, dice, requestId };
