#!/usr/bin/env node
/**
 * Download/clone statistics for Ephemora Skyline — admin tool, runs with
 * YOUR GitHub token (never shipped to users). GitHub counts clones and
 * views natively for public repos; no user-facing tracking exists or is
 * needed for this.
 *
 * Usage: GH_TOKEN=ghp_xxx node scripts/clone-stats.mjs
 * Docs: https://docs.github.com/en/rest/metrics/traffic
 */

const REPO = "MichaelS1011/Ephemora-Skyline";
const token = process.env.GH_TOKEN;

if (!token) {
  console.error("Set GH_TOKEN (needs repo push access for traffic data).");
  process.exit(1);
}

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

console.log(`Repository: ${repo.full_name}  ★ ${repo.stargazers_count}  forks: ${repo.forks_count}`);
console.log(`Clones (last 14 days):  ${clones.count} total / ${clones.uniques} unique`);
console.log(`Views  (last 14 days):  ${views.count} total / ${views.uniques} unique`);
console.log("\nPer day:");
for (const c of clones.clones) {
  const v = views.views.find((d) => d.timestamp === c.timestamp);
  console.log(
    `  ${c.timestamp.slice(0, 10)}  clones ${String(c.count).padStart(4)} (${String(c.uniques).padStart(3)} uniq)  views ${String(v?.count ?? 0).padStart(5)}`,
  );
}
