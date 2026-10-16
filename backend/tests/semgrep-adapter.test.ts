import { describe, it, expect } from "vitest";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
   * Proved both ways against a `docker` that leaves a mark when it is asked.
   * Asserting only "the call came back empty" would pass on a machine without
   * Docker, which is every machine except the one that matters.
   */
  it("leaves Docker alone when the machine says its images are not an engine", async () => {
    const bin = mkdtempSync(path.join(tmpdir(), "fake-docker-bin-"));
    const marker = path.join(bin, "was-asked");
    writeFileSync(
      path.join(bin, "docker"),
      `#!/bin/sh\ntouch ${marker}\necho "Docker version 28.0.4, build fake"\n`,
    );
    chmodSync(path.join(bin, "docker"), 0o755);

    const prevPath = process.env.PATH;
    const prevFlag = process.env.SEMGREP_DOCKER;
    process.env.PATH = `${bin}:${prevPath}`;
    const withoutDocker = () => {
      const adapter = new SemgrepAdapter();
      (adapter as unknown as { binaryAvailable: boolean }).binaryAvailable = false;
      return adapter;
    };

    try {
      delete process.env.SEMGREP_DOCKER;
      expect(await withoutDocker().scanBatch("/tmp")).toEqual([]);
      expect(existsSync(marker), "with Docker on the machine, the fallback does reach for it").toBe(
        true,
      );

      rmSync(marker);
      process.env.SEMGREP_DOCKER = "0";
      const gated = withoutDocker();
      const started = Date.now();
      expect(await gated.scanBatch("/tmp")).toEqual([]);
      expect(existsSync(marker), "SEMGREP_DOCKER=0 must close the fallback before any probe").toBe(
        false,
      );
      expect(
        (gated as unknown as { dockerAvailable: boolean | null }).dockerAvailable,
        "the gate settles the state instead of leaving it to be probed again",
      ).toBe(false);
      expect(Date.now() - started, "no probe, no pull, no waiting").toBeLessThan(2000);
    } finally {
      process.env.PATH = prevPath;
      if (prevFlag === undefined) delete process.env.SEMGREP_DOCKER;
      else process.env.SEMGREP_DOCKER = prevFlag;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
