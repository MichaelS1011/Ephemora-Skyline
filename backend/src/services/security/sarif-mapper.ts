import type { SecurityIssue } from "../../models/index.js";
import { maskSecretText } from "./redact.js";
import { FINDING_KNOWLEDGE, knowledgeFor } from "./finding-knowledge.js";

type Sarif = {
  runs: Array<{
    tool: {
      driver: {
        rules?: Array<{
          id: string;
          shortDescription?: { text: string };
          help?: { text: string };
          helpUri?: string;
          /** semgrep carries the rule's CWE list here, as "CWE-78: …" strings */
          properties?: { tags?: string[] };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: string;
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number; snippet?: { text: string } };
        };
      }>;
    }>;
  }>;
};

const SEVERITY_MAP: Record<string, "P0" | "P1" | "P2"> = {
  error: "P0",
  warning: "P1",
  note: "P2",
};

const SCORE_MAP: Record<string, number> = { P0: 10, P1: 7, P2: 3 };

/**
 * Vendor noise must not cross this boundary (R3-10, measured three identical
 * runs on `target-warm.json`): a semgrep rule's help text carried its Pro-plan
 * advertisement (`💎 Enable cross-file analysis and Pro rules for free at
 * sg.run/pro`) and an unsubstituted metavariable (`$FUNC`) straight into the
 * UI's "To fix" block. Two kinds of line/pattern are removed; the useful part
 * of the sentence stays word-for-word.
 */
export function stripScannerNoise(text: string): string {
  const withoutPromo = text
    .split("\n")
    .filter((line) => !/sg\.run|\bPro rules\b|Enable cross-file analysis|💎/i.test(line))
    .join("\n");
  // Unsubstituted semgrep metavariables: $NAME and ${NAME}, plus the pair of
  // backticks a rule quotes them in. A leading digit ($5) is money, not a
  // template — kept.
  const withoutMetavars = withoutPromo.replace(/`?\$\{?[A-Za-z_][A-Za-z0-9_]*\}?`?/g, "");
  return withoutMetavars
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export function sarifToIssues(sarif: Sarif, contentByPath?: Map<string, string>): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  for (const run of sarif.runs ?? []) {
    const ruleHelp = new Map<string, string>();
    const ruleCwe = new Map<string, string>();
    const ruleUri = new Map<string, string>();
    for (const r of run.tool.driver.rules ?? []) {
      if (!r.id) continue;
      ruleHelp.set(r.id, r.help?.text ?? r.shortDescription?.text ?? "");
      if (r.helpUri) ruleUri.set(r.id, r.helpUri);
      // A rule's own CWE beats any name heuristic: it is what the rule author
      // claims, and the category axis is a claim the user filters on.
      const cweTag = (r.properties?.tags ?? []).find((t) => /^CWE-\d+/.test(t));
      if (cweTag) ruleCwe.set(r.id, cweTag);
    }
    for (const res of run.results ?? []) {
      const loc = res.locations?.[0]?.physicalLocation;
      if (!loc) continue;
      const filePath = loc.artifactLocation.uri;
      const line = loc.region.startLine ?? 1;
      // Masked at full length, then clipped: the region snippet of a secret
      // rule is the credential, and half of it is no shape the mask knows.
      const code = maskSecretText(
        loc.region.snippet?.text ??
          contentByPath?.get(filePath)?.split("\n")[line - 1]?.trim() ??
          "",
      ).slice(0, 120);
      const level = res.level ?? "warning";
      const severity = SEVERITY_MAP[level] ?? "P1";
      const type = sarifRuleToType(res.ruleId);
      // Both fields cross the boundary cleaned (R3-10). When the strip leaves
      // nothing behind, the finding falls back to the curated knowledge entry
      // for its type instead of showing an empty or advertised card.
      const cleanedMessage = stripScannerNoise(res.message.text ?? "");
      const message = cleanedMessage === "" ? knowledgeFor(type).explain : cleanedMessage;
      const help = ruleHelp.get(res.ruleId);
      let fix: string | undefined;
      if (help !== undefined) {
        const cleanedFix = stripScannerNoise(help);
        fix = cleanedFix === "" ? FINDING_KNOWLEDGE[type]?.explain : cleanedFix;
      }
      issues.push({
        type,
        severity,
        score: SCORE_MAP[severity] ?? 7,
        line,
        code,
        message,
        fix,
        provenance: "semgrep",
        ruleId: res.ruleId,
        cwe: ruleCwe.get(res.ruleId),
        refUrl: ruleUri.get(res.ruleId),
      } as SecurityIssue);
      // attach hidden file path for batch dedup (overwritten below)
      (issues[issues.length - 1] as unknown as Record<string, unknown>)._filePath = filePath;
    }
  }
  return issues;
}

function sarifRuleToType(ruleId: string): string {
  const id = ruleId.toLowerCase();
  if (id.includes("xss")) return "XSS";
  if (id.includes("sql") || id.includes("sqli")) return "SQL_INJECTION";
  if (id.includes("command") || id.includes("exec")) return "CMD_INJECTION";
  if (id.includes("path") || id.includes("traversal")) return "PATH_TRAVERSAL";
  if (id.includes("prototype")) return "PROTOTYPE_POLLUTION";
  if (id.includes("deserialization") || id.includes("deserialize")) return "UNSAFE_DESERIALIZATION";
  if (id.includes("eval")) return "EVAL_USAGE";
  if (id.includes("secret") || id.includes("hardcoded")) return "HARDCODED_SECRET";
  // fallback: last segment upper
  const last = ruleId.split(".").pop() ?? ruleId;
  return last.replace(/-/g, "_").toUpperCase().slice(0, 60);
}
