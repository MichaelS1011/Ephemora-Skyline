/**
 * One honest reader for every localStorage blob this app keeps on the machine.
 *
 * The pattern is not invented here — it is the one `prefs.ts` (loadPrefsRead,
 * `PrefsRead`) shipped after the prefs-storage round closed the class there:
 * a read answers THREE states, and the third one keeps the bytes it could not
 * read. `absent` (nothing was ever saved) is the only state allowed to look
 * like an empty default without a word; `unreadable` (the bytes exist and this
 * app cannot parse or honour them) must say so, because answering a failed
 * read with a default is a lie twice over — the screen shows "empty" and the
 * next save writes that empty over the file the reader might still recover.
 *
 * The quarantine slot is `<key>:unreadable`, first-wins: the first unreadable
 * blob is kept verbatim, and neither a later corruption nor any save of the
 * live key replaces it. Bytes the app did not write are not the app's to
 * trade away — the same rule the prefs round pinned with
 * `codecity-prefs:unreadable`.
 *
 * Local instances of this class closed so far: reviews.ts (machine copy, via
 * the route), rulePacks.ts (network path), prefs.ts, and — through this file —
 * config/scanProfiles.ts, config/rulePacks.ts (storage path),
 * recentCities.ts and, on the queue of the prefs round, epheLook.ts,
 * epheNames.ts, reviews.ts (browser bucket) and verify.ts (anchors and
 * times). Watch: tests/storage-class-honest.test.ts.
 */

export type StoredRead<T> =
  { state: "read"; value: T } | { state: "absent" } | { state: "unreadable" };

/** The slot the unreadable bytes of `key` are parked in. */
export function quarantineKeyFor(key: string): string {
  return `${key}:unreadable`;
}

/**
 * The bytes a corrupt read kept, or null when nothing was quarantined. The
 * live key may be rewritten by the app afterwards; this slot answers "was
 * nothing deleted?" truthfully for as long as the browser keeps storage.
 */
export function preservedUnreadableBytes(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(quarantineKeyFor(key));
  } catch {
    return null;
  }
}

/**
 * Read `key` and classify what came back.
 *
 * `accept` is the loader's own shape rule: it returns the honoured value, or
 * `undefined` for bytes that parse into something the loader does not store.
 * Refusing is a failed read, not an empty answer — that distinction is the
 * whole reason `wrongShape` bytes used to be overwritten quietly.
 *
 * A storage layer that refuses to answer (disabled, private mode) is
 * `unreadable` with nothing to preserve: the machine may or may not hold a
 * file, and nobody here may say which.
 */
export function readStoredJson<T>(
  key: string,
  accept: (parsed: unknown) => T | undefined,
): StoredRead<T> {
  if (typeof window === "undefined") return { state: "absent" };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return { state: "unreadable" };
  }
  if (raw === null || raw === "") return { state: "absent" };
  try {
    const value = accept(JSON.parse(raw));
    if (value === undefined) {
      preserveUnreadable(key, raw);
      return { state: "unreadable" };
    }
    return { state: "read", value };
  } catch {
    preserveUnreadable(key, raw);
    return { state: "unreadable" };
  }
}

/**
 * Keep the first unreadable blob verbatim (prefs.ts:105's rule, once). A
 * second corruption does not replace it — quietly trading a preserved file
 * for newer junk would recreate the sin with extra steps. Best-effort: if
 * the quarantine write itself fails, the note is still owed to the reader.
 */
function preserveUnreadable(key: string, raw: string): void {
  try {
    const slot = quarantineKeyFor(key);
    if (window.localStorage.getItem(slot) === null) {
      window.localStorage.setItem(slot, raw);
    }
  } catch {
    // Nowhere to preserve them; the state answer does not depend on this.
  }
}
