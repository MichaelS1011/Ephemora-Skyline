import type { SecurityIssue } from "../../models/index.js";

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
      const code =
        loc.region.snippet?.text?.slice(0, 120) ??
        contentByPath?.get(filePath)?.split("\n")[line - 1]?.trim().slice(0, 120) ??
        "";
      const level = res.level ?? "warning";
      const severity = SEVERITY_MAP[level] ?? "P1";
      issues.push({
        type: sarifRuleToType(res.ruleId),
        severity,
        score: SCORE_MAP[severity] ?? 7,
        line,
        code,
        message: res.message.text,
        fix: ruleHelp.get(res.ruleId),
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
