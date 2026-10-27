/**
 * Local rule matcher — the shipped rule pack, run in-process.
 *
 * Why this file exists: `backend/rules/ephemora-core` is ours (Apache-2.0,
 * `default: true`, twelve rules, each one tested against positive and negative
 * examples in `backend/tests/rule-packs.test.ts`), and until now the only way
 * those YAML files reached a scan was the Semgrep adapter: `scanner.ts:165-173`
 * → `semgrepRuleDirs()` → `this.semgrepAdapter?.setRuleDirs(dirs)`. No other
 * adapter reads a rule file. So a machine without semgrep — which is every
 * machine a stranger downloads this repository onto before installing anything —
 * scanned a project and reported none of our own rules. The answer is not a
 * fourth external program; the rules we wrote we can execute ourselves.
 *
 * Two rules govern this matcher:
 *
 * 1. **Never invent a hit.** A rule is evaluated only when every clause in it
 *    is something this file can decide, and only against the TypeScript parser
 *    the backend already declares as a dependency (`typescript@5.9.3`, used the
 *    same way in `syntax-context.ts`). Anything else — another language, a
 *    clause shape it does not know, a YAML construct it cannot read — is
 *    reported as *not local* in `status()` with its reason, and contributes
 *    nothing. A false finding costs this product more than a missing one: the
 *    card is a promise, and a reader who is told once that their code is wrong
 *    stops believing the findings that were right.
 * 2. **Say which channel delivered.** Every finding carries `provenance:
 *    "local-rules"` and the rule's own id — never `semgrep`. Where semgrep did
 *    run, its answer wins (`suppressLocalDuplicates()`, called by the batch
 *    merge), so one line is never reported twice by two channels.
 */

import fs from "fs";
import path from "path";
import ts from "typescript";
import { THREAT_SCORE, type SecurityIssue } from "../../models/index.js";
import type { ScannerAdapter } from "./adapter.js";
import { enrichIssues } from "./finding-knowledge.js";
import { ruleTypeFromId } from "./sarif-mapper.js";
import { maskSecretText } from "./redact.js";
import { languageOfPath } from "./scan-config.js";

/** The provenance string every finding of this channel carries. */
export const LOCAL_RULE_PROVENANCE = "local-rules";

/** A finding is worth what the rule's own severity says it is worth. */
const SEVERITY_BY_RULE: Record<string, "P0" | "P1" | "P2"> = {
  ERROR: "P0",
  WARNING: "P1",
  INFO: "P2",
};

// ───────────────────────────────────────────────────────────────────────────
// Reading the pack's YAML.
//
// Deliberately not a dependency: `yaml` and `js-yaml` sit in this repository
// only as transitive packages of the tool chain (vite, eslint, lint-staged),
// and nothing in `backend/package.json` declares either one. Importing them
// would turn a dev-time accident into a runtime requirement. What is read here
// is the subset rule files use — block mappings, block sequences, inline flow
// sequences and mappings, quoted scalars, folded (`>`) and literal (`|`) blocks.
// Anything outside that subset is an error the caller reports, not a guess.
// ───────────────────────────────────────────────────────────────────────────

type YamlValue = string | YamlValue[] | { [key: string]: YamlValue };
type YamlMap = { [key: string]: YamlValue };

interface YamlDoc {
  root: YamlValue | null;
  /** Set when the reader met a construct it does not represent. */
  error?: string;
}

interface RuleLine {
  indent: number;
  text: string;
}

function toLines(raw: string): RuleLine[] {
  const out: RuleLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s*#/.test(line)) continue;
    out.push({ indent: line.length - line.trimStart().length, text: line.trim() });
  }
  return out;
}

/** `key: rest`, split at the first top-level colon; `null` when the line is a scalar. */
function splitKey(text: string): { key: string; rest: string } | null {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote && text[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[" || ch === "{" || ch === "(") depth += 1;
    else if (ch === "]" || ch === "}" || ch === ")") depth -= 1;
    else if (depth === 0 && ch === ":" && (text[i + 1] === " " || i + 1 === text.length)) {
      return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/** Split at top-level separators, ignoring anything inside quotes or brackets. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote) {
      current += ch;
      if (ch === quote && text[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (depth === 0 && ch === separator) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() || parts.length === 0) parts.push(current.trim());
  return parts;
}

function unquote(text: string): string | null {
  const first = text[0];
  if ((first === '"' || first === "'") && text.length > 1 && text.endsWith(first)) {
    return text
      .slice(1, -1)
      .replace(/\\(["'\\])/g, "$1")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t");
  }
  return null;
}

class YamlReader {
  private lines: RuleLine[];
  private pos = 0;

  constructor(raw: string) {
    this.lines = toLines(raw);
  }

  firstIndent(): number | null {
    return this.lines.length > 0 ? this.lines[0]!.indent : null;
  }

  private peek(): RuleLine | undefined {
    return this.lines[this.pos];
  }

  /** The block starting here: a sequence when the line opens with `-`, else a mapping. */
  readBlock(indent: number): YamlValue | null {
    const line = this.peek();
    if (!line || line.indent < indent) return "";
    if (line.text === "-" || line.text.startsWith("- ")) return this.readSeq(line.indent);
    return this.readMap(line.indent);
  }

  readMap(indent: number): YamlMap | null {
    const out: YamlMap = {};
    for (;;) {
      const line = this.peek();
      if (!line || line.indent < indent) break;
      if (line.indent > indent || line.text === "-" || line.text.startsWith("- ")) return null;
      const pair = splitKey(line.text);
      if (!pair) return null;
      this.pos += 1;
      const value = this.readValueFor(pair.rest, indent);
      if (value === null) return null;
      out[pair.key] = value;
    }
    return out;
  }

  readSeq(indent: number): YamlValue[] | null {
    const out: YamlValue[] = [];
    for (;;) {
      const line = this.peek();
      if (!line || line.indent < indent) break;
      if (line.indent > indent || !(line.text === "-" || line.text.startsWith("- "))) return null;
      const body = line.text === "-" ? "" : line.text.slice(2).trimStart();
      // Where an inline `key:` of this item starts is the indent its sibling
      // keys have to sit at.
      const childIndent =
        line.text === "-" ? line.indent + 2 : line.indent + (line.text.length - body.length);
      this.pos += 1;
      if (body === "") {
        const next = this.peek();
        const nested = next ? this.readBlock(next.indent) : "";
        if (nested === null) return null;
        out.push(nested);
        continue;
      }
      const pair = splitKey(body);
      if (!pair) {
        const scalar = this.scalarFrom(body);
        if (typeof scalar !== "string" || scalar === "") return null;
        out.push(scalar);
        continue;
      }
      const first = this.readValueFor(pair.rest, childIndent);
      if (first === null) return null;
      const item: YamlMap = { [pair.key]: first };
      for (;;) {
        const more = this.peek();
        if (!more || more.indent !== childIndent) break;
        if (more.text === "-" || more.text.startsWith("- ")) break;
        const nextPair = splitKey(more.text);
        if (!nextPair) return null;
        this.pos += 1;
        const value = this.readValueFor(nextPair.rest, childIndent);
        if (value === null) return null;
        item[nextPair.key] = value;
      }
      out.push(item);
    }
    return out;
  }

  /** The value that belongs to a key already consumed. */
  private readValueFor(rest: string, indent: number): YamlValue | null {
    if (rest === "") {
      const next = this.peek();
      if (!next || next.indent <= indent) return "";
      return this.readBlock(next.indent);
    }
    if (/^[|>][-+]?$/.test(rest)) return this.blockScalar(indent, rest[0] === "|");
    return this.scalarFrom(rest);
  }

  /** A folded (`>`) or literal (`|`) block: the more-indented lines under a key. */
  private blockScalar(indent: number, literal: boolean): string | null {
    const collected: string[] = [];
    for (;;) {
      const line = this.peek();
      if (!line || line.indent <= indent) break;
      collected.push(line.text);
      this.pos += 1;
    }
    if (collected.length === 0) return null;
    return literal ? collected.join("\n") : collected.join(" ").replace(/\s+/g, " ").trim();
  }

  private scalarFrom(text: string): YamlValue | null {
    const quoted = unquote(text);
    if (quoted !== null) return quoted;
    if (text.startsWith("[")) {
      if (!text.endsWith("]")) return null;
      const inner = text.slice(1, -1).trim();
      const out: YamlValue[] = [];
      if (inner === "") return out;
      for (const item of splitTopLevel(inner, ",")) {
        const value = this.scalarFrom(item);
        if (value === null) return null;
        out.push(value);
      }
      return out;
    }
    if (text.startsWith("{")) {
      if (!text.endsWith("}")) return null;
      const inner = text.slice(1, -1).trim();
      const out: YamlMap = {};
      if (inner === "") return out;
      for (const item of splitTopLevel(inner, ",")) {
        const pair = splitKey(item);
        if (!pair) return null;
        const value = this.scalarFrom(pair.rest);
        if (value === null) return null;
        out[pair.key] = value;
      }
      return out;
    }
    // A plain scalar. Anything that opens with a YAML indicator the reader does
    // not implement is refused instead of being read as text.
    if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(text)) return null;
    return text;
  }
}

function readYaml(raw: string): YamlDoc {
  try {
    const reader = new YamlReader(raw);
    const first = reader.firstIndent();
    if (first === null) return { root: null, error: "Datei enthält keine Zeile mit Inhalt" };
    const root = reader.readBlock(first);
    if (root === null) {
      return { root: null, error: "Konstrukt, das der Regel-Leser nicht darstellt" };
    }
    return { root };
  } catch (e) {
    return { root: null, error: e instanceof Error ? e.message : "Regeldatei nicht lesbar" };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Patterns.
// ───────────────────────────────────────────────────────────────────────────

/** One argument position of a call pattern. */
type ArgPattern =
  | { kind: "metavariable"; name: string }
  | { kind: "anyRemaining" }
  | { kind: "stringLike" }
  | { kind: "literal"; text: string; quoted: boolean }
  | { kind: "arrayLiteral" }
  | {
      kind: "objectPattern";
      properties: { key: string; value: ArgPattern }[];
      allowsExtra: boolean;
    };

/** A whole pattern clause, as far as this matcher can understand it. */
type Clause =
  | { kind: "call"; path: string[]; args: ArgPattern[]; isNew: boolean }
  | { kind: "assignment"; path: string[]; value: ArgPattern }
  | { kind: "property"; key: string; value: ArgPattern };

const NAME = "[A-Za-z_$][A-Za-z0-9_$]*";
const METAVARIABLE = /^\$[A-Z0-9_]+$/;
/** `subprocess.$F(...)` — a name the rule leaves open, which needs resolution. */
const CALLEE_WITH_METAVARIABLE = new RegExp(`^${NAME}\\.\\$[A-Z0-9_]+(\\.${NAME})*$`);

function dottedPath(text: string): string[] | null {
  if (!new RegExp(`^${NAME}(\\.${NAME})*$`).test(text)) return null;
  return text.split(".");
}

function parseArgPattern(text: string): ArgPattern | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (trimmed === "...") return { kind: "anyRemaining" };
  if (METAVARIABLE.test(trimmed)) return { kind: "metavariable", name: trimmed };
  if (trimmed.startsWith("[")) {
    if (!trimmed.endsWith("]")) return null;
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "" || inner === "...") return { kind: "arrayLiteral" };
    return null;
  }
  const quoted = unquote(trimmed);
  if (quoted !== null) {
    if (quoted === "...") return { kind: "stringLike" };
    return { kind: "literal", text: quoted, quoted: true };
  }
  if (/^(true|false|null|undefined)$/.test(trimmed)) {
    return { kind: "literal", text: trimmed, quoted: false };
  }
  if (/^-?\d[\d_]*$/.test(trimmed) || /^0o[0-7_]+$/.test(trimmed)) {
    return { kind: "literal", text: trimmed, quoted: false };
  }
  if (trimmed.startsWith("{")) {
    if (!trimmed.endsWith("}")) return null;
    const inner = trimmed.slice(1, -1).trim();
    const properties: { key: string; value: ArgPattern }[] = [];
    let allowsExtra = inner === "";
    if (inner !== "") {
      for (const item of splitTopLevel(inner, ",")) {
        if (item === "...") {
          allowsExtra = true;
          continue;
        }
        const pair = splitKey(item);
        if (!pair) return null;
        const value = parseArgPattern(pair.rest);
        if (!value || value.kind === "anyRemaining") return null;
        properties.push({ key: pair.key, value });
      }
    }
    return { kind: "objectPattern", properties, allowsExtra };
  }
  return null;
}

/** Compile one pattern string, or `null` when this matcher cannot decide it. */
function parsePattern(text: string): Clause | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (CALLEE_WITH_METAVARIABLE.test(pathOfCallShape(trimmed) ?? "")) return null;

  const call = new RegExp(`^(new\\s+)?(${NAME}(\\.${NAME})*)\\s*\\(([\\s\\S]*)\\)$`).exec(trimmed);
  if (call && balanced(trimmed)) {
    const argsText = call[4]!.trim();
    const patterns: ArgPattern[] = [];
    if (argsText !== "") {
      for (const item of splitTopLevel(argsText, ",")) {
        const pattern = parseArgPattern(item);
        if (!pattern) return null;
        patterns.push(pattern);
      }
      // `...` is read as a tail; in the middle it would stand for positions this
      // matcher cannot count.
      for (let i = 0; i < patterns.length - 1; i += 1) {
        if (patterns[i]!.kind === "anyRemaining") return null;
      }
    }
    return {
      kind: "call",
      path: call[2]!.split("."),
      args: patterns,
      isNew: call[1] !== undefined,
    };
  }

  const assignment = splitAssignment(trimmed);
  if (assignment) {
    const left = dottedPath(assignment.left);
    if (!left) return null;
    const value = parseArgPattern(assignment.right);
    if (!value) return null;
    return { kind: "assignment", path: left, value };
  }

  const pair = splitKey(trimmed);
  if (pair && dottedPath(pair.key)?.length === 1) {
    const value = parseArgPattern(pair.rest);
    if (!value) return null;
    return { kind: "property", key: pair.key, value };
  }

  return null;
}

/** The callee text of something shaped like a call, before it is compiled. */
function pathOfCallShape(text: string): string | null {
  const match = /^(?:new\s+)?([^(]*)\(/.exec(text);
  return match ? match[1]!.trim() : null;
}

/** `a = b` at the top level, and not `==`, `===`, `!=`, `<=`, `>=` or `=>`. */
function splitAssignment(text: string): { left: string; right: string } | null {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote && text[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (depth !== 0 || ch !== "=") continue;
    const before = text[i - 1];
    const after = text[i + 1];
    if (before === "=" || before === "!" || before === "<" || before === ">") return null;
    if (after === "=" || after === ">") return null;
    return { left: text.slice(0, i).trim(), right: text.slice(i + 1).trim() };
  }
  return null;
}

function balanced(text: string): boolean {
  let depth = 0;
  let quote = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
  }
  return depth === 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Rules.
// ───────────────────────────────────────────────────────────────────────────

interface Constraint {
  metavariable: string;
  regex: RegExp;
}

/** One rule this matcher can run, with everything it needs to say about it. */
export interface CompiledRule {
  pack: string;
  id: string;
  languages: string[];
  severity: "P0" | "P1" | "P2";
  message: string;
  cwe?: string;
  positives: Clause[];
  negatives: Clause[];
  constraints: Constraint[];
  /** Names a file must contain before it is parsed at all. */
  anchors: string[];
}

/** What a rule of the pack can and cannot do locally, in the reader's words. */
export interface LocalRuleStatus {
  pack: string;
  id: string;
  local: boolean;
  reason?: string;
}

interface RawRule {
  id: string;
  languages: string[];
  severity: string;
  message: string;
  cwe?: string;
  positives: string[];
  negatives: string[];
  constraints: { metavariable: string; regex: string }[];
  /** Clause keys the collector could not place. */
  unknown: string[];
  /** How many separate positive blocks the rule carries. */
  positiveBlocks: number;
}

function asMap(value: YamlValue | undefined | null): YamlMap | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as YamlMap;
  return null;
}

function asList(value: YamlValue | undefined): YamlValue[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === "") return [];
  return [value];
}

function textOf(value: YamlValue | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  return "";
}

/** Read one rule into the three buckets a scan decision needs. */
function collectRule(raw: YamlMap): RawRule | null {
  const id = textOf(raw["id"]).trim();
  if (!id) return null;
  const rule: RawRule = {
    id,
    languages: asList(raw["languages"]).map((entry) => textOf(entry).trim().toLowerCase()),
    severity: textOf(raw["severity"]).trim().toUpperCase(),
    message: collapseMessage(textOf(raw["message"])),
    cwe: firstCwe(raw["metadata"]),
    positives: [],
    negatives: [],
    constraints: [],
    unknown: [],
    positiveBlocks: 0,
  };
  if (typeof raw["pattern"] === "string") {
    rule.positiveBlocks += 1;
    rule.positives.push(raw["pattern"]);
  }
  if (raw["pattern-either"] !== undefined) {
    rule.positiveBlocks += 1;
    for (const entry of asList(raw["pattern-either"])) rule.positives.push(patternTextOf(entry));
  }
  if (typeof raw["pattern-not"] === "string") rule.negatives.push(raw["pattern-not"]);
  for (const entry of asList(raw["patterns"])) {
    const clause = asMap(entry);
    if (!clause) {
      rule.unknown.push(textOf(entry));
      continue;
    }
    for (const key of Object.keys(clause)) {
      const value = clause[key];
      if (key === "pattern-not" && typeof value === "string") {
        rule.negatives.push(value);
        continue;
      }
      if (key === "pattern-either") {
        rule.positiveBlocks += 1;
        for (const alt of asList(value)) rule.positives.push(patternTextOf(alt));
        continue;
      }
      if (key === "pattern" && typeof value === "string") {
        rule.positiveBlocks += 1;
        rule.positives.push(value);
        continue;
      }
      if (key === "metavariable-regex") {
        const map = asMap(value);
        if (map) {
          rule.constraints.push({
            metavariable: textOf(map["metavariable"]),
            regex: textOf(map["regex"]),
          });
          continue;
        }
      }
      rule.unknown.push(key);
    }
  }
  return rule;
}

function patternTextOf(entry: YamlValue): string {
  const map = asMap(entry);
  if (map && typeof map["pattern"] === "string") return map["pattern"];
  return textOf(entry);
}

function collapseMessage(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function firstCwe(metadata: YamlValue | undefined): string | undefined {
  const map = asMap(metadata);
  if (!map) return undefined;
  for (const entry of asList(map["cwe"])) {
    const text = textOf(entry).trim();
    if (/^CWE-\d+/.test(text)) return text;
  }
  return undefined;
}

export interface RuleCompileResult {
  rules: CompiledRule[];
  statuses: LocalRuleStatus[];
}

const JS_LANGUAGES = new Set(["javascript", "typescript", "js", "ts"]);

/**
 * The rule set of the packs in `dirs`, plus, for every rule of those packs,
 * whether this matcher runs it and — when it does not — the one-line reason.
 * A pack whose YAML cannot be read reports its rules as not local instead of
 * reporting nothing at all.
 */
export function compilePackRules(dirs: string[], packNames: string[] = []): RuleCompileResult {
  const rules: CompiledRule[] = [];
  const statuses: LocalRuleStatus[] = [];
  dirs.forEach((dir, index) => {
    const pack = packNames[index] ?? path.basename(dir);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir).filter((name) => /\.ya?ml$/i.test(name));
    } catch (e) {
      statuses.push({
        pack,
        id: "(der ganze Pack)",
        local: false,
        reason: `Regelordner nicht lesbar: ${e instanceof Error ? e.message : "unbekannt"}`,
      });
      return;
    }
    for (const file of entries.sort()) {
      const status = (id: string, local: boolean, reason?: string): void => {
        statuses.push({ pack, id, local, reason });
      };
      let raw: string;
      try {
        raw = fs.readFileSync(path.join(dir, file), "utf-8");
      } catch (e) {
        status(
          file,
          false,
          `Regeldatei nicht lesbar: ${e instanceof Error ? e.message : "unbekannt"}`,
        );
        continue;
      }
      const doc = readYaml(raw);
      if (doc.error) {
        status(file, false, `${file}: ${doc.error} — keine Regel der Datei läuft lokal`);
        continue;
      }
      const root = asMap(doc.root);
      const list = root ? asList(root["rules"]) : [];
      if (!root || list.length === 0) {
        status(file, false, `${file}: kein rules:-Block, den der Leser kennt`);
        continue;
      }
      for (const item of list) {
        const map = asMap(item);
        if (!map) {
          status(file, false, `${file}: eine Regel ist keine Mapping-Struktur`);
          continue;
        }
        const collected = collectRule(map);
        if (!collected) {
          status("(ohne id)", false, `${file}: eine Regel trägt keine id`);
          continue;
        }
        const compiled = compileRule(pack, collected);
        statuses.push(compiled.status);
        if (compiled.rule) rules.push(compiled.rule);
      }
    }
  });
  return { rules, statuses };
}

function compileRule(
  pack: string,
  raw: RawRule,
): { rule: CompiledRule | null; status: LocalRuleStatus } {
  const status = (local: boolean, reason?: string) => ({
    rule: null,
    status: { pack, id: raw.id, local, reason },
  });
  const notJs = raw.languages.filter((language) => !JS_LANGUAGES.has(language));
  if (raw.languages.length === 0 || notJs.length > 0) {
    return status(
      false,
      `Sprache ${notJs.length > 0 ? notJs.join("/") : "keine angegeben"} — im Haus liegt kein Parser dafür; ` +
        "der Matcher liest JavaScript/TypeScript mit dem TypeScript-Parser, der schon Abhängigkeit ist",
    );
  }
  const severity = SEVERITY_BY_RULE[raw.severity];
  if (!severity)
    return status(false, `severity "${raw.severity}" ist keinem Schweregrad zugeordnet`);
  if (raw.positiveBlocks === 0)
    return status(false, "kein positives pattern — die Regel sagt nichts");
  if (raw.positiveBlocks > 1) {
    return status(
      false,
      "mehrere positive pattern-Blöcke (echte Konjunktion) wertet der Matcher nicht — sonst prüfte er nur " +
        "den ersten und meldete zu oft",
    );
  }
  if (raw.unknown.length > 0) {
    return status(
      false,
      `pattern-Konstruktion ${raw.unknown.join(", ")} wird nicht ausgewertet: ein Matcher, der sie übersieht, ` +
        "meldet Befunde ohne die Bedingung, die die Regel meint",
    );
  }
  const positives: Clause[] = [];
  for (const text of raw.positives) {
    const clause = parsePattern(text);
    if (!clause)
      return status(false, `pattern \`${text}\` ist in dieser Form nicht sicher ausführbar`);
    positives.push(clause);
  }
  const negatives: Clause[] = [];
  for (const text of raw.negatives) {
    const clause = parsePattern(text);
    if (!clause) {
      return status(
        false,
        `pattern-not \`${text}\` kann der Matcher nicht prüfen — ohne diese Einschränkung wäre die Regel zu breit`,
      );
    }
    negatives.push(clause);
  }
  const constraints: Constraint[] = [];
  for (const constraint of raw.constraints) {
    if (!METAVARIABLE.test(constraint.metavariable)) {
      return status(
        false,
        `metavariable-regex auf \`${constraint.metavariable || "(leer)"}\` nennt keine Metavariable`,
      );
    }
    let regex: RegExp;
    try {
      regex = new RegExp(constraint.regex);
    } catch {
      return status(false, `metavariable-regex \`${constraint.regex}\` ist kein gültiger Ausdruck`);
    }
    constraints.push({ metavariable: constraint.metavariable, regex });
  }
  const anchors = new Set<string>();
  for (const clause of [...positives, ...negatives]) {
    anchors.add(clause.kind === "property" ? clause.key : clause.path[clause.path.length - 1]!);
  }
  return {
    rule: {
      pack,
      id: raw.id,
      languages: raw.languages,
      severity,
      message: raw.message,
      cwe: raw.cwe,
      positives,
      negatives,
      constraints,
      anchors: [...anchors],
    },
    status: { pack, id: raw.id, local: true },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Matching against the AST.
// ───────────────────────────────────────────────────────────────────────────

interface Hit {
  node: ts.Node;
  bindings: Map<string, ts.Node>;
}

/** `exec` matches the callee `exec` and also `child_process.exec` — name, not module. */
function suffixMatches(pattern: string[], actual: string[]): boolean {
  if (pattern.length > actual.length) return false;
  const offset = actual.length - pattern.length;
  return pattern.every((segment, index) => segment === actual[index + offset]);
}

function propertyKey(node: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(node)) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
    return node.name.getText().replace(/^["']|["']$/g, "");
  }
  return null;
}

function matchArg(pattern: ArgPattern, node: ts.Node, bindings: Map<string, ts.Node>): boolean {
  switch (pattern.kind) {
    case "metavariable":
      bindings.set(pattern.name, node);
      return true;
    case "stringLike":
      return ts.isStringLiteralLike(node);
    case "literal":
      if (pattern.quoted) return ts.isStringLiteralLike(node) && node.text === pattern.text;
      return node.getText().trim() === pattern.text;
    case "arrayLiteral":
      return ts.isArrayLiteralExpression(node);
    case "objectPattern": {
      if (!ts.isObjectLiteralExpression(node)) return false;
      for (const wanted of pattern.properties) {
        const found = node.properties.find((property) => propertyKey(property) === wanted.key);
        if (!found || !ts.isPropertyAssignment(found)) return false;
        if (!matchArg(wanted.value, found.initializer, bindings)) return false;
      }
      return pattern.allowsExtra ? true : node.properties.length === pattern.properties.length;
    }
    case "anyRemaining":
      return true;
  }
}

/** A call or a `new` — the two node kinds a call pattern can be read against. */
function callShape(
  node: ts.Node,
): { expression: ts.Expression; args: readonly ts.Node[]; isNew: boolean } | null {
  if (ts.isCallExpression(node))
    return { expression: node.expression, args: node.arguments, isNew: false };
  if (ts.isNewExpression(node)) {
    return { expression: node.expression, args: node.arguments ?? [], isNew: true };
  }
  return null;
}

function matchClause(clause: Clause, nodes: ts.Node[], source: ts.SourceFile): Hit[] {
  const hits: Hit[] = [];
  for (const node of nodes) {
    if (clause.kind === "call") {
      const call = callShape(node);
      if (!call || call.isNew !== clause.isNew) continue;
      if (!suffixMatches(clause.path, call.expression.getText(source).split("."))) continue;
      const tail = clause.args.some((pattern) => pattern.kind === "anyRemaining");
      const required = clause.args.filter((pattern) => pattern.kind !== "anyRemaining").length;
      if (tail ? call.args.length < required : call.args.length !== required) continue;
      const bindings = new Map<string, ts.Node>();
      let ok = true;
      for (let i = 0; i < required; i += 1) {
        if (!matchArg(clause.args[i]!, call.args[i]!, bindings)) {
          ok = false;
          break;
        }
      }
      if (ok) hits.push({ node, bindings });
      continue;
    }
    if (clause.kind === "assignment") {
      if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
        continue;
      if (!suffixMatches(clause.path, node.left.getText(source).split("."))) continue;
      const bindings = new Map<string, ts.Node>();
      if (!matchArg(clause.value, node.right, bindings)) continue;
      hits.push({ node, bindings });
      continue;
    }
    if (!ts.isPropertyAssignment(node)) continue;
    if (propertyKey(node) !== clause.key) continue;
    const bindings = new Map<string, ts.Node>();
    if (!matchArg(clause.value, node.initializer, bindings)) continue;
    hits.push({ node, bindings });
  }
  return hits;
}

function collectNodes(source: ts.SourceFile): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** The hits of one rule that survive its own `pattern-not` list and constraints. */
function ruleHits(rule: CompiledRule, nodes: ts.Node[], source: ts.SourceFile): Hit[] {
  const negatives = rule.negatives.flatMap((clause) => matchClause(clause, nodes, source));
  const hits: Hit[] = [];
  for (const clause of rule.positives) {
    for (const hit of matchClause(clause, nodes, source)) {
      // A negative that names this very node, or a node holding it, is the case
      // the rule says is fine — `exec("...", ...)` read against `exec($CMD, ...)`.
      const excluded = negatives.some(
        (negative) =>
          negative.node === hit.node ||
          (negative.node.getStart(source) <= hit.node.getStart(source) &&
            negative.node.getEnd() >= hit.node.getEnd()),
      );
      if (excluded) continue;
      let allowed = true;
      for (const constraint of rule.constraints) {
        const bound = hit.bindings.get(constraint.metavariable);
        // No binding means the constraint cannot be decided for this hit, and an
        // undecided constraint is a rule the matcher does not run — not a hit.
        if (!bound || !constraint.regex.test(bound.getText(source))) {
          allowed = false;
          break;
        }
      }
      if (allowed) hits.push(hit);
    }
  }
  return hits;
}

function scriptKindOf(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx" || ext === ".jsx") return ts.ScriptKind.TSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * The key both rule channels agree on. An engine prefixes the rule with its own
 * path (`….node.yaml.ephemora-node-weak-hash`), a user rule qualifies it
 * (`regex:…`); dropping that prefix leaves the rule's own id. Rule id, file and
 * line is the one statement under which two channels mean the same thing.
 */
export function normalizeRuleId(ruleId?: string): string {
  if (!ruleId) return "";
  const cut = Math.max(ruleId.lastIndexOf("."), ruleId.lastIndexOf(":"));
  return (cut >= 0 ? ruleId.slice(cut + 1) : ruleId).trim().toLowerCase();
}

/**
 * The decision of the merge: where the engine ran, its answer is the one that
 * shows. Only findings of this channel are ever removed, and only for a line
 * the engine also reported — by rule id or by the type both channels derive
 * from it. Nothing else in the file is touched.
 */
export function suppressLocalDuplicates(
  issues: SecurityIssue[],
  engineIssues: SecurityIssue[],
): SecurityIssue[] {
  if (engineIssues.length === 0) return issues;
  const claimed = new Set<string>();
  for (const issue of engineIssues) {
    claimed.add(`${issue.line}|rule:${normalizeRuleId(issue.ruleId)}`);
    claimed.add(`${issue.line}|type:${issue.type}`);
  }
  return issues.filter((issue) => {
    if (issue.provenance !== LOCAL_RULE_PROVENANCE) return true;
    return (
      !claimed.has(`${issue.line}|rule:${normalizeRuleId(issue.ruleId)}`) &&
      !claimed.has(`${issue.line}|type:${issue.type}`)
    );
  });
}

// ───────────────────────────────────────────────────────────────────────────
// The adapter.
// ───────────────────────────────────────────────────────────────────────────

/**
 * A per-file `ScannerAdapter`, so the channel joins the scan where the others
 * already do: `SecurityScanner.scanFile()` merges, filters through the profile,
 * masks and sorts its findings together with the regex, gitleaks and semgrep
 * ones. Nothing here starts a process and nothing here opens a socket.
 */
export class LocalRulesAdapter implements ScannerAdapter {
  readonly id = "local-rules";
  private rules: CompiledRule[] = [];
  private statuses: LocalRuleStatus[] = [];
  private dirs: string[] = [];
  /** Files this channel read since the scan began — the honest `localRules` flag. */
  private filesRead = 0;

  setRuleDirs(dirs: string[], packNames: string[] = []): void {
    this.dirs = [...new Set(dirs)];
    const compiled = compilePackRules(this.dirs, packNames);
    this.rules = compiled.rules;
    this.statuses = compiled.statuses;
  }

  ruleDirs(): string[] {
    return [...this.dirs];
  }

  /** Per rule: does it run here, and when it does not, why — one line each. */
  status(): LocalRuleStatus[] {
    return this.statuses.map((entry) => ({ ...entry }));
  }

  runnableRules(): number {
    return this.rules.length;
  }

  filesScanned(): number {
    return this.filesRead;
  }

  /** A new scan keeps new accounting; the numbers of the previous run are not inherited. */
  resetScanAccounting(): void {
    this.filesRead = 0;
  }

  scanFile(filePath: string, content: string): SecurityIssue[] {
    if (this.rules.length === 0) return [];
    const language = languageOfPath(filePath);
    const applicable = this.rules.filter((rule) => rule.languages.includes(language));
    if (applicable.length === 0) return [];
    // The cheap gate first: a file that names none of the constructs a rule
    // could match is never parsed. A scan works under a cap of 10,000 files and
    // 150 MB, and parsing every one of them would be the price of the rule pack.
    if (!applicable.some((rule) => rule.anchors.some((anchor) => content.includes(anchor))))
      return [];
    this.filesRead += 1;
    const source = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindOf(filePath),
    );
    const nodes = collectNodes(source);
    const lines = content.split("\n");
    const issues: SecurityIssue[] = [];
    const seen = new Set<string>();
    for (const rule of applicable) {
      for (const hit of ruleHits(rule, nodes, source)) {
        const line = source.getLineAndCharacterOfPosition(hit.node.getStart(source)).line + 1;
        const key = `${line}|${rule.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const frame = (lines[line - 1] ?? hit.node.getText(source)).trim();
        issues.push({
          type: ruleTypeFromId(rule.id),
          severity: rule.severity,
          score: THREAT_SCORE[rule.severity],
          line,
          // Masked at full length and then clipped, the same order the SARIF
          // mapper keeps for the engine's own snippet.
          code: maskSecretText(frame).slice(0, 120),
          message: rule.message,
          provenance: LOCAL_RULE_PROVENANCE,
          ruleId: rule.id,
          cwe: rule.cwe,
        });
      }
    }
    // The house pattern of a per-file adapter: the regex layer enriches its own
    // findings before they leave `scanFile`, and the batch merge does it for the
    // engine's. Enrichment here is what attaches the curated label, the German
    // twin and the category a reader filters by — a finding that skips it lands
    // in "not classified" even though its rule names a CWE.
    enrichIssues(issues, content);
    return issues;
  }
}
