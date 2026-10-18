/**
 * An exported city is a folder, not a server.
 *
 * `ephemora export` writes the built app, the scan's city payload and a tiny
 * local server into one directory. Double-clicking the file there starts that
 * server; the browser opens the same app it would if Skyline were installed.
 *
 * Why a folder and a server at all — the two alternatives were measured and
 * rejected:
 *  - one HTML file with everything inlined: the built app is 1.9 MB of JS plus
 *    290 KB of self-hosted font weights per city, and every extra city would
 *    carry another copy of the renderer;
 *  - a file:// page: the app is an ES-module build, and a module loaded from
 *    file:// is treated as opaque origin, so the renderer never boots. `base`
 *    tags break relative imports; there is no way around that from inside the
 *    page.
 *
 * The payload itself is the same JSON `/api/result/:id/city` answers. The
 * exported server answers that one route and nothing else: no scan, no test
 * runner, no verdicts, no network.
 */
export const EXPORT_ENTRY = "start.sh";
export const EXPORT_ENTRY_WINDOWS = "start.cmd";
export const PAYLOAD_FILE = "city.json";
