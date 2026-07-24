import { Readable } from 'node:stream';
import { HttpStatus } from '@nestjs/common';
import unzipper, { Entry } from 'unzipper';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

const MAX_ZIP_ENTRIES = 256;
const MAX_ENTRY_INFLATED_BYTES = 48 * 1024 * 1024;
const MAX_TOTAL_INFLATED_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 250;

const ALLOWED_FILE_PATHS = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/(?:\.rels|[A-Za-z0-9._-]+\.rels)$/,
  /^docProps\/[A-Za-z0-9._-]+\.xml$/,
  /^xl\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:xml|rels)$/,
] as const;

const ALLOWED_DIRECTORY_PATH = /^(?:_rels|docProps|xl(?:\/[A-Za-z0-9._-]+)*)\/$/;

export async function preflightEmployeeWorkbookZip(buffer: Buffer): Promise<void> {
  const input = Readable.from(buffer);
  const parser = unzipper.Parse({ forceStream: true });
  const archive = input.pipe(parser);
  const paths = new Set<string>();
  let entryCount = 0;
  let totalInflatedBytes = 0;
  let currentEntry: Entry | undefined;

  try {
    for await (const entry of archive) {
      currentEntry = entry;
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES) {
        throw zipInvalid(`XLSX ZIP contains more than ${MAX_ZIP_ENTRIES} entries`);
      }

      assertSafePackagePath(entry.path, entry.type, paths);
      if ((entry.vars.flags ?? 0) & 0x1) {
        throw zipInvalid(`XLSX ZIP entry is encrypted: ${entry.path}`);
      }

      let entryInflatedBytes = 0;
      for await (const chunk of entry) {
        const byteLength = Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk as string);
        entryInflatedBytes += byteLength;
        totalInflatedBytes += byteLength;
        if (entryInflatedBytes > MAX_ENTRY_INFLATED_BYTES) {
          throw zipInvalid(
            `XLSX ZIP entry exceeds the ${MAX_ENTRY_INFLATED_BYTES / 1024 / 1024} MiB inflated limit`,
          );
        }
        if (totalInflatedBytes > MAX_TOTAL_INFLATED_BYTES) {
          throw zipInvalid(
            `XLSX ZIP exceeds the ${MAX_TOTAL_INFLATED_BYTES / 1024 / 1024} MiB total inflated limit`,
          );
        }
      }

      const compressedSize = entry.vars.compressedSize ?? 0;
      if (
        entryInflatedBytes > 0 &&
        (compressedSize <= 0 || entryInflatedBytes / compressedSize > MAX_COMPRESSION_RATIO)
      ) {
        throw zipInvalid(
          `XLSX ZIP entry exceeds compression ratio ${MAX_COMPRESSION_RATIO}: ${entry.path}`,
        );
      }
      currentEntry = undefined;
    }
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw zipInvalid('XLSX ZIP structure is invalid', cause);
  } finally {
    currentEntry?.destroy();
    archive.destroy();
    parser.destroy();
    input.destroy();
  }
}

function assertSafePackagePath(path: string, type: Entry['type'], paths: Set<string>): void {
  if (
    path.length === 0 ||
    path.includes('\u0000') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    path.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw zipInvalid(`XLSX ZIP contains an unsafe path: ${safePath(path)}`);
  }

  const duplicateKey = path.toLowerCase();
  if (paths.has(duplicateKey)) {
    throw zipInvalid(`XLSX ZIP contains a duplicate path: ${safePath(path)}`);
  }
  paths.add(duplicateKey);

  const allowed =
    type === 'Directory'
      ? ALLOWED_DIRECTORY_PATH.test(path)
      : ALLOWED_FILE_PATHS.some((pattern) => pattern.test(path));
  if (!allowed) {
    throw zipInvalid(`XLSX ZIP contains a disallowed package part: ${safePath(path)}`);
  }
}

function safePath(path: string): string {
  return path.replaceAll('\u0000', '\\0').slice(0, 256);
}

function zipInvalid(reason: string, cause?: unknown): AppError {
  return new AppError({
    code: ErrorCodes.EMPLOYEE_IMPORT_TEMPLATE_INVALID,
    message: reason,
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    details: { reason },
    cause,
  });
}
