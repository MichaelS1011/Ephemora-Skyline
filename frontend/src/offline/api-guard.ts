/**
 * The API guard for an exported city.
 *
 * Everything else in the app assumes a backend: a scan, a verify, a verdict,
 * an update check. In an exported city there is one read that can be answered
 * — the city itself, which `start` already handed to the app through
 * `window.__EPHEMORA_CITY__` — and the rest would each fail with the browser's
 * own opaque network error, twenty times over, in a console the reader never
 * opens.
 *
 * So the guard stands in front of `fetch` for those callers and answers the
 * two questions that matter honestly:
 *  - "is there a city here?" → yes (the embedded payload, on the one route);
 *  - "is anything live?" → no, and nothing is asked of a server that is not
 *    there.
 *
 * It is installed only when `window.__EPHEMORA_CITY__` exists, i.e. in an
 * export. A normal install never sees this module do anything.
 */

export interface OfflineResult {
  cityId: string;
  /** How many API calls the guard answered — read by the export's own test. */
  calls: number;
}

const CITY_ROUTE = /^\/?api\/result\/([^/]+)\/city\/?$/;

let installed: OfflineResult | null = null;

export function installOfflineApiGuard(embedded: unknown): OfflineResult | null {
  if (installed) return installed;
  const city = embedded as { analysisId?: unknown } | null;
  const cityId = typeof city?.analysisId === "string" ? city.analysisId : "";
  if (!cityId) return null;
  const result: OfflineResult = { cityId, calls: 0 };
  installed = result;

  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname + input.search
          : input.url;
    const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
    const match = CITY_ROUTE.exec(path);
    result.calls += 1;
    window.__EPHEMORA_API_CALLS__ = result.calls;
    if (match && decodeURIComponent(match[1] ?? "") === cityId) {
      return new Response(JSON.stringify(embedded), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // A read for a city that is not the one in this folder: 404 is the true
    // answer, not a synthetic success.
    if (match)
      return new Response(JSON.stringify({ error: "Analysis not found" }), { status: 404 });
    // Everything else is "there is no server here". 503 + the sentence, so a
    // caller that shows the error shows something a person can read.
    return new Response(
      JSON.stringify({ error: "This is an exported city: only the city itself is available." }),
      {
        status: 503,
      },
    );
  }) as typeof fetch;

  return result;
}

/** Unused in production; the test calls it between cases. */
export function __resetOfflineGuardForTest(): void {
  installed = null;
}
