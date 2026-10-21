import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  AnalysisOrchestrator,
  emptyDroppedFiles,
  sumDroppedFiles,
} from "../src/services/analyzer/orchestrator.js";
import { quietScanner } from "./helpers/scanners.js";
import type { DroppedFiles, GitHubRepo } from "../src/models/index.js";

/**
 * The arithmetic the first drive checked on a screen, checked without one.
 *
 * The drive (scripts/first-drive.mjs) hands a folder to a running app and reads
 * three numbers off the page: how many files were analyzed, how many went
 * unread, and the line that names the reason. Their sum has to be the folder.
 * That claim cannot live only in a browser run, or the next refactor that moves
 * a counter breaks the promise and CI never notices.
 *
 * Two things make the sum easy to lose, and both are in this folder:
 *
 *  - A path can leave at the reader instead of at the scanner. The image below
 *    never reaches the server at all, so only the reader's own record knows it
 *    existed. The screen's number is the sum of the two records
 *    (`sumDroppedFiles`), and a seventh reason that joins one side and not the
 *    other shows up as a folder that does not add up.
 *  - A path can leave because the project's own .gitignore names it. Then
 *    neither record counts it: it is skipped whole, and lives in a third field.
 *
 * The tree is built here, in a temporary directory of this test's own. It is
 * not a folder of this repository and nothing outside it is read.
 *
 * No engine runs either: the account is a path-selection question, and
 * `quietScanner()` from `helpers/scanners.ts` answers it without a child process
 * and without the stale `scanDependencies` shape this file's own stub carried
 * (`{ issuesByFile, executed }` instead of the shipped `{ executed, added,
 * runner }`). Nothing here asserted on that field, so nothing here changed — the
 * shape was simply wrong, and now it cannot be.
 */

const repo = (name: string): GitHubRepo => ({
  owner: "local",
  name,
  branch: "local",
  cloneUrl: "",
  analyzedAt: new Date().toISOString(),
});

/**
 * A person's folder, as it stands on their disk. Eleven paths: five the scan
 * reads, four it declines for their format, one the project's own rules keep
 * out, one the reader never uploads.
 */
const FOLDER: Record<string, string> = {
  "src/app.ts": "export function app(): number { return 3 }\n",
  "src/View.tsx": "export const View = () => <p>three</p>;\n",
  "db/schema.sql": "CREATE TABLE accounts (id INTEGER PRIMARY KEY);\n",
  "package.json": '{"name":"fahrt-account","private":true}\n',
  ".env": "DEPLOY_TOKEN=rotate-me\n",
  "README.md": "# account\n",
  Makefile: "list:\n\t@ls\n",
  "data/seed.csv": "name\nada\n",
  ".gitignore": "secret.json\n",
  "secret.json": '{"kept":"out by the project itself"}\n',
  "assets/logo.png": "not a scan format, and never uploaded\n",
};

const PATHS_ON_DISK = Object.keys(FOLDER).length;

/**
 * What the reader hands over: everything except the image, which its own
 * selection declines and which therefore only the reader's record can count.
 * The claim is the drive's: the reader says "1 path in a format I do not read"
 * and the server never sees that path again.
 */
const UPLOADED = Object.keys(FOLDER).filter((p) => p !== "assets/logo.png");
const readerSays: DroppedFiles = {
  ...emptyDroppedFiles(),
  unsupportedFormat: PATHS_ON_DISK - UPLOADED.length,
};

async function writeTree(dir: string, files: string[]): Promise<void> {
  for (const rel of files) {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, FOLDER[rel]!);
  }
}

const unreadOf = (d: DroppedFiles | undefined): number =>
  Object.values(d ?? {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

describe("the folder's account, as the drive reads it off the screen", () => {
  let root = "";
  let folder = "";
  let staged = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "codecity-fahrt-account-"));
    folder = path.join(root, "folder");
    staged = path.join(root, "staged");
    await writeTree(folder, Object.keys(FOLDER));
    // the staged copy is what the upload route lays down for the scanner: the
    // folder minus the path the reader did not take along
    await writeTree(staged, UPLOADED);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("counts the eleven paths of the folder it was handed", async () => {
    const result = await new AnalysisOrchestrator(quietScanner()).analyzeDirectory(
      "fahrt-account",
      staged,
      repo("fahrt-account"),
    );
    const s = result.summary;
    const skipped = s.skippedByGitignore?.files ?? 0;

    // every path leaves a mark in exactly one of the three places
    expect(s.totalFiles + unreadOf(s.dropped) + skipped, "of the uploaded paths").toBe(
      UPLOADED.length,
    );
    // and the number the screen prints is the upload half plus the read half
    const merged = sumDroppedFiles(readerSays, s.dropped);
    expect(s.totalFiles + unreadOf(merged) + skipped).toBe(PATHS_ON_DISK);
  });

  it("puts each path in the record that actually met it", async () => {
    const result = await new AnalysisOrchestrator(quietScanner()).analyzeDirectory(
      "fahrt-account",
      staged,
      repo("fahrt-account"),
    );
    const dropped = result.summary.dropped ?? emptyDroppedFiles();
    // five of the ten are a format the scanners read; the other four are not
    expect(result.summary.totalFiles).toBe(5);
    expect(dropped.unsupportedFormat).toBe(4);
    expect(dropped).toMatchObject({
      pathTooLong: 0,
      unsafePath: 0,
      tooLarge: 0,
      unreadable: 0,
      excluded: 0,
      gitIgnored: 0,
      gitBudget: 0,
    });
    // the image the reader declined is not silently the scanner's to count
    expect(unreadOf(sumDroppedFiles(readerSays, dropped))).toBe(5);
    // the project's own rule took one path out of both counts, and says so
    expect(result.summary.skippedByGitignore?.files).toBe(1);
  });

  /**
   * The account is a claim, not a tautology: one reason missing from the record
   * and the folder stops adding up. Shown here rather than asserted somewhere
   * out of sight, because a test that cannot fail proves nothing about the
   * number it prints.
   */
  it("goes wrong the moment one reason stops counting", async () => {
    const result = await new AnalysisOrchestrator(quietScanner()).analyzeDirectory(
      "fahrt-account",
      staged,
      repo("fahrt-account"),
    );
    const full = result.summary.dropped ?? emptyDroppedFiles();
    const oneReasonRemoved: DroppedFiles = { ...full, unsupportedFormat: 0 };
    const merged = sumDroppedFiles(readerSays, oneReasonRemoved);
    const skipped = result.summary.skippedByGitignore?.files ?? 0;

    expect(
      result.summary.totalFiles + unreadOf(merged) + skipped,
      "a folder of eleven, accounted for as six",
    ).not.toBe(PATHS_ON_DISK);
    expect(result.summary.totalFiles + unreadOf(merged) + skipped).toBe(PATHS_ON_DISK - 4);
  });

  it("does not lose the path the project ignored, even when nothing else would", async () => {
    // the same folder without its .gitignore: the ignored file joins the scan's
    // own account instead of vanishing from it
    const plain = path.join(root, "plain");
    await writeTree(
      plain,
      UPLOADED.filter((p) => p !== ".gitignore" && p !== "secret.json"),
    );
    const result = await new AnalysisOrchestrator(quietScanner()).analyzeDirectory(
      "fahrt-account-plain",
      plain,
      repo("fahrt-account-plain"),
    );
    expect(result.summary.totalFiles + unreadOf(result.summary.dropped)).toBe(8);
    expect(result.summary.skippedByGitignore?.files ?? 0).toBe(0);
  });
});

/** the two records are one number; that merge is the screen's whole claim */
describe("the reader's count and the scanner's count are summed, not chosen", () => {
  it("adds the halves without dropping a reason", () => {
    const reader: DroppedFiles = {
      ...emptyDroppedFiles(),
      unsupportedFormat: 1,
      excluded: 2,
    };
    const server: DroppedFiles = {
      ...emptyDroppedFiles(),
      unsupportedFormat: 4,
      pathTooLong: 30,
    };
    const merged = sumDroppedFiles(reader, server);
    expect(merged).toEqual({
      pathTooLong: 30,
      unsafePath: 0,
      tooLarge: 0,
      unreadable: 0,
      excluded: 2,
      gitIgnored: 0,
      gitBudget: 0,
      unsupportedFormat: 5,
      preview: 0,
    });
    expect(unreadOf(merged)).toBe(37);
  });

  it("counts nothing that is not a number", () => {
    const junk = { ...emptyDroppedFiles(), unreadable: Number.NaN } as unknown as DroppedFiles;
    expect(unreadOf(sumDroppedFiles(junk, emptyDroppedFiles()))).toBe(0);
  });
});
