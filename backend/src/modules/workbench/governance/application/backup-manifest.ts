export interface BackupManifestEntry {
  path: string;
  byteSize: number;
  sha256: string;
}

export interface BackupManifest {
  formatVersion: 1;
  appVersion: string;
  schemaVersion: string;
  createdAt: string;
  database: BackupManifestEntry;
  files: BackupManifestEntry[];
}

const sha256Pattern = /^[a-f0-9]{64}$/;

export function parseBackupManifest(value: unknown): BackupManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Backup manifest must be an object');
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.formatVersion !== 1 ||
    typeof candidate.appVersion !== 'string' ||
    typeof candidate.schemaVersion !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.createdAt)) ||
    !Array.isArray(candidate.files)
  ) {
    throw new Error('Backup manifest header is invalid');
  }
  const database = parseEntry(candidate.database);
  if (database.path !== 'database.dump') throw new Error('Backup dump path is invalid');
  const files = candidate.files.map(parseEntry);
  return {
    formatVersion: 1,
    appVersion: candidate.appVersion,
    schemaVersion: candidate.schemaVersion,
    createdAt: candidate.createdAt,
    database,
    files,
  };
}

function parseEntry(value: unknown): BackupManifestEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Backup manifest entry is invalid');
  }
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.path !== 'string' ||
    typeof entry.byteSize !== 'number' ||
    !Number.isSafeInteger(entry.byteSize) ||
    entry.byteSize < 0 ||
    typeof entry.sha256 !== 'string' ||
    !sha256Pattern.test(entry.sha256)
  ) {
    throw new Error('Backup manifest entry is invalid');
  }
  return { path: entry.path, byteSize: entry.byteSize, sha256: entry.sha256 };
}
