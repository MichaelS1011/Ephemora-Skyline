import { readFileSync } from "fs";
import path from "path";

/**
 * The version the product reports is the version its package declares. A
 * second, hand-typed number drifts the moment either one is bumped — the
 * health endpoint did report 1.0.0 while the package said 0.1.0.
 */
const readVersion = (relative: string): string | null => {
  try {
    const parsed = JSON.parse(readFileSync(path.join(import.meta.dirname, relative), "utf-8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : null;
  } catch {
    return null;
  }
};

export const APP_VERSION: string =
  // <backend>/package.json in a checkout; the installed package does not ship
  // the backend manifest (npm keeps manifests out of `files`), so the package's
  // own manifest sits two levels above the same file. Measured: an import-time
  // throw here killed the launcher before it could print a single line.
  readVersion("../package.json") ?? readVersion("../../package.json") ?? "0.0.0";
