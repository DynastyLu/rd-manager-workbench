import { createHash } from 'node:crypto';

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson | undefined };

export interface EmployeeImportFingerprintInput {
  fileHash: string;
  templateVersion: number;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  rows: Array<{ rowNumber: number } & Record<string, unknown>>;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, CanonicalJson | undefined>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function employeeImportFingerprint(input: EmployeeImportFingerprintInput): string {
  const payload = {
    fileHash: input.fileHash,
    templateVersion: input.templateVersion,
    periodType: input.periodType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    rows: [...input.rows].sort((left, right) => left.rowNumber - right.rowNumber),
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}
