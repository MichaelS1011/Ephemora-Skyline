import { readFileSync } from "fs";
import path from "path";

/**
 * The version the product reports is the version its package declares. A
 * second, hand-typed number drifts the moment either one is bumped — the
 * health endpoint did report 1.0.0 while the package said 0.1.0.
 */
export const APP_VERSION: string = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../package.json"), "utf-8"),
).version;
