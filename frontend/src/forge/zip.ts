/** Minimal stored-entry ZIP writer. No dependency, compression or timestamps:
 *  the export is small and deterministic, and every byte stays inspectable. */
export type ZipFile = { readonly path: string; readonly content: string };

const encoder = new TextEncoder();
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safePath(path: string): void {
  const parts = path.split("/");
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Ungültiger ZIP-Pfad: ${path}`);
  }
}

export function createZip(files: readonly ZipFile[]): Uint8Array<ArrayBuffer> {
  if (files.length > 0xffff) throw new Error("ZIP unterstützt höchstens 65535 Dateien.");
  const paths = new Set<string>();
  const entries = files.map((file) => {
    safePath(file.path);
    if (paths.has(file.path)) throw new Error(`Doppelter ZIP-Pfad: ${file.path}`);
    paths.add(file.path);
    const name = encoder.encode(file.path);
    const content = encoder.encode(file.content);
    return { name, content, crc: crc32(content), offset: 0 };
  });
  const localSize = entries.reduce(
    (sum, entry) => sum + 30 + entry.name.length + entry.content.length,
    0,
  );
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  const totalSize = localSize + centralSize + 22;
  if (totalSize > 0xffffffff) throw new Error("ZIP ist zu groß.");

  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const entry of entries) {
    entry.offset = offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 names
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0x0021, true); // 1980-01-01
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.content.length, true);
    view.setUint32(offset + 22, entry.content.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    bytes.set(entry.name, offset + 30);
    bytes.set(entry.content, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.content.length;
  }

  const directoryOffset = offset;
  for (const entry of entries) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 0x0021, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.content.length, true);
    view.setUint32(offset + 24, entry.content.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, entry.offset, true);
    bytes.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  }

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, directoryOffset, true);
  view.setUint16(offset + 20, 0, true);
  return bytes;
}
