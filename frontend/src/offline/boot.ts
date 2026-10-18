/**
 * The app, booted from the payload an exported folder carries.
 *
 * App.tsx normally learns where the city is from the address (`?city=`), and
 * an export has exactly one city. This wraps the boot: when the payload is
 * present and the address names nothing, the address is told the id so the
 * existing path — history, camera, selection — runs unchanged. One less
 * branch inside the app, and the export behaves like a permalink, because
 * that is what it is.
 */
export function bootCityFromExport(
  doc: Pick<Document, "location"> & { defaultView?: Window | null },
): string | null {
  const embedded = doc.defaultView?.__EPHEMORA_CITY__ as { analysisId?: unknown } | undefined;
  const id = typeof embedded?.analysisId === "string" ? embedded.analysisId : null;
  if (!id) return null;
  const current = new URLSearchParams(doc.location.search).get("city");
  if (current) return current;
  const url = new URL(doc.location.href);
  url.searchParams.set("city", id);
  // replaceState, not a navigation: the file server answers the same page.
  doc.defaultView?.history.replaceState(null, "", url.toString());
  return id;
}
