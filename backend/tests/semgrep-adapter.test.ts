import { describe, it, expect } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SemgrepAdapter } from "../src/services/security/adapters/semgrep-adapter.js";

/**
 * Deliberately real, and not a `helpers/scanners.ts` candidate: the claim IS
 * the adapter's process decision — when it reaches for a binary, when for
 * Docker, and when neither. Every case below forces the unavailable states or
 * installs a fake `docker` on PATH that leaves a marker, so no real semgrep
 * binary ever runs; the probe is the subject, not the engine. The machine's
 * semgrep therefore never takes this file's load.
 */
describe("SemgrepAdapter", () => {
  it("falls back to empty when binary and docker unavailable", async () => {
    const adapter = new SemgrepAdapter();
    // force unavailable states
    (adapter as unknown as { binaryAvailable: boolean }).binaryAvailable = false;
    (adapter as unknown as { dockerAvailable: boolean }).dockerAvailable = false;
    const res = await adapter.scanBatch("/tmp");
    expect(res).toEqual([]);
  });

  it("scanFile returns empty (batch-oriented)", async () => {
    const adapter = new SemgrepAdapter();
    expect(await adapter.scanFile("a.ts", "eval(x)")).toEqual([]);
  });

  /**
   * The build runner has Docker and no semgrep binary, so without the gate the
   * first public CI run reaches for a registry image inside a test that waits
   * 30 s — the badge would measure the network.
   *
   * Proved both ways against a `docker` that COUNTS the times it was asked.
   * Asserting only "the call came back empty" would pass on a machine without
   * Docker, which is every machine except the one that matters.
   *
   * What is measured is the number of requests, not the wall clock: the bound
   * here used to be "under two seconds", and it failed on the runs where the
   * frontend suite was busy beside this one — a stopwatch under load measures
   * the machine, not the gate. A closed fallback is the absence of a request,
   * and that is countable in any load.
   */
  it("leaves Docker alone when the machine says its images are not an engine", async () => {
    const bin = mkdtempSync(path.join(tmpdir(), "fake-docker-bin-"));
    const asked = path.join(bin, "was-asked.log");
    writeFileSync(
      path.join(bin, "docker"),
      `#!/bin/sh\nprintf asked\\n >> ${asked}\necho "Docker version 28.0.4, build fake"\n`,
    );
    chmodSync(path.join(bin, "docker"), 0o755);
    const requests = () =>
      existsSync(asked) ? readFileSync(asked, "utf8").split("\n").filter(Boolean).length : 0;

    const prevPath = process.env.PATH;
    const prevFlag = process.env.SEMGREP_DOCKER;
    // This test owns its environment. A sibling file that leaves the offline
    // switch on (rule-packs.test.ts sets SKYLINE_OFFLINE) changes what the
    // adapter is allowed to reach for, and then the counter stays untouched for
    // a reason that has nothing to do with the gate under test.
    const prevOffline = process.env.SKYLINE_OFFLINE;
    delete process.env.SKYLINE_OFFLINE;
    process.env.PATH = `${bin}:${prevPath}`;
    const withoutDocker = () => {
      const adapter = new SemgrepAdapter();
      (adapter as unknown as { binaryAvailable: boolean }).binaryAvailable = false;
      return adapter;
    };

    try {
      delete process.env.SEMGREP_DOCKER;
      expect(await withoutDocker().scanBatch("/tmp")).toEqual([]);
      expect(
        requests(),
        "with Docker on the machine, the fallback does reach for it",
      ).toBeGreaterThan(0);

      const beforeGate = requests();
      process.env.SEMGREP_DOCKER = "0";
      const gated = withoutDocker();
      expect(await gated.scanBatch("/tmp")).toEqual([]);
      expect(requests(), "SEMGREP_DOCKER=0 must close the fallback before any probe").toBe(
        beforeGate,
      );
      expect(
        (gated as unknown as { dockerAvailable: boolean | null }).dockerAvailable,
        "the gate settles the state instead of leaving it to be probed again",
      ).toBe(false);
    } finally {
      process.env.PATH = prevPath;
      if (prevOffline === undefined) delete process.env.SKYLINE_OFFLINE;
      else process.env.SKYLINE_OFFLINE = prevOffline;
      if (prevFlag === undefined) delete process.env.SEMGREP_DOCKER;
      else process.env.SEMGREP_DOCKER = prevFlag;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
