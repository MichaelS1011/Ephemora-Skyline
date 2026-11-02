import { defineConfig } from "vitest/config";
import { tmpdir } from "os";
import path from "path";

/**
 * Tests fast-forward the upload TTL, so they must never sweep the real staging
 * root — that is the user's folder. One isolated root for the whole suite.
 */
const UPLOAD_ROOT = path.join(tmpdir(), "ephemora-skyline-uploads-tests");

export default defineConfig({
  test: {
    globals: true,
    env: { EPHEMORA_UPLOAD_DIR: UPLOAD_ROOT },
  },
});
