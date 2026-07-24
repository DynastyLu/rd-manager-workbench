import { HttpStatus } from '@nestjs/common';
import unzipper, { OpenFile } from 'unzipper';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

const MAX_ZIP_ENTRIES = 256;
const MAX_ENTRY_INFLATED_BYTES = 48 * 1024 * 1024;
const MAX_TOTAL_INFLATED_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 250;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_LENGTH = 22;
const MAX_ZIP_COMMENT_LENGTH = 0xffff;
const ZIP64_UINT16_SENTINEL = 0xffff;
const ZIP64_UINT32_SENTINEL = 0xffffffff;
const DATA_DESCRIPTOR_FLAG = 0x08;

const ALLOWED_FILE_PATHS = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/(?:\.rels|[A-Za-z0-9._-]+\.rels)$/,
  /^docProps\/[A-Za-z0-9._-]+\.xml$/,
  /^xl\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:xml|rels)$/,
] as const;

const ALLOWED_DIRECTORY_PATH = /^(?:_rels|docProps|xl(?:\/[A-Za-z0-9._-]+)*)\/$/;

interface LocalRange {
  start: number;
  end: number;
}

export async function preflightEmployeeWorkbookZip(buffer: Buffer): Promise<void> {
  assertBoundedCentralDirectoryMetadata(buffer);

  let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch (cause) {
    throw zipInvalid('XLSX ZIP central directory is invalid', cause);
  }

  const files = directory.files;
  if (files.length > MAX_ZIP_ENTRIES || directory.numberOfRecords > MAX_ZIP_ENTRIES) {
    throw zipInvalid(`XLSX ZIP contains more than ${MAX_ZIP_ENTRIES} entries`);
  }
  if (
    directory.offsetToStartOfCentralDirectory < 0 ||
    directory.offsetToStartOfCentralDirectory + directory.sizeOfCentralDirectory > buffer.length
  ) {
    throw zipInvalid('XLSX ZIP central directory range is invalid');
  }

  const paths = new Set<string>();
  const localOffsets = new Set<number>();
  const localRanges: LocalRange[] = [];
  let declaredTotal = 0;
  for (const file of files) {
    if (file.signature !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw zipInvalid('XLSX ZIP central file header signature is invalid');
    }
    assertSafePackagePath(file.path, file.type, paths);
    if (file.flags & 0x1) {
      throw zipInvalid(`XLSX ZIP entry is encrypted: ${file.path}`);
    }
    if (file.compressionMethod !== 0 && file.compressionMethod !== 8) {
      throw zipInvalid(`XLSX ZIP entry uses an unsupported compression method: ${file.path}`);
    }
    if (file.uncompressedSize > MAX_ENTRY_INFLATED_BYTES) {
      throw zipInvalid('XLSX ZIP entry exceeds the 48 MiB inflated limit');
    }
    declaredTotal += file.uncompressedSize;
    if (declaredTotal > MAX_TOTAL_INFLATED_BYTES) {
      throw zipInvalid('XLSX ZIP exceeds the 64 MiB total inflated limit');
    }
    assertCompressionRatio(file.uncompressedSize, file.compressedSize, file.path);
    localRanges.push(
      validateLocalHeader(buffer, file, directory.offsetToStartOfCentralDirectory, localOffsets),
    );
  }
  assertNonOverlappingRanges(localRanges);

  let actualTotal = 0;
  for (const file of files) {
    if (file.type === 'Directory') continue;
    const stream = file.stream();
    let actualEntry = 0;
    try {
      for await (const chunk of stream) {
        const byteLength = Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk as string);
        actualEntry += byteLength;
        actualTotal += byteLength;
        if (actualEntry > MAX_ENTRY_INFLATED_BYTES) {
          throw zipInvalid('XLSX ZIP entry exceeds the 48 MiB actual inflated limit');
        }
        if (actualTotal > MAX_TOTAL_INFLATED_BYTES) {
          throw zipInvalid('XLSX ZIP exceeds the 64 MiB actual inflated limit');
        }
      }
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw zipInvalid(`XLSX ZIP entry cannot be inflated safely: ${file.path}`, cause);
    } finally {
      stream.destroy();
    }
    if (actualEntry !== file.uncompressedSize) {
      throw zipInvalid(`XLSX ZIP inflated size does not match directory: ${file.path}`);
    }
    assertCompressionRatio(actualEntry, file.compressedSize, file.path);
  }
}

function assertBoundedCentralDirectoryMetadata(buffer: Buffer): void {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const recordsOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const totalRecords = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (
    diskNumber === ZIP64_UINT16_SENTINEL ||
    centralDirectoryDisk === ZIP64_UINT16_SENTINEL ||
    recordsOnDisk === ZIP64_UINT16_SENTINEL ||
    totalRecords === ZIP64_UINT16_SENTINEL ||
    centralDirectorySize === ZIP64_UINT32_SENTINEL ||
    centralDirectoryOffset === ZIP64_UINT32_SENTINEL
  ) {
    throw zipInvalid('ZIP64 XLSX archives are not supported');
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || recordsOnDisk !== totalRecords) {
    throw zipInvalid('Multi-disk XLSX ZIP archives are not supported');
  }
  if (totalRecords > MAX_ZIP_ENTRIES) {
    throw zipInvalid(`XLSX ZIP contains more than ${MAX_ZIP_ENTRIES} entries`);
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset > eocdOffset ||
    centralDirectoryEnd !== eocdOffset ||
    centralDirectoryEnd > buffer.length
  ) {
    throw zipInvalid('XLSX ZIP central directory range does not match EOCD metadata');
  }

  let cursor = centralDirectoryOffset;
  let actualRecords = 0;
  while (cursor < centralDirectoryEnd) {
    actualRecords += 1;
    if (actualRecords > MAX_ZIP_ENTRIES) {
      throw zipInvalid(`XLSX ZIP contains more than ${MAX_ZIP_ENTRIES} entries`);
    }
    if (
      cursor + 46 > centralDirectoryEnd ||
      buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER_SIGNATURE
    ) {
      throw zipInvalid('XLSX ZIP central directory entry is invalid');
    }

    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const startDisk = buffer.readUInt16LE(cursor + 34);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    if (
      compressedSize === ZIP64_UINT32_SENTINEL ||
      uncompressedSize === ZIP64_UINT32_SENTINEL ||
      startDisk === ZIP64_UINT16_SENTINEL ||
      localHeaderOffset === ZIP64_UINT32_SENTINEL
    ) {
      throw zipInvalid('ZIP64 XLSX archives are not supported');
    }
    if (startDisk !== 0) {
      throw zipInvalid('Multi-disk XLSX ZIP archives are not supported');
    }

    const nextCursor = cursor + 46 + nameLength + extraLength + commentLength;
    if (nextCursor > centralDirectoryEnd) {
      throw zipInvalid('XLSX ZIP central directory entry exceeds its declared range');
    }
    cursor = nextCursor;
  }

  if (actualRecords !== totalRecords || cursor - centralDirectoryOffset !== centralDirectorySize) {
    throw zipInvalid('XLSX ZIP central directory record count does not match EOCD metadata');
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < END_OF_CENTRAL_DIRECTORY_LENGTH) {
    throw zipInvalid('XLSX ZIP end-of-central-directory record is missing');
  }
  const minimumOffset = Math.max(
    0,
    buffer.length - END_OF_CENTRAL_DIRECTORY_LENGTH - MAX_ZIP_COMMENT_LENGTH,
  );
  for (
    let offset = buffer.length - END_OF_CENTRAL_DIRECTORY_LENGTH;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + END_OF_CENTRAL_DIRECTORY_LENGTH + commentLength === buffer.length) {
      return offset;
    }
  }
  throw zipInvalid('XLSX ZIP end-of-central-directory record is invalid');
}

function validateLocalHeader(
  buffer: Buffer,
  file: OpenFile,
  centralDirectoryOffset: number,
  localOffsets: Set<number>,
): LocalRange {
  const offset = file.offsetToLocalFileHeader;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset + 30 > centralDirectoryOffset ||
    offset + 30 > buffer.length
  ) {
    throw zipInvalid(`XLSX ZIP local header offset is invalid: ${file.path}`);
  }
  if (localOffsets.has(offset)) {
    throw zipInvalid(`XLSX ZIP central records share a local header: ${file.path}`);
  }
  localOffsets.add(offset);
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw zipInvalid(`XLSX ZIP local header signature is invalid: ${file.path}`);
  }

  const flags = buffer.readUInt16LE(offset + 6);
  const method = buffer.readUInt16LE(offset + 8);
  const crc32 = buffer.readUInt32LE(offset + 14);
  const compressedSize = buffer.readUInt32LE(offset + 18);
  const uncompressedSize = buffer.readUInt32LE(offset + 22);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const nameStart = offset + 30;
  const dataStart = nameStart + nameLength + extraLength;
  const dataEnd = dataStart + file.compressedSize;
  if (dataStart > centralDirectoryOffset || dataEnd > centralDirectoryOffset) {
    throw zipInvalid(`XLSX ZIP local data overlaps the central directory: ${file.path}`);
  }
  const localName = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
  if (localName !== file.path || flags !== file.flags || method !== file.compressionMethod) {
    throw zipInvalid(`XLSX ZIP central/local header mismatch: ${file.path}`);
  }

  const usesDescriptor = Boolean(flags & DATA_DESCRIPTOR_FLAG);
  const matchesOrDescriptorZero = (localValue: number, centralValue: number) =>
    localValue === centralValue || (usesDescriptor && localValue === 0);
  if (
    !matchesOrDescriptorZero(crc32, file.crc32) ||
    !matchesOrDescriptorZero(compressedSize, file.compressedSize) ||
    !matchesOrDescriptorZero(uncompressedSize, file.uncompressedSize)
  ) {
    throw zipInvalid(`XLSX ZIP central/local size or CRC mismatch: ${file.path}`);
  }
  return { start: offset, end: dataEnd };
}

function assertNonOverlappingRanges(ranges: LocalRange[]): void {
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) {
      throw zipInvalid('XLSX ZIP local file ranges overlap');
    }
  }
}

function assertCompressionRatio(
  uncompressedSize: number,
  compressedSize: number,
  path: string,
): void {
  if (
    uncompressedSize > 0 &&
    (compressedSize <= 0 || uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO)
  ) {
    throw zipInvalid(`XLSX ZIP entry exceeds compression ratio ${MAX_COMPRESSION_RATIO}: ${path}`);
  }
}

function assertSafePackagePath(path: string, type: OpenFile['type'], paths: Set<string>): void {
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
