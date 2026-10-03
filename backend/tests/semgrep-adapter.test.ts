import { describe, it, expect } from "vitest";
import { SemgrepAdapter } from "../src/services/security/adapters/semgrep-adapter.js";

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
});
