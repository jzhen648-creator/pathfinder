import { createHash } from "node:crypto";

/**
 * Deterministic SHA-256 digest of a list of parts. Strings are used verbatim,
 * everything else is JSON-stringified. Parts are separated by a pipe so
 * ("a", "b") and ("ab") produce different digests.
 */
export function sha256(parts: unknown[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(typeof part === "string" ? part : JSON.stringify(part));
    hash.update("|");
  }
  return hash.digest("hex");
}
