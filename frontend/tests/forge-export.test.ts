// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateProject, writeProject, type ExportedFile } from "../src/forge/codegen";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function storedEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: { path: string; content: Uint8Array; crc: number; offset: number }[] = [];
  const central: { path: string; crc: number; size: number; offset: number }[] = [];
  let offset = 0;
  while (view.getUint32(offset, true) === LOCAL_HEADER) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const compressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const path = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.push({ path, content: bytes.subarray(dataStart, dataStart + size), crc, offset });
    expect(flags & 0x0800).toBe(0x0800);
    expect(method).toBe(0);
    expect(compressedSize).toBe(size);
    offset = dataStart + compressedSize;
  }
  const directoryOffset = offset;
  while (view.getUint32(offset, true) === CENTRAL_HEADER) {
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const path = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    central.push({ path, crc, size, offset: localOffset });
    expect(view.getUint16(offset + 8, true) & 0x0800).toBe(0x0800);
    expect(view.getUint16(offset + 10, true)).toBe(0);
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return { entries, central, directoryOffset, endOffset: offset, view };
}

let blobs: Blob[];
let downloads: string[];

beforeEach(() => {
  blobs = [];
  downloads = [];
  Object.defineProperty(window.URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:forge-${blobs.length}`;
    }),
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("FORGE project language", () => {
  it.each([
    ["en", "Generated from an Ephemora Skyline BUILD graph.", "Credits"],
    ["de", "Aus einem Ephemora-Skyline-BUILD-Graphen erzeugt.", "Danksagungen"],
  ] as const)("exports a consistent %s project", (lang, readme, notice) => {
    const files = generateProject(
      { nodes: [], edges: [] },
      { kind: "blank", name: "Language probe", templateId: "new" },
      lang,
    );
    const content = (path: string) => files.find((file) => file.path === path)?.content ?? "";

    expect(content("index.html")).toContain(`<html lang="${lang}">`);
    expect(content("src/main.tsx")).toContain(`lang="${lang}"`);
    expect(content("README.md")).toContain(readme);
    expect(content("NOTICE.md")).toContain(`# ${notice}`);
  });
});

describe("FORGE project ZIP fallback", () => {
  const files: ExportedFile[] = [
    { path: "package.json", content: '{"name":"forge-test"}\n' },
    { path: "src/main.tsx", content: "export const main = 'ä';\n" },
    { path: "src/runtime.tsx", content: "export const runtime = true;\n" },
  ];

  it("downloads exactly one ZIP with a valid signature", async () => {
    await writeProject(files);
    expect(blobs).toHaveLength(1);
    expect(downloads).toEqual(["ephemora-forge-app.zip"]);
    const bytes = await readBlob(blobs[0]!);
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(blobs[0]!.type).toBe("application/zip");
  });

  it("keeps the ZIP URL alive until the browser has started the download", async () => {
    vi.useFakeTimers();
    try {
      await writeProject(files);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:forge-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves original nested paths, UTF-8 names, lengths and the directory trailer", async () => {
    await writeProject([
      ...files,
      { path: "src/komponenten/Übersicht.tsx", content: "export const grüße = ' Welt';\n" },
    ]);
    const bytes = await readBlob(blobs[0]!);
    const { entries, central, directoryOffset, endOffset, view } = storedEntries(bytes);
    expect(central.map((entry) => entry.path)).toEqual(entries.map((entry) => entry.path));
    for (const [index, entry] of entries.entries()) {
      expect(central[index]).toMatchObject({
        crc: entry.crc,
        size: entry.content.length,
        offset: entry.offset,
      });
    }
    expect(entries.map((entry) => entry.path)).toEqual([
      "package.json",
      "src/main.tsx",
      "src/runtime.tsx",
      "src/komponenten/Übersicht.tsx",
    ]);
    expect(entries.some((entry) => entry.path.includes("__"))).toBe(false);
    for (const [index, file] of [
      ...files,
      {
        path: "src/komponenten/Übersicht.tsx",
        content: "export const grüße = ' Welt';\n",
      },
    ].entries()) {
      expect([...entries[index]!.content]).toEqual([...new TextEncoder().encode(file.content)]);
      expect(entries[index]!.crc).not.toBe(0);
    }
    expect(view.getUint32(endOffset, true)).toBe(END_OF_DIRECTORY);
    expect(view.getUint16(endOffset + 8, true)).toBe(4);
    expect(view.getUint16(endOffset + 10, true)).toBe(4);
    expect(view.getUint32(endOffset + 16, true)).toBe(directoryOffset);
  });
});
