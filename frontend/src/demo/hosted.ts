import type { CityData } from "../city/types";

/**
 * What a hosted page may offer, and what it must say instead.
 *
 * WHY THIS FILE EXISTS. The product scans a folder the browser hands it over
 * loopback to a backend on the same machine. A page on GitHub Pages has no
 * such backend, so two things change and one thing must not:
 *
 *   - the demo no longer comes from `GET /api/cities/default`; it comes from
 *     the bytes `scripts/demo-city.mjs` baked into `public/demo/city.json`
 *     (the same backend functions, checked by `demo-city-baked.test.ts`);
 *   - the folder picker is not offered. A picker that reads a folder and then
 *     posts it into a 404 is the one thing a hosted page must never do: the
 *     reader would hand over files for a scan that cannot happen;
 *   - the demo keeps announcing that nothing was analysed.
 *
 * The switch is a build flag (`VITE_HOSTED_DEMO=1`), not a hostname test: a
 * shipped build must be able to say what it is without guessing from where it
 * happens to be served.
 */
export const RELEASES_URL = "https://github.com/MichaelS1011/Ephemora-Skyline/releases/latest";
export const HOSTED_DEMO_ID = "demo-001";

/** Read at call time so a test can stub the flag. */
export function isHostedDemo(): boolean {
  return import.meta.env.VITE_HOSTED_DEMO === "1";
}

/**
 * Where the baked city sits inside the built page. `baseUrl` is
 * `import.meta.env.BASE_URL`, which ends in `/` for every sub-path deploy
 * (`/Ephemora-Skyline/`), so the demo is reachable from the page it is on
 * rather than from the host's root.
 */
export function demoCityPath(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}demo/city.json`;
}

export type HostedCityLoad = { kind: "city"; data: CityData } | { kind: "unsupported" };

/**
 * The hosted permalink has exactly one valid identity. Refuse every other id
 * before a URL exists; a static page must never turn an unknown city into an
 * `/api` request. The payload has to name the same demo, so a misplaced or
 * stale bake cannot silently paint another city under this link.
 */
export async function fetchHostedCity(cityId: string, baseUrl: string): Promise<HostedCityLoad> {
  if (cityId !== HOSTED_DEMO_ID) return { kind: "unsupported" };
  const response = await fetch(demoCityPath(baseUrl), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Hosted demo HTTP ${response.status}`);
  const data = (await response.json()) as CityData;
  if (data.analysisId !== HOSTED_DEMO_ID) {
    throw new Error("Baked demo identity does not match the hosted permalink");
  }
  if (data.totalFiles === 0) throw new Error("Baked demo has no files");
  return { kind: "city", data };
}

/**
 * One fail-closed door for backend requests owned by this lane. The URL factory
 * is deliberately lazy: hosted mode returns before an `/api` string is built,
 * and local mode keeps the exact fetch contract it had before this helper.
 */
export async function localApiFetch(
  makeUrl: () => RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  if (isHostedDemo()) return null;
  return fetch(makeUrl(), init);
}

/** The same policy for anchors and programmatic downloads, before URL creation. */
export function localApiHref(makeUrl: () => string): string | null {
  return isHostedDemo() ? null : makeUrl();
}
