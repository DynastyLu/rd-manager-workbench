import { createHash } from 'node:crypto';

export type ExternalSyncResolution = 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'CREATE_COPY';

export function canonicalHash(value: unknown) {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]));
    }
    return item;
  };
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
