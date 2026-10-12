#!/usr/bin/env node
/**
 * Download/clone statistics for Ephemora Skyline — admin tool, runs with
 * YOUR GitHub token (never shipped to users). GitHub counts clones and
 * views natively for public repos; no user-facing tracking exists or is
 * needed for this.
 *
 * Which repository to ask about is read from this checkout's `origin` remote,
 * so a fork or a renamed account measures itself instead of someone else. Set
 * GH_REPO=owner/name to aim it somewhere else.
 *
 * Usage: GH_TOKEN=ghp_xxx node scripts/clone-stats.mjs
 * Docs: https://docs.github.com/en/rest/metrics/traffic
 */

import { execFileSync } from "child_process";

/** `owner/name` from the origin remote, for both the https and the ssh form. */
function repositoryFromOrigin() {
  let url = "";
  try {
    url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No `origin` remote here. Set GH_REPO=owner/name.");
  }
  const slug = url.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?\/?$/i)?.[1];
  if (!slug) throw new Error(`Origin is not a GitHub repository (${url}). Set GH_REPO=owner/name.`);
  return slug;
}

const token = process.env.GH_TOKEN;

if (!token) {
  console.error("Set GH_TOKEN (needs repo push access for traffic data).");
  process.exit(1);
}

const REPO = process.env.GH_REPO?.trim() || repositoryFromOrigin();

const headers = {
  "User-Agent": "Ephemora-Skyline-stats",
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
};

async function get(path) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { headers });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

const [clones, views, repo] = await Promise.all([
  get("traffic/clones"),
  get("traffic/views"),
  get(""),
]);

console.log(
  `Repository: ${repo.full_name}  ★ ${repo.stargazers_count}  forks: ${repo.forks_count}`,
);
console.log(`Clones (last 14 days):  ${clones.count} total / ${clones.uniques} unique`);
console.log(`Views  (last 14 days):  ${views.count} total / ${views.uniques} unique`);
console.log("\nPer day:");
for (const c of clones.clones) {
  const v = views.views.find((d) => d.timestamp === c.timestamp);
  console.log(
    `  ${c.timestamp.slice(0, 10)}  clones ${String(c.count).padStart(4)} (${String(c.uniques).padStart(3)} uniq)  views ${String(v?.count ?? 0).padStart(5)}`,
  );
}
