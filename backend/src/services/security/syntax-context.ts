import ts from "typescript";

/** Is this expression only fixed markup, with no value that could vary? */
function staticHtml(node: ts.Node): boolean {
  if (ts.isParenthesizedExpression(node)) return staticHtml(node.expression);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    return staticHtml(node.left) && staticHtml(node.right);
  return false;
}

/** Parse once per JS/TS file. A match inside quoted example code is not an
 * executed call. Template interpolations are visited as code, not blanked. */
export function syntaxContext(
  file: string,
  content: string,
): {
  allows: (offset: number, type: string) => boolean;
} {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const literals: ts.Node[] = [];
  const storage: ts.CallExpression[] = [];
  const innerHtmlAssignments: ts.BinaryExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isRegularExpressionLiteral(node) ||
      ts.isJsxText(node)
    )
      literals.push(node);
    if (
      ts.isCallExpression(node) &&
      /(?:^|\.)localStorage\.setItem$/.test(node.expression.getText(source))
    )
      storage.push(node);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === "innerHTML"
    )
      innerHtmlAssignments.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return {
    allows(offset, type) {
      if (type.startsWith("CUSTOM_")) return true;
      const literal = literals.find((n) => offset >= n.getStart(source) && offset < n.end);
      if (literal) {
        // Queries are intentionally strings. Only inspect an actual SQL value,
        // never SQL nested inside an example string containing another program.
        if (
          type === "SQL_INJECTION" &&
          (ts.isStringLiteralLike(literal) || ts.isTemplateHead(literal)) &&
          /^\s*SELECT\b/i.test(literal.text)
        ) {
          const parent = ts.isTemplateExpression(literal.parent)
            ? literal.parent.parent
            : literal.parent;
          return (
            ts.isVariableDeclaration(parent) ||
            ts.isBinaryExpression(parent) ||
            (ts.isCallExpression(parent) &&
              /(?:query|execute|exec)$/.test(parent.expression.getText(source)))
          );
        }
        // A literal passed straight to a shell really will be executed.
        let parent = literal.parent;
        if (ts.isArrayLiteralExpression(parent)) parent = parent.parent;
        return (
          [
            "CURL_PIPE_BASH",
            "DESTRUCTIVE_COMMAND",
            "WORLD_WRITABLE",
            "TLS_VERIFICATION_DISABLED",
          ].includes(type) &&
          ts.isCallExpression(parent) &&
          /(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)$/.test(
            parent.expression.getText(source),
          )
        );
      }
      if (type === "XSS") {
        const assignment = innerHtmlAssignments.find(
          (n) => offset >= n.left.getStart(source) && offset < n.left.end,
        );
        // Assigning a literal — `""` to clear a test host, or a fixed markup
        // string — cannot carry attacker input. A variable, concatenation or
        // template with substitutions still fires.
        if (assignment && staticHtml(assignment.right)) return false;
      }
      if (type === "LOCALSTORAGE_USAGE") {
        const call = storage.find((n) => offset >= n.getStart(source) && offset < n.expression.end);
        if (!call) return false;
        // Storage is not a vulnerability by itself. This remains a naming
        // heuristic, not a claim to have traced sensitive values end to end.
        const sensitiveName =
          /(?:password|passwd|secret|credential|(?:access|refresh|auth|bearer|session|api)[_-]?token|api[_-]?key|^token$)/i;
        let sensitive = false;
        const inspectValue = (n: ts.Node): void => {
          if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && sensitiveName.test(n.text))
            sensitive = true;
          ts.forEachChild(n, inspectValue);
        };
        const key = call.arguments[0];
        if (key && ts.isStringLiteralLike(key) && sensitiveName.test(key.text)) sensitive = true;
        const value = call.arguments[1];
        if (value) inspectValue(value);
        return sensitive;
      }
      return true;
    },
  };
}
