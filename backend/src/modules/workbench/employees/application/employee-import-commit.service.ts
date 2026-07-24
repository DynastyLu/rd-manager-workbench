import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  EmployeeImportRowStatus,
  EmployeeSnapshotStatus,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
  LoadEntryKind,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { NormalizedEmployeeWorkRow } from '../domain/employee-work.types';
import { employeeImportFingerprint } from './employee-import-fingerprint';
import {
  EmployeeImportResolution,
  EmployeeImportValidatorService,
  ValidatedEmployeeImportRow,
} from './employee-import-validator.service';
import {
  isNormalizedEmployeeImportRow,
  parseStoredEmployeeImportRow,
  StagedEmployeeImportRow,
} from './employee-import-staged-row';

const EMPLOYEE_IMPORT_COMMIT_CLOCK = Symbol('EMPLOYEE_IMPORT_COMMIT_CLOCK');
const WRITE_CHUNK_SIZE = 1_000;
const REFERENCE_LOCK_CHUNK_SIZE = 1_000;
const IMPORT_TRANSACTION_OPTIONS = {
  maxWait: 30_000,
  timeout: 120_000,
} as const;

type EmployeeImportCommitRevision = Pick<
  EmployeeWorkImportBatch,
  | 'updatedAt'
  | 'previewFingerprint'
  | 'sourceStorageKey'
  | 'fileHash'
  | 'templateVersion'
  | 'periodType'
  | 'periodStartAt'
  | 'periodEndAt'
>;

@Injectable()
export class EmployeeImportCommitService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly validator: EmployeeImportValidatorService,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(EMPLOYEE_IMPORT_COMMIT_CLOCK)
    clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  async commit(id: string) {
    let claimedRevision: EmployeeImportCommitRevision | null = null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        let batch = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
        if (!batch) throw this.notFound();
        if (batch.status === EmployeeWorkImportStatus.COMPLETED) {
          return this.publicBatch(batch);
        }
        this.assertNotExpired(batch.expiresAt);
        this.assertReady(batch.status);

        await this.lock(
          tx,
          `employee-import-period:${batch.periodType}:${this.dateOnly(batch.periodStartAt)}`,
        );
        batch = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
        if (!batch) throw this.notFound();
        if (batch.status === EmployeeWorkImportStatus.COMPLETED) {
          return this.publicBatch(batch);
        }
        this.assertNotExpired(batch.expiresAt);
        this.assertReady(batch.status);

        const claim = await tx.employeeWorkImportBatch.updateMany({
          where: { id, status: EmployeeWorkImportStatus.READY },
          data: { status: EmployeeWorkImportStatus.IMPORTING },
        });
        if (claim.count !== 1) {
          throw this.stateInvalid('Employee work import batch could not be claimed');
        }
        claimedRevision = this.commitRevision(batch);

        const rows = (
          await tx.employeeWorkImportRow.findMany({
            where: { batchId: id },
            orderBy: { rowNumber: 'asc' },
          })
        ).map(parseStoredEmployeeImportRow);
        const normalizedRows = this.assertStagedRows(batch, rows);
        await this.lockCurrentReferences(rows, tx);
        await this.assertReferencesCurrent(rows, normalizedRows, tx);

        const currentRows = await tx.$queryRaw<Array<{ id: string; version: number | null }>>(
          Prisma.sql`
            SELECT "id", "version"
            FROM "app"."employee_work_import_batches"
            WHERE "period_type" = ${batch.periodType}::"app"."EmployeeProgressPeriod"
              AND "period_start_at" = ${this.dateOnly(batch.periodStartAt)}::date
              AND "status" = 'COMPLETED'::"app"."EmployeeWorkImportStatus"
              AND "id" <> ${id}
            ORDER BY "version" DESC NULLS LAST
            LIMIT 1
            FOR UPDATE
          `,
        );
        const current = currentRows[0] ?? null;
        const versionAggregate = await tx.employeeWorkImportBatch.aggregate({
          where: {
            periodType: batch.periodType,
            periodStartAt: batch.periodStartAt,
            status: {
              in: [EmployeeWorkImportStatus.COMPLETED, EmployeeWorkImportStatus.SUPERSEDED],
            },
          },
          _max: { version: true },
        });
        const version = (versionAggregate._max.version ?? 0) + 1;
        const committedAt = this.now();

        const workItems = rows.map((row, index) => {
          const normalized = normalizedRows[index];
          return {
            id: randomUUID(),
            employeeId: row.resolvedEmployeeId!,
            importBatchId: id,
            sourceRowId: row.id,
            periodStartAt: batch.periodStartAt,
            periodEndAt: batch.periodEndAt,
            title: normalized.title,
            planText: normalized.planText,
            summaryText: normalized.summaryText,
            completionRate: normalized.completionRate,
            status: normalized.status,
            nextPlanText: normalized.nextPlanText,
            riskText: normalized.riskText,
            plannedHours: this.decimal(normalized.plannedHours),
            actualHours: this.decimal(normalized.actualHours),
            projectId: row.resolvedProjectId,
            taskId: row.resolvedTaskId,
            note: normalized.note,
            rawRow: row.rawValues as Prisma.InputJsonObject,
          } satisfies Prisma.EmployeeWorkItemCreateManyInput;
        });
        for (const chunk of this.chunks(workItems)) {
          await tx.employeeWorkItem.createMany({ data: chunk });
        }

        const loadEntries: Prisma.ResourceLoadEntryCreateManyInput[] = [];
        rows.forEach((row, index) => {
          const plannedHours = normalizedRows[index].plannedHours;
          if (plannedHours === null) return;
          loadEntries.push({
            id: randomUUID(),
            resourceId: row.resolvedEmployeeId!,
            weekStartAt: batch.periodStartAt,
            kind: this.loadKind(row),
            projectId: row.resolvedTaskId ? null : row.resolvedProjectId,
            taskId: row.resolvedTaskId,
            employeeWorkItemId: workItems[index].id,
            employeeWorkImportBatchId: id,
            plannedHours: new Prisma.Decimal(String(plannedHours)),
            note: normalizedRows[index].note,
          });
        });
        for (const chunk of this.chunks(loadEntries)) {
          await tx.resourceLoadEntry.createMany({ data: chunk });
        }

        if (current) {
          await tx.resourceLoadEntry.updateMany({
            where: { employeeWorkImportBatchId: current.id, archivedAt: null },
            data: { archivedAt: committedAt },
          });
          await tx.employeeWorkItem.updateMany({
            where: { importBatchId: current.id, archivedAt: null },
            data: { archivedAt: committedAt },
          });
          await tx.employeeWorkImportBatch.update({
            where: { id: current.id },
            data: { status: EmployeeWorkImportStatus.SUPERSEDED },
          });
        }

        const completed = await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            status: EmployeeWorkImportStatus.COMPLETED,
            version,
            importedRows: rows.length,
            committedAt,
            supersedesBatchId: current?.id ?? null,
            snapshotStatus: EmployeeSnapshotStatus.NOT_STARTED,
            snapshotError: null,
          },
        });
        await this.audit.record(
          {
            action: 'EMPLOYEE_IMPORT_COMMITTED',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'SUCCEEDED',
            changedFields: ['status', 'version', 'importedRows', 'supersedesBatchId'],
            metadata: {
              status: EmployeeWorkImportStatus.COMPLETED,
              itemCount: rows.length,
              periodType: batch.periodType,
              periodStart: this.dateOnly(batch.periodStartAt),
              periodEnd: this.dateOnly(batch.periodEndAt),
            },
          },
          tx,
        );
        return this.publicBatch(completed);
      }, IMPORT_TRANSACTION_OPTIONS);
    } catch (error) {
      if (claimedRevision) {
        await this.markFailed(id, error, claimedRevision);
      }
      throw error;
    }
  }

  private assertStagedRows(
    batch: EmployeeWorkImportBatch,
    rows: StagedEmployeeImportRow[],
  ): NormalizedEmployeeWorkRow[] {
    if (
      rows.length !== batch.totalRows ||
      batch.validRows !== batch.totalRows ||
      batch.errorRows !== 0 ||
      batch.unresolvedRows !== 0 ||
      rows.some(
        (row) =>
          row.status !== EmployeeImportRowStatus.VALID ||
          row.errors.length !== 0 ||
          !row.resolvedEmployeeId ||
          !isNormalizedEmployeeImportRow(row.normalizedValues),
      )
    ) {
      throw this.integrityFailed('Employee import staged rows are not complete and valid');
    }
    const fingerprint = employeeImportFingerprint({
      fileHash: batch.fileHash,
      templateVersion: batch.templateVersion,
      periodType: batch.periodType,
      periodStart: this.dateOnly(batch.periodStartAt),
      periodEnd: this.dateOnly(batch.periodEndAt),
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        rawValues: row.rawValues,
        normalizedValues: row.normalizedValues,
        status: row.status,
        errors: row.errors,
        resolvedEmployeeId: row.resolvedEmployeeId,
        resolvedProjectId: row.resolvedProjectId,
        resolvedTaskId: row.resolvedTaskId,
        keepUnlinked: row.keepUnlinked,
      })),
    });
    if (!batch.previewFingerprint || fingerprint !== batch.previewFingerprint) {
      throw this.integrityFailed('Employee import preview fingerprint does not match staged rows');
    }
    return rows.map((row) => row.normalizedValues as NormalizedEmployeeWorkRow);
  }

  private async assertReferencesCurrent(
    rows: StagedEmployeeImportRow[],
    normalizedRows: NormalizedEmployeeWorkRow[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const resolutions = new Map<number, EmployeeImportResolution>(
      rows.map((row) => [
        row.rowNumber,
        {
          employeeId: row.resolvedEmployeeId,
          projectId: row.resolvedProjectId,
          taskId: row.resolvedTaskId,
          keepUnlinked: row.keepUnlinked,
        },
      ]),
    );
    const validated = await this.validator.validate(normalizedRows, resolutions, tx);
    if (
      validated.length !== rows.length ||
      validated.some((result, index) => !this.referencesMatch(rows[index], result))
    ) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_RESOLUTION_INVALID,
        message: 'Employee import references changed after preview',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private referencesMatch(
    row: StagedEmployeeImportRow,
    validated: ValidatedEmployeeImportRow,
  ): boolean {
    return (
      validated.row.rowNumber === row.rowNumber &&
      validated.status === EmployeeImportRowStatus.VALID &&
      validated.errors.length === 0 &&
      validated.resolvedEmployeeId === row.resolvedEmployeeId &&
      validated.resolvedProjectId === row.resolvedProjectId &&
      validated.resolvedTaskId === row.resolvedTaskId &&
      validated.keepUnlinked === row.keepUnlinked
    );
  }

  private async lockCurrentReferences(
    rows: StagedEmployeeImportRow[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const employeeIds = this.sortedUnique(rows.map((row) => row.resolvedEmployeeId!));
    const projectIds = this.sortedUnique(
      rows.flatMap((row) => (row.resolvedProjectId ? [row.resolvedProjectId] : [])),
    );
    const taskIds = this.sortedUnique(
      rows.flatMap((row) => (row.resolvedTaskId ? [row.resolvedTaskId] : [])),
    );
    for (const chunk of this.chunks(employeeIds, REFERENCE_LOCK_CHUNK_SIZE)) {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "app"."resource_profiles"
        WHERE "id" IN (${Prisma.join(chunk)})
          AND "archived_at" IS NULL
          AND "employment_status" <> 'LEFT'::"app"."EmploymentStatus"
        ORDER BY "id"
        FOR UPDATE
      `);
      this.assertLockedCount(locked.length, chunk.length);
    }
    for (const chunk of this.chunks(projectIds, REFERENCE_LOCK_CHUNK_SIZE)) {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "app"."projects"
        WHERE "id" IN (${Prisma.join(chunk)})
          AND "archived_at" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `);
      this.assertLockedCount(locked.length, chunk.length);
    }
    const taskProjects = new Map<string, string | null>();
    for (const row of rows) {
      if (!row.resolvedTaskId) continue;
      const existing = taskProjects.get(row.resolvedTaskId);
      if (existing !== undefined && existing !== row.resolvedProjectId) {
        throw this.resolutionInvalid('A staged task points to inconsistent project references');
      }
      taskProjects.set(row.resolvedTaskId, row.resolvedProjectId);
    }
    for (const chunk of this.chunks(taskIds, REFERENCE_LOCK_CHUNK_SIZE)) {
      const locked = await tx.$queryRaw<Array<{ id: string; projectId: string }>>(Prisma.sql`
        SELECT "id", "project_id" AS "projectId"
        FROM "app"."tasks"
        WHERE "id" IN (${Prisma.join(chunk)})
          AND "archived_at" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `);
      this.assertLockedCount(locked.length, chunk.length);
      if (locked.some((task) => taskProjects.get(task.id) !== task.projectId)) {
        throw this.resolutionInvalid('A staged task no longer belongs to its resolved project');
      }
    }
  }

  private assertLockedCount(actual: number, expected: number): void {
    if (actual !== expected) {
      throw this.resolutionInvalid(
        'Employee import references changed while commit was being prepared',
      );
    }
  }

  private async markFailed(
    id: string,
    error: unknown,
    revision: EmployeeImportCommitRevision,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        let batch = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
        if (
          !batch ||
          !this.matchesRevision(batch, revision) ||
          (batch.status !== EmployeeWorkImportStatus.READY &&
            batch.status !== EmployeeWorkImportStatus.IMPORTING)
        ) {
          return;
        }
        await this.lock(
          tx,
          `employee-import-period:${revision.periodType}:${this.dateOnly(revision.periodStartAt)}`,
        );
        batch = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
        if (
          !batch ||
          !this.matchesRevision(batch, revision) ||
          (batch.status !== EmployeeWorkImportStatus.READY &&
            batch.status !== EmployeeWorkImportStatus.IMPORTING)
        ) {
          return;
        }
        const failed = await tx.employeeWorkImportBatch.updateMany({
          where: {
            id,
            status: {
              in: [EmployeeWorkImportStatus.READY, EmployeeWorkImportStatus.IMPORTING],
            },
            updatedAt: revision.updatedAt,
            previewFingerprint: revision.previewFingerprint,
            sourceStorageKey: revision.sourceStorageKey,
            fileHash: revision.fileHash,
            templateVersion: revision.templateVersion,
            periodType: revision.periodType,
            periodStartAt: revision.periodStartAt,
            periodEndAt: revision.periodEndAt,
          },
          data: { status: EmployeeWorkImportStatus.FAILED },
        });
        if (failed.count !== 1) return;
        await this.audit.record(
          {
            action: 'EMPLOYEE_IMPORT_COMMIT_FAILED',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'FAILED',
            changedFields: ['status'],
            metadata: {
              status: EmployeeWorkImportStatus.FAILED,
              errorCode: error instanceof AppError ? error.code : ErrorCodes.INTERNAL_ERROR,
              periodType: batch.periodType,
              periodStart: this.dateOnly(batch.periodStartAt),
              periodEnd: this.dateOnly(batch.periodEndAt),
            },
          },
          tx,
        );
      }, IMPORT_TRANSACTION_OPTIONS);
    } catch {
      // Recovery is best effort and must never hide the original commit failure.
    }
  }

  private loadKind(row: {
    resolvedProjectId: string | null;
    resolvedTaskId: string | null;
  }): LoadEntryKind {
    if (row.resolvedTaskId) return LoadEntryKind.TASK;
    if (row.resolvedProjectId) return LoadEntryKind.PROJECT;
    return LoadEntryKind.OTHER;
  }

  private decimal(value: number | null): Prisma.Decimal | null {
    return value === null ? null : new Prisma.Decimal(String(value));
  }

  private chunks<T>(values: T[], size = WRITE_CHUNK_SIZE): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
      chunks.push(values.slice(index, index + size));
    }
    return chunks;
  }

  private sortedUnique(values: string[]): string[] {
    return [...new Set(values)].sort();
  }

  private commitRevision(batch: EmployeeWorkImportBatch): EmployeeImportCommitRevision {
    return {
      updatedAt: batch.updatedAt,
      previewFingerprint: batch.previewFingerprint,
      sourceStorageKey: batch.sourceStorageKey,
      fileHash: batch.fileHash,
      templateVersion: batch.templateVersion,
      periodType: batch.periodType,
      periodStartAt: batch.periodStartAt,
      periodEndAt: batch.periodEndAt,
    };
  }

  private matchesRevision(
    batch: EmployeeWorkImportBatch,
    revision: EmployeeImportCommitRevision,
  ): boolean {
    return (
      batch.updatedAt.getTime() === revision.updatedAt.getTime() &&
      batch.previewFingerprint === revision.previewFingerprint &&
      batch.sourceStorageKey === revision.sourceStorageKey &&
      batch.fileHash === revision.fileHash &&
      batch.templateVersion === revision.templateVersion &&
      batch.periodType === revision.periodType &&
      batch.periodStartAt.getTime() === revision.periodStartAt.getTime() &&
      batch.periodEndAt.getTime() === revision.periodEndAt.getTime()
    );
  }

  private async lock(client: Prisma.TransactionClient, key: string): Promise<void> {
    await client.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }

  private assertReady(status: EmployeeWorkImportStatus): void {
    if (status !== EmployeeWorkImportStatus.READY) {
      throw this.stateInvalid(`Employee work import batch cannot be committed from ${status}`);
    }
  }

  private assertNotExpired(expiresAt: Date): void {
    if (expiresAt <= this.now()) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_EXPIRED,
        message: 'Employee work import batch has expired',
        statusCode: HttpStatus.GONE,
      });
    }
  }

  private stateInvalid(message: string): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_STATE_INVALID,
      message,
      statusCode: HttpStatus.CONFLICT,
    });
  }

  private notFound(): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_NOT_FOUND,
      message: 'Employee work import batch not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private integrityFailed(message: string): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_INTEGRITY_FAILED,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }

  private resolutionInvalid(message: string): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_RESOLUTION_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }

  private publicBatch(batch: Record<string, unknown>) {
    const safe = Object.fromEntries(
      Object.entries(batch).filter(
        ([key]) =>
          key !== 'sourceStorageKey' &&
          key !== 'errorStorageKey' &&
          key !== 'previewFingerprint' &&
          key !== 'rows',
      ),
    );
    return { ...safe, hasErrors: Boolean(batch.errorStorageKey) };
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
