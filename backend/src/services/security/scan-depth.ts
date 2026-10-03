import type { ProjectSummary } from "../../models/index.js";

/**
 * Which scanner could have said something about a file of this language.
 *
 * A building is coloured "safe" when nothing was found in it. When the engine
 * that would have looked was switched off, that colour is a claim about the
 * file and not about the scan. Measured on the Quick profile over this repo:
 * 169 of 173 buildings looked clean while semgrep and ruff never ran.
 *
 * The list names only engines that would have covered the language at all —
 * asking for ruff on a CSS file would turn an honest gap into noise.
 */
const ENGINES_BY_LANGUAGE: Array<{
  key: "gitleaks" | "semgrep" | "ruff";
  label: string;
  languages: "all" | ReadonlySet<string>;
}> = [
  { key: "gitleaks", label: "gitleaks", languages: "all" },
  {
    key: "semgrep",
    label: "semgrep",
    languages: new Set([
      "JavaScript",
      "TypeScript",
      "Python",
      "Java",
      "Kotlin",
      "Go",
      "PHP",
      "Ruby",
      "Rust",
      "CSharp",
      "Swift",
      "JSON",
      "YAML",
      "SQL",
      "Shell",
      "HTML",
      "Terraform",
    ]),
  },
  { key: "ruff", label: "ruff", languages: new Set(["Python"]) },
];

export function missingEnginesFor(
  language: string,
  provenance: ProjectSummary["scanProvenance"],
): string[] {
  if (!provenance) return [];
  return ENGINES_BY_LANGUAGE.filter(
    (e) => (e.languages === "all" || e.languages.has(language)) && provenance[e.key] !== true,
  ).map((e) => e.label);
}
