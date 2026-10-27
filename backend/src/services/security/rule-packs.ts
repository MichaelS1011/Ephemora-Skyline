import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import type { FindingCategory } from "../../models/index.js";

/**
 * Rule packs — a named, versioned bundle of semgrep rules that a scan can be
 * pointed at.
 *
 * The reason this exists is a licence, not a count: `semgrep --config
 * p/security-audit` fetches its rules from semgrep.dev *during the scan* — how
 * many, on which day, is the registry's answer and no file in this repository
 * can show it — and the Semgrep Rules License v1.0 says in as many words "This
 * license does not allow you to distribute the rules, or to make them available
 * to others as a service." So
 * the registry packs are not ours to ship. What we ship is rules we wrote and
 * own, tested against positive and negative fixtures, and a second root where
 * a user can put packs they fetched themselves.
 *
 * Two roots, one registry view:
 *   <backend>/rules/<id>/            shipped with the program, origin "shipped"
 *   ~/.ephemora-skyline/rule-packs/  the user's own, origin "fetched"
 *
 * A pack is selected by id, never by path — a client-supplied path would be a
 * directory the scanner reads rules from anywhere on the machine.
 */

export interface RulePack {
  id: string;
  name: string;
  version: string;
  origin: "shipped" | "fetched";
  /** Where the rules came from — "Eigenentwicklung" for our own. */
  source: string;
  license: string;
  /** Which of the category axis this pack can fill. */
  categories: FindingCategory[];
  languages: string[];
  ruleCount: number;
  /** The pack every profile falls back to when the user selected none. */
  default: boolean;
  /** Absolute directory holding the rule YAML files. */
  dir: string;
  note?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Shipped packs live next to the built package, at the same relative depth in src and dist. */
export function shippedPacksRoot(): string {
  return process.env.CODECITY_RULES_DIR || path.resolve(here, "..", "..", "..", "rules");
}

/** Where a user's own fetched packs go. Overridable so tests never touch the home dir. */
export function fetchedPacksRoot(): string {
  return (
    process.env.CODECITY_RULE_PACK_DIR || path.join(os.homedir(), ".ephemora-skyline", "rule-packs")
  );
}

const PACK_ID = /^[a-z0-9][a-z0-9._-]{0,40}$/;

interface RawManifest {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  origin?: unknown;
  source?: unknown;
  license?: unknown;
  categories?: unknown;
  languages?: unknown;
  ruleCount?: unknown;
  default?: unknown;
  note?: unknown;
}

/**
 * Every rule id in the pack's YAML files — the number a manifest has to match.
 * Anchored to a bare identifier so a message line that happens to read "id: …"
 * inside a folded block cannot inflate the count.
 */
const RULE_ID_LINE = /^[ \t]*-[ \t]+id:[ \t]*[A-Za-z0-9][A-Za-z0-9._-]*[ \t]*$/gm;

function countRules(dir: string): number {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const text = fs.readFileSync(path.join(dir, entry.name), "utf-8");
    n += [...text.matchAll(RULE_ID_LINE)].length;
  }
  return n;
}

function readPack(dir: string, origin: "shipped" | "fetched"): RulePack | null {
  const manifestPath = path.join(dir, "pack.json");
  let raw: RawManifest;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as RawManifest;
  } catch {
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id : "";
  // The directory name is the id. A manifest that renames itself would let one
  // pack shadow another.
  if (!PACK_ID.test(id) || id !== path.basename(dir)) return null;
  const actual = countRules(dir);
  const declared = typeof raw.ruleCount === "number" ? raw.ruleCount : -1;
  // A pack that promises 12 rules and ships 9 is a lie in the UI, not a typo.
  if (declared !== actual) return null;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : id,
    version: typeof raw.version === "string" ? raw.version : "0",
    origin,
    source: typeof raw.source === "string" ? raw.source : origin,
    license: typeof raw.license === "string" ? raw.license : "unbekannt",
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((c): c is FindingCategory => typeof c === "string")
      : [],
    languages: Array.isArray(raw.languages)
      ? raw.languages.filter((l): l is string => typeof l === "string")
      : [],
    ruleCount: actual,
    default: raw.default === true,
    dir,
    note: typeof raw.note === "string" ? raw.note : undefined,
  };
}

function packsIn(root: string, origin: "shipped" | "fetched"): RulePack[] {
  if (!fs.existsSync(root)) return [];
  const out: RulePack[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pack = readPack(path.join(root, entry.name), origin);
    if (pack) out.push(pack);
  }
  return out;
}

/** All selectable packs: shipped first, then the user's own. */
export function listPacks(): RulePack[] {
  return [...packsIn(shippedPacksRoot(), "shipped"), ...packsIn(fetchedPacksRoot(), "fetched")];
}

export function packById(id: string): RulePack | undefined {
  return listPacks().find((p) => p.id === id);
}

/**
 * Keep only ids that name a real pack. An unknown id is an error, not a silent
 * drop — a scan that quietly narrowed itself is the failure mode this whole
 * module exists to avoid.
 */
export function validatePackIds(value: unknown, errors: string[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push("rulePacks: expected an array of pack ids");
    return [];
  }
  const known = new Set(listPacks().map((p) => p.id));
  const kept: string[] = [];
  for (const entry of value) {
    const id = typeof entry === "string" ? entry : "";
    if (!PACK_ID.test(id)) {
      errors.push(`rulePacks: invalid pack id "${String(entry)}"`);
    } else if (!known.has(id)) {
      errors.push(`rulePacks: unknown pack "${id}"`);
    } else if (!kept.includes(id)) {
      kept.push(id);
    }
  }
  return kept;
}

/** The directories semgrep should load rules from, in selection order. */
export function semgrepRuleDirs(ids: string[]): string[] {
  return ids.map((id) => packById(id)?.dir).filter((d): d is string => typeof d === "string");
}

/**
 * The packs a scan falls back to when the reader selected none — the ones whose
 * own manifest says `default: true`, which is what `RulePack.default` has always
 * meant and nothing ever read. Without it the shipped pack is a folder on disk
 * that no scan sees, and the sentence in its manifest is a claim about a file.
 */
export function defaultPackDirs(): string[] {
  return listPacks()
    .filter((pack) => pack.default)
    .map((pack) => pack.dir);
}

/**
 * Which rule directories a scan's own rule channel reads: the selected packs,
 * or the shipped default when nothing was selected.
 *
 * The semgrep path deliberately keeps using `semgrepRuleDirs()` instead: an
 * empty selection there is the registry string `p/security-audit`, which is a
 * network fetch and a licence question, not a fallback we own.
 */
export function ruleDirsForScan(ids: string[]): string[] {
  return ids.length > 0 ? semgrepRuleDirs(ids) : defaultPackDirs();
}
