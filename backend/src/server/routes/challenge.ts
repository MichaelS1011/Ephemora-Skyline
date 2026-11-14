/**
 * challenge — grades one stored scan against the exercise key of its project.
 *
 * GET /api/result/:id/challenge → 200 ChallengeScore (see
 * services/security/challenge.ts for the shape and the two rules it holds:
 * a not-found item carries no path/line/type, and the key file's own findings
 * never count).
 *
 * The answer key is `.skyline-uebung.json` at the exercise root. It is read
 * from the staged upload copy — the same mechanism `source.ts` uses — because
 * the run archive persists only the result JSON, not the scanned files. Three
 * honest "no challenge here" answers, all clean JSON, never a stack trace:
 *
 *   404  no such analysis                      (like every /api/result route)
 *   404  staged copy gone (24h TTL) or no key  — a plain project, or a scan
 *                                               that aged out; scan again
 *   422  key present but not valid per contract — named code so the teacher
 *                                               can fix the kit
 */

import { promises as fs } from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { AnalysisResult } from "../../models/index.js";
import {
  ChallengeKeyError,
  EXERCISE_KEY_FILE,
  parseExerciseKey,
  scoreChallenge,
  type ChallengeFinding,
} from "../../services/security/challenge.js";
import { getStagedDir } from "./local-analyze.js";

/** Structural subset of the analysis store the handler needs */
type ResultStore = {
  get(id: string): AnalysisResult | undefined;
};

const NOT_AN_EXERCISE = {
  error:
    "No exercise key in this project — or the scanned copy is gone (24h TTL); scan the folder again.",
  code: "no_exercise_key",
} as const;

/** Flat projection of the result's findings; scoring drops the key file itself. */
function flattenFindings(result: AnalysisResult): ChallengeFinding[] {
  const findings: ChallengeFinding[] = [];
  for (const file of result.files) {
    for (const issue of file.vulnerabilities) {
      findings.push({ path: file.path, type: issue.type, line: issue.line });
    }
  }
  return findings;
}

export async function handleResultChallenge(
  req: Request,
  res: Response,
  analysisStore: ResultStore,
): Promise<void> {
  const id = typeof req.params["id"] === "string" ? req.params["id"] : "";

  const result = id ? analysisStore.get(id) : undefined;
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const stagedDir = getStagedDir(id);
  if (!stagedDir) {
    res.status(404).json(NOT_AN_EXERCISE);
    return;
  }

  // The key file is attacker-supplied content of the upload, so it gets the
  // same containment check the source route applies: a symlink that leaves
  // the staged copy does not hand out an answer key. Both ends resolved —
  // on macOS `/var` is itself a link to `/private/var`.
  const keyPath = path.resolve(stagedDir, EXERCISE_KEY_FILE);
  let rawKey: string;
  try {
    const [realStaged, realKey] = await Promise.all([fs.realpath(stagedDir), fs.realpath(keyPath)]);
    if (!realKey.startsWith(realStaged + path.sep)) {
      res.status(404).json(NOT_AN_EXERCISE);
      return;
    }
    rawKey = await fs.readFile(realKey, "utf-8");
  } catch {
    // No key file, or a dangling link: an ordinary project, not an error.
    res.status(404).json(NOT_AN_EXERCISE);
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawKey);
  } catch {
    res.status(422).json({ error: "Exercise key is not valid JSON.", code: "malformed_key" });
    return;
  }

  try {
    const key = parseExerciseKey(parsedJson);
    res.json(scoreChallenge(flattenFindings(result), key));
  } catch (error) {
    if (error instanceof ChallengeKeyError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    throw error;
  }
}
