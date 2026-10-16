/**
 * Time budgets for the engine test files — public numbers, not cases.
 *
 * The three files whose claim is an engine run carry their per-test timeout as
 * a named constant here: `batch-merge-contract.test.ts` (the merge is the
 * claim, the engines are stubbed), `gitleaks-paths.test.ts` (real gitleaks:
 * working tree + history) and `rule-packs.test.ts` (real semgrep: one run +
 * two concurrent runs). The literals used to sit at the call sites; the
 * comments that explained them live with the constants now.
 *
 * No file here is named `*.test.ts`: this is a helper, not a published test
 * file, and it must not move the suite's file count.
 */

/**
 * 30 s — the batch-merge contract (`batch-merge-contract.test.ts`).
 *
 * The merge is the claim, not the engines: the gitleaks hit is handed in as a
 * fixed batch answer through `stubAdapters()` (the same injection the
 * constructor accepts, no cast into private fields), semgrep is absent, and
 * ruff/osv get inert stubs. No child process — the budget only bounds the
 * merge itself.
 */
export const MERGE_CONTRACT_BUDGET_MS = 30_000;

/**
 * 60 s — one real gitleaks scan over the working tree
 * (`gitleaks-paths.test.ts`).
 *
 * The two scans in that file are `skipIf(!bin)`-guarded and carry their own
 * budgets — the engine here is the subject. The keying question (absolute
 * working-tree path vs commit-relative history path) is only answered by the
 * real binary, not by a `helpers/scanners.ts` stub.
 */
export const GITLEAKS_SCAN_BUDGET_MS = 60_000;

/**
 * 90 s — the history test, which pays for two real scans: the deep run with
 * `gitHistory: true` and the standard run it is compared against.
 */
export const GITLEAKS_HISTORY_BUDGET_MS = 90_000;

/**
 * 180 s — one real semgrep run (`rule-packs.test.ts`).
 *
 * Deliberately real semgrep: which rules a pack contributes is a question only
 * the engine answers — a stub can restate a config string, it cannot show that
 * `semgrep --rule-dirs <pack>` reads the pack's yaml and finds the pattern in
 * a file. A present binary always runs the assertions, and this per-test
 * timeout is what a slow engine needs.
 */
export const SEMGREP_RUN_BUDGET_MS = 180_000;

/**
 * 300 s — two runs started at the same time. The budget pays for both, not
 * just one: the file pays for a real run because the load here is the subject,
 * not a side effect.
 */
export const SEMGREP_CONCURRENT_BUDGET_MS = 300_000;
