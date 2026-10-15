// Regeln-Lane fixture — server-side XSS sink (CWE-79): a response body built by
// concatenating request input. Mirrors target/api/handlers.js:7.
const page = "<html><body>";

exports.render = (req, res) => {
  res.send("<p>" + req.query.q + "</p>");
};

exports.echo = (req, res) => {
  res.end("<div>" + req.body.html + "</div>");
};

exports.inline = (req, res) => {
  res.json("<b>" + req.params.name + "</b>");
};

// MUST NOT FIRE: constants, objects and non-request values are not injected HTML
exports.status = (req, res) => {
  res.json({ ok: true });
  res.send(page);
  res.end("done");
  res.json({ q: req.query.q });
};

// MUST NOT FIRE (existing rule): the DOM sink stays as it was
function paint(el, userInput) {
  el.innerHTML = userInput;
}

module.exports.render = exports.render;
module.exports.paint = paint;
