import { describe, expect, it } from "vitest";
import {
  classifyCandidate,
  emptyPlan,
  notePrunedToolFolder,
  type FolderPlan,
} from "../src/hooks/useLocalAnalysis";

/**
 * Fund 2026-10-31/F1 (fremde Repos): README sells one sentence —
 * "Nothing leaves the count without a number." Measured on four real foreign
 * repositories through the shipped reader, that sentence only holds for the
 * files the reader LISTED. Tool-output folders are pruned before any file
 * inside them is seen, and no counter ever learns they existed:
 *
 *   <repo>            files on disk   files the card accounts for
 *   gods-eye-view            11 819                    483  (4,05 %)
 *   MoneyPrinterTurbo        19 262                    204  (1,06 %)
 *   aether-benchmark         3 328                     259  (7,78 %)
 *   MiMi Webseite +        149 386                     373  (0,25 %)
 *
 * The pruned trees are not exotic: 18 968 of MoneyPrinterTurbo's files sit in
 * one `.venv`, 148 593 of the website folder's in `node_modules`. A person who
 * picks their project and reads "119 files analyzed" over a folder the Finder
 * shows as 19 259 has no way to know the scan saw a village and skipped a city.
 *
 * The fixture below is synthetic — the shape, not the code. It drives the real
 * classifier the shipped reader calls, so the number is the product's own.
 */

const file = (name: string, bytes = 32): File =>
  new File([new Uint8Array(bytes)], name, { lastModified: 0 });

/** Everything the plan can name: what joined the read, plus every counted reason. */
function accounted(plan: FolderPlan): number {
  return (
    plan.candidates.length +
    Object.values(plan.dropped).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
  );
}

describe("a pruned tool folder still owes the user a number", () => {
  for (const rel of [
    "node_modules/left-pad/index.js",
    ".venv/lib/site-packages/whatever/module.py",
    "__pycache__/latin1_mod.cpython-311.pyc",
    "dist/bundle.min.js",
    "vendor/php-package/src/Client.php",
    "build/generated/Stub.java",
  ]) {
    it(`counts ${rel.split("/")[0]}/ instead of swallowing it`, () => {
      const plan = emptyPlan();
      classifyCandidate(rel, file(rel), [], plan, null);
      expect(
        accounted(plan),
        `${rel} left the scan and no counter knows it — the folder's file total moves by one and the city never mentions it`,
      ).toBe(1);
    });
  }

  it("counts the 45 files a real folder hid behind tool directories", () => {
    // The shape measured on a real repository: MoneyPrinterTurbo offered 19 259
    // files, the reader named 4 of them in its "set aside" rows.
    const plan = emptyPlan();
    const offered: Array<string> = [
      "app/main.py",
      "app/services/voice.py",
      "cli.py",
      "README.md",
      ...Array.from({ length: 40 }, (_, i) => `.venv/lib/site-packages/pkg/mod${i}.py`),
      ...Array.from({ length: 3 }, (_, i) => `deps-checkout/src/client${i}.py`),
      ...Array.from({ length: 2 }, (_, i) => `build/out/generated${i}.java`),
    ];
    for (const rel of offered) classifyCandidate(rel, file(rel), [], plan, null);
    // `deps-checkout` is not a name the reader knows, so its 3 files must join
    // the read; every other path has to end up in a counter.
    expect(
      accounted(plan),
      "every offered path must end up either in the read or in a counted reason",
    ).toBe(offered.length);
  });

  it("keeps a file the scan never lists distinguishable from a folder of one", () => {
    // A user cannot act on a missing number: the way around a tool folder is the
    // exclude field on the entry screen, and that answer needs a count.
    const plan = emptyPlan();
    for (let i = 0; i < 12; i++) {
      classifyCandidate(
        `node_modules/pkg${i}/index.js`,
        file(`node_modules/pkg${i}/index.js`),
        [],
        plan,
        null,
      );
    }
    expect(
      Object.values(plan.dropped).reduce((sum, n) => sum + n, 0),
      "twelve files left the scan; the drop rows still add up to zero",
    ).toBe(12);
  });

  it("counts a tool folder the walk cut off whole, once, by its path", () => {
    // The other picker: a directory handle walk never lists what is inside a
    // tool folder, so the folder itself is the number. One folder, one count —
    // the `setAside` rule — and twelve files in it must not become twelve rows.
    const plan = emptyPlan();
    notePrunedToolFolder(plan, "app/.venv");
    notePrunedToolFolder(plan, "app/.venv");
    notePrunedToolFolder(plan, "node_modules");
    expect(plan.dropped.toolFolders).toBe(2);
    expect(plan.prunedToolFolders.size, "one folder stays one number").toBe(2);
    expect(plan.dropped.toolFolderFiles ?? 0, "the walk never counted those files").toBe(0);
  });
});
