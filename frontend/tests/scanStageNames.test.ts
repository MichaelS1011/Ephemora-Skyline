/**
 * The wait screen in the language the user switched on.
 *
 * Measured in the audit: a DE scan answered "Waiting for scan…", "Deep scan
 * (semgrep + gitleaks)" and "Complete!" — English exactly where the person was
 * standing and waiting. These tests pin the two halves: every stage the pipeline
 * can name must be mapped, and no mapped stage may reach the screen as English
 * while the display language is German.
 */

import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { DICT, t } from "../src/i18n";
import {
  RAW_STAGE_NAMES,
  SCAN_STAGES,
  progressLine,
  stageEntries,
  stageKeyOf,
} from "../src/config/scanStages";

const REPO = path.resolve(import.meta.dirname, "..", "..");

/** Every `emit(<number>, "<stage>")` the orchestrator contains. */
async function emittedStages(): Promise<string[]> {
  const src = await readFile(
    path.join(REPO, "backend/src/services/analyzer/orchestrator.ts"),
    "utf-8",
  );
  return [...src.matchAll(/emit\(\s*\d+\s*,\s*"([^"]+)"\s*\)/g)].map((m) => m[1]!);
}

/** Words that only ever mean something in English here. Tool names (semgrep,
 * gitleaks, npm, CVE) are proper names and stay in both languages. */
const ENGLISH_ONLY =
  /\b(files|file|reading|parsing|scan|complete|analysis|analyzing|detecting|finalizing|dependency|audit|history|duplicates|reports|waiting|uploading)\b/i;

describe("the stage table is pinned to the pipeline", () => {
  it("maps every stage the orchestrator emits", async () => {
    const emitted = await emittedStages();
    expect(emitted.length).toBeGreaterThanOrEqual(8);
    for (const raw of emitted) {
      expect(stageKeyOf(raw), `no dictionary key for the stage "${raw}"`).not.toBeNull();
      expect(RAW_STAGE_NAMES, `"${raw}" missing from the table`).toContain(raw);
    }
  });

  it("knows each stage's key in the dictionary, in both languages", () => {
    for (const key of SCAN_STAGES) {
      const entry = DICT[key];
      expect(entry, `"${key}" is not in the dictionary`).toBeDefined();
      expect(entry!.en.trim()).not.toBe("");
      expect(entry!.de.trim()).not.toBe("");
    }
  });
});

describe("a German wait screen stays German", () => {
  it("answers no English word for any real stage", async () => {
    for (const raw of await emittedStages()) {
      const line = progressLine("de", raw);
      expect(line, `"${raw}" showed up as English`).not.toBe(raw);
      const stripped = line.replaceAll(/semgrep|gitleaks|npm|CVE/giu, "");
      expect(stripped, `"${raw}" → "${line}" still English`).not.toMatch(ENGLISH_ONLY);
    }
  });

  it("answers the generic running sentence for a stage nobody mapped", () => {
    expect(progressLine("de", "Quantum flange alignment")).toBe(t("de", "analyze.pickAriaBusy"));
    expect(progressLine("de", "Quantum flange alignment")).not.toMatch(/[A-Z][a-z]+ [a-z]+ing/);
  });

  it("ticks the stages that ran and leaves the rest alone", () => {
    const entries = stageEntries("de", "Deep scan (semgrep + gitleaks)");
    const states = entries.map((e) => e.state);
    expect(states.slice(0, 2)).toEqual(["done", "done"]);
    expect(entries[2]!.state).toBe("active");
    expect(states.slice(3).every((s) => s === "todo")).toBe(true);
    // nothing is claimed before the server named its first stage
    expect(stageEntries("de", null).every((e) => e.state === "todo")).toBe(true);
  });

  it("labels the last stage as finished, not as an English word", () => {
    const done = stageEntries("de", "Analysis complete");
    expect(done.at(-1)!.state).toBe("active");
    expect(done.at(-1)!.label).toBe(t("de", "stage.done"));
  });
});
