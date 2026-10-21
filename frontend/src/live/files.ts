/**
 * The bytes helpers the live path depends on.
 *
 * Hashing is SHA-256 through Web Crypto. `127.0.0.1` is a secure context, so
 * the local app always has it; a browser without it simply gets no live mode
 * rather than a weaker hash that could call two different files the same.
 */
export function hasSubtleCrypto(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

export function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/** ArrayBuffer → base64 (binary-safe for .git packfiles) */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
