import { EmployeeWorkImportBatch, EmployeeWorkImportStatus } from '@prisma/client';

const DRAFT_STATUSES = new Set<EmployeeWorkImportStatus>([
  EmployeeWorkImportStatus.UPLOADED,
  EmployeeWorkImportStatus.PREVIEWED,
  EmployeeWorkImportStatus.RESOLVING,
  EmployeeWorkImportStatus.READY,
  EmployeeWorkImportStatus.FAILED,
]);

export function isEmployeeImportDraftStatus(status: EmployeeWorkImportStatus): boolean {
  return DRAFT_STATUSES.has(status);
}

export function isEmployeeImportBatchExpired(
  batch: Pick<EmployeeWorkImportBatch, 'status' | 'expiresAt'>,
  now: Date,
): boolean {
  return (
    batch.status === EmployeeWorkImportStatus.EXPIRED ||
    (isEmployeeImportDraftStatus(batch.status) && batch.expiresAt <= now)
  );
}
