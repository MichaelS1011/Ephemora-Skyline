import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";

/**
 * START-15 — the staging folder is checked before the port is bound.
 *
 * A scan reads the user's code from the copy staged under `CODECITY_UPLOAD_DIR`.
 * The engines that walk a tree follow the repository's ignore rules, so a
 * staging root an ignore rule covers is never opened: measured on two
 * byte-identical trees in one repository, the covered root scans as 0 files and
 * 0 findings, the uncovered one as 1 file and 1 finding. Both start the same
 * way today; only one of them ever looked. A start that accepts a covered root
 * hands the operator a clean city for a folder nobody read, so it refuses.
 *
 * What "covered" means is answered by the repository itself rather than by a
 * copy of its rule language here: a string match on `.gitignore` would disagree
 * with the engines on directory patterns, negations, the repository's private
 * exclude file and rules inherited from a parent folder.
 */

/** The knob the operator sets; named in every sentence this module produces. */
export const UPLOAD_DIR_ENV = "CODECITY_UPLOAD_DIR";

/**
 * A file name inside the staging root, asked about alongside the root itself.
 * A directory pattern (`build/`) cannot match a final component that does not
 * exist yet — and at start the root usually does not, the first upload creates
 * it. Something known to be inside the folder answers the question the scan
 * actually faces: would a file under this root be skipped?
 */
const PROBE_CHILD = ".staging-visibility-probe";

/** The check is a local filesystem question; it must never hold the start. */
export const DEFAULT_CHECK_TIMEOUT_MS = 2000;

export interface CheckResult {
  /** null when the command could not be run or was killed by its timeout */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

/**
 * The one question asked of the repository around the staging folder. Injectable
 * so the degradation paths (command missing, command hanging, command confused)
 * are testable without removing anything from a machine.
 */
export type IgnoreRun = (args: string[], cwd: string, timeoutMs: number) => Promise<CheckResult>;

export type StagingRootVerdict =
  /** No rule reaches the folder: the scan will see what is staged there. */
  | { state: "clear"; root: string }
  /** A rule covers the folder: a scan of it reports nothing without having looked. */
  | { state: "covered"; root: string; rule: string; ruleSource: string }
  /** The question could not be answered — said out loud, never passed in silence. */
  | { state: "unchecked"; root: string; reason: string };

export interface StartDecision {
  abort: boolean;
  /** What the start logs: the refusal, the warning, or nothing. */
  logLine: string | null;
}

export interface GuardOptions {
  run?: IgnoreRun;
  timeoutMs?: number;
}

const singleLine = (text: string, limit = 200): string => {
  const first = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (first ?? "").slice(0, limit);
};

/**
 * `git check-ignore -v` answers with the LAST pattern that matched, one line per
 * path, even when that pattern is a re-inclusion — and a re-included path is not
 * ignored, while the exit code still says "matched". So the pattern text, not
 * the exit code, decides.
 */
interface RuleMatch {
  rule: string;
  source: string;
}

function parseMatches(stdout: string): RuleMatch[] {
  const lastPerPath = new Map<string, RuleMatch>();
  for (const line of stdout.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const origin = line.slice(0, tab); // <source>:<line>:<pattern>
    const filePath = line.slice(tab + 1).trim();
    const first = origin.indexOf(":");
    const second = origin.indexOf(":", first + 1);
    if (first < 0 || second < 0 || !filePath) continue;
    lastPerPath.set(filePath, {
      source: origin.slice(0, first) + ":" + origin.slice(first + 1, second),
      rule: origin.slice(second + 1),
    });
  }
  return [...lastPerPath.values()];
}

/** The deepest directory on the way to `root` that really exists, `/` as the last. */
async function existingAncestor(root: string): Promise<string> {
  let current = root;
  for (let depth = 0; depth < 128; depth += 1) {
    const stat = await fs.stat(current).catch(() => null);
    if (stat?.isDirectory()) return current;
    const parent = path.dirname(current);
    if (parent === current) return parent;
    current = parent;
  }
  return path.parse(root).root;
}

/**
 * What `execFile` reports back. Node types the error as an errno carrying a
 * string code, but a command that ran and left with a status puts the exit
 * *number* there, and one killed by its timeout puts a signal name — all three
 * answers have to be told apart here for the verdicts to mean what they say.
 */
interface SpawnFailure extends Error {
  code?: number | string;
  killed?: boolean;
  signal?: NodeJS.Signals;
}

const runCheckIgnore: IgnoreRun = (args, cwd, timeoutMs) =>
  new Promise<CheckResult>((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: timeoutMs, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        const failure = error as SpawnFailure;
        // A command that never started says nothing about the folder, so it
        // leaves as the failure it is and `inspectStagingRoot` words it.
        if (typeof failure.code !== "number") {
          reject(failure);
          return;
        }
        resolve({
          code: failure.code,
          stdout,
          stderr: stderr || failure.message,
          // A command that left with 1 carries `signal: null`, so the signal has
          // to be a real signal name before this counts as "did not answer".
          timedOut: failure.killed === true || typeof failure.signal === "string",
        });
      },
    );
  });

/**
 * Ask the repository around `root` whether an ignore rule reaches it.
 *
 * Three answers: the folder is clear, it is covered, or the question could not
 * be asked. The second one refuses the start; the third one warns and starts,
 * for the reason spelled out in `decideStart`.
 */
export async function inspectStagingRoot(
  root: string,
  options: GuardOptions = {},
): Promise<StagingRootVerdict> {
  const run = options.run ?? runCheckIgnore;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const abs = path.resolve(root);
  const cwd = await existingAncestor(abs);
  const asked = [abs, path.join(abs, PROBE_CHILD)];

  let result: CheckResult;
  try {
    result = await run(["check-ignore", "-v", "--no-index", "--", ...asked], cwd, timeoutMs);
  } catch (error) {
    const failure = error as SpawnFailure;
    const reason =
      failure.code === "ENOENT"
        ? "this machine has no repository command to read the ignore rules with"
        : failure.code === "EACCES" || failure.code === "EPERM"
          ? "the repository command on this machine cannot be run"
          : singleLine(failure.message || "the ignore-rule check failed without an answer");
    return { state: "unchecked", root: abs, reason };
  }

  if (result.timedOut) {
    return {
      state: "unchecked",
      root: abs,
      reason: `the ignore-rule check did not answer within ${timeoutMs} ms`,
    };
  }

  // --no-index rather than the default: a folder that is both tracked and
  // covered is exactly the case the engines disagree about, and the question
  // asked here is whether a rule reaches the path, not what a commit carries.
  if (result.code === 0) {
    for (const match of parseMatches(result.stdout)) {
      if (!match.rule.startsWith("!")) {
        return { state: "covered", root: abs, rule: match.rule, ruleSource: match.source };
      }
    }
    return { state: "clear", root: abs };
  }
  if (result.code === 1) return { state: "clear", root: abs };

  // No repository around the folder: no rule that could cover it. This is the
  // common answer for the default root under the system temp folder, and it is
  // an answer, not a failure.
  if (result.code === 128 && /not a git repository|outside repository/i.test(result.stderr)) {
    return { state: "clear", root: abs };
  }

  return {
    state: "unchecked",
    root: abs,
    reason: singleLine(result.stderr || `the ignore-rule check left code ${String(result.code)}`),
  };
}

/** The refusal: the folder, the rule over it, the knob that moved it, the fix. */
export function refusalMessage(verdict: Extract<StagingRootVerdict, { state: "covered" }>): string {
  return (
    `refusing to start: the staging folder ${UPLOAD_DIR_ENV}="${verdict.root}" is covered by ` +
    `the ignore rule "${verdict.rule}" (${verdict.ruleSource}), so a scan reading the copies ` +
    `staged there follows the rules and opens nothing — it would report a clean city for a ` +
    `folder that was never looked at. Set ${UPLOAD_DIR_ENV} to a folder no ignore rule covers ` +
    `(the default sits under the system temp folder), or lift the rule.`
  );
}

/** The one line that says the check did not happen. */
export function uncheckedMessage(
  verdict: Extract<StagingRootVerdict, { state: "unchecked" }>,
): string {
  return (
    `started without checking the staging folder: ${verdict.reason}. If ` +
    `${UPLOAD_DIR_ENV}="${verdict.root}" sits where an ignore rule reaches it, a scan of the ` +
    `copies there can report nothing without having looked.`
  );
}

/**
 * Only a known-covered folder stops the start.
 *
 * "The check could not be asked" is deliberately not a refusal. The covered case
 * needs the repository's rules, and a machine without them almost always stages
 * into the system temp folder — a place no rule of any repository reaches
 * (measured: the default root answers "not a git repository"). Refusing on the
 * unknown would turn a missing command into an outage on every such machine
 * while preventing nothing, whereas the warning says the one true thing: the
 * area that reports nothing has not been shown to have been looked at.
 */
export function decideStart(verdict: StagingRootVerdict): StartDecision {
  if (verdict.state === "covered") return { abort: true, logLine: refusalMessage(verdict) };
  if (verdict.state === "unchecked") return { abort: false, logLine: uncheckedMessage(verdict) };
  return { abort: false, logLine: null };
}
