import { createHash } from 'crypto';

/**
 * Recursively sorts object keys and normalizes primitives so that semantically
 * identical payloads produce the exact same JSON representation regardless of
 * property insertion order.
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const propVal = obj[key];
      if (propVal !== undefined) {
        sorted[key] = canonicalize(propVal);
      }
    }
    return sorted;
  }

  return value;
}

/**
 * Produces a deterministic SHA-256 hex digest from a canonical representation
 * of the provided business fields.
 */
export function computeRequestFingerprint(
  payload: Record<string, unknown>,
): string {
  const canonical = canonicalize(payload);
  const serialized = JSON.stringify(canonical);
  return createHash('sha256').update(serialized).digest('hex');
}
