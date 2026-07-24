import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  EmployeeImportRowStatus,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
  Prisma,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { UploadedContentFile } from '../../content/application/files.service';
import {
  EmployeeWorkbookInspectionIssue,
  EmployeeWorkbookSourceRow,
  NormalizedEmployeeWorkRow,
} from '../domain/employee-work.types';
import {
  EmployeeImportResolution,
  EmployeeImportValidatorService,
  ValidatedEmployeeImportRow,
} from './employee-import-validator.service';
import { employeeImportFingerprint } from './employee-import-fingerprint';
import { EmployeeImportCommitService } from './employee-import-commit.service';
import {
  isNormalizedEmployeeImportRow,
  parseStoredEmployeeImportRow,
} from './employee-import-staged-row';
import { EmployeeWorkbookService } from './employee-workbook.service';

const IMPORT_TTL_MS = 24 * 60 * 60 * 1_000;
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DRAFT_STATUSES = new Set<EmployeeWorkImportStatus>([
  EmployeeWorkImportStatus.UPLOADED,
  EmployeeWorkImportStatus.PREVIEWED,
  EmployeeWorkImportStatus.RESOLVING,
  EmployeeWorkImportStatus.READY,
  EmployeeWorkImportStatus.FAILED,
]);
const EMPLOYEE_IMPORT_CLOCK = Symbol('EMPLOYEE_IMPORT_CLOCK');
const RESOLUTION_UPDATE_CHUNK_SIZE = 1_000;
const IMPORT_TRANSACTION_OPTIONS = {
  maxWait: 30_000,
  timeout: 120_000,
} as const;

const ERROR_HEADERS = [
  '员工姓名',
  '工作内容',
  '本期计划',
  '本期完成情况',
  '完成度',
  '工作状态',
  '下期计划',
  '风险与阻塞',
  '计划工时',
  '实际工时',
  '项目编号',
  '任务编号',
  '备注',
] as const;

interface ResolveRowInput {
  rowNumber: number;
  employeeId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  keepUnlinked?: boolean;
}

export interface ResolveEmployeeImportInput {
  rows: ResolveRowInput[];
}

interface StagedRowData {
  id?: string;
  batchId: string;
  rowNumber: number;
  rawValues: Record<string, string | number | null>;
  normalizedValues: NormalizedEmployeeWorkRow | Record<string, never>;
  status: EmployeeImportRowStatus;
  errors: Array<{
    field: string;
    code: string;
    rawValue?: string | number | null;
    reason?: string;
  }>;
  resolvedEmployeeId: string | null;
  resolvedProjectId: string | null;
  resolvedTaskId: string | null;
  keepUnlinked: boolean;
}

@Injectable()
export class EmployeeImportsService {
  private readonly logger = new Logger(EmployeeImportsService.name);
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
    private readonly workbook: EmployeeWorkbookService,
    private readonly validator: EmployeeImportValidatorService,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(EMPLOYEE_IMPORT_CLOCK)
    clock?: () => Date,
    @Optional()
    private readonly commitService?: EmployeeImportCommitService,
  ) {
    this.now = clock ?? (() => new Date());
  }

  commit(id: string) {
    if (!this.commitService) {
      throw new Error('Employee import commit service is unavailable');
    }
    return this.commitService.commit(id);
  }

  rebuildSnapshots(id: string) {
    if (!this.commitService) {
      throw new Error('Employee import commit service is unavailable');
    }
    return this.commitService.rebuildSnapshots(id);
  }

  async upload(file: UploadedContentFile | undefined) {
    if (!file?.buffer) {
      throw new AppError({
        code: ErrorCodes.FILE_UPLOAD_REQUIRED,
        message: 'Exactly one XLSX file upload is required',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    const originalName = this.safeOriginalName(file.originalname);
    if (!originalName.toLowerCase().endsWith('.xlsx')) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_TEMPLATE_INVALID,
        message: 'Only XLSX employee workbooks are supported',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    if (file.mimetype !== XLSX_MIME_TYPE && file.mimetype !== 'application/octet-stream') {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_TEMPLATE_INVALID,
        message: 'Employee import MIME type must be XLSX or application/octet-stream',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    const inspected = await this.workbook.inspect(file.buffer);
    const fileHash = this.sha256(file.buffer);
    const periodStartAt = this.utcDate(inspected.meta.periodStart);
    const periodEndAt = this.utcDate(inspected.meta.periodEnd);
    const now = this.now();
    const uploadLockKey = `employee-import-upload:${fileHash}:${inspected.meta.periodType}:${inspected.meta.periodStart}:${inspected.meta.periodEnd}`;
    let uploadAttempt: { id: string; sourceStorageKey: string } | null = null;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, uploadLockKey);
        const existing = await tx.employeeWorkImportBatch.findFirst({
          where: {
            fileHash,
            periodType: inspected.meta.periodType,
            periodStartAt,
            periodEndAt,
            expiresAt: { gt: now },
            status: { not: EmployeeWorkImportStatus.EXPIRED },
            archivedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) return existing;

        const id = randomUUID();
        const sourceStorageKey = `employee-imports/${id}/source.xlsx`;
        uploadAttempt = { id, sourceStorageKey };
        await this.storage.write({
          key: sourceStorageKey,
          content: file.buffer,
          mimeType: XLSX_MIME_TYPE,
        });
        const created = await tx.employeeWorkImportBatch.create({
          data: {
            id,
            periodType: inspected.meta.periodType,
            periodStartAt,
            periodEndAt,
            status: EmployeeWorkImportStatus.UPLOADED,
            originalName,
            fileHash,
            sourceStorageKey,
            templateVersion: inspected.meta.templateVersion,
            expiresAt: new Date(now.getTime() + IMPORT_TTL_MS),
          },
        });
        await this.audit.record(
          {
            action: 'EMPLOYEE_IMPORT_UPLOADED',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'SUCCEEDED',
            changedFields: ['status'],
            metadata: {
              status: EmployeeWorkImportStatus.UPLOADED,
              sha256: fileHash,
              byteSize: file.buffer.length,
              periodType: inspected.meta.periodType,
              periodStart: inspected.meta.periodStart,
              periodEnd: inspected.meta.periodEnd,
            },
          },
          tx,
        );
        return created;
      }, IMPORT_TRANSACTION_OPTIONS);
      return this.publicBatch(result);
    } catch (error) {
      if (uploadAttempt) {
        await this.cleanupUnreferencedUpload(uploadLockKey, uploadAttempt);
      }
      throw error;
    }
  }

  async preview(id: string) {
    const snapshot = await this.requireBatch(id);
    this.assertDraft(snapshot.status);
    const source = await this.storage.read(snapshot.sourceStorageKey);
    if (this.sha256(source.content) !== snapshot.fileHash) {
      throw this.integrityFailed('Stored employee import source hash does not match');
    }
    const inspected = await this.workbook.inspect(source.content);
    this.assertSourceMetadata(snapshot, inspected.meta);
    const validated = await this.validator.validate(inspected.rows);
    const stagedRows = this.stageRows(id, inspected.sourceRows, inspected.issues, validated);
    const counts = this.counts(stagedRows);
    const status = this.previewStatus(counts);
    const previewFingerprint = this.fingerprint({
      fileHash: snapshot.fileHash,
      templateVersion: snapshot.templateVersion,
      periodType: snapshot.periodType,
      periodStart: inspected.meta.periodStart,
      periodEnd: inspected.meta.periodEnd,
      rows: stagedRows,
    });
    let newErrorStorageKey: string | null = null;
    let previousErrorStorageKey: string | null = null;
    try {
      if (counts.errorRows + counts.unresolvedRows > 0) {
        newErrorStorageKey = `employee-imports/${id}/errors/${previewFingerprint}-${randomUUID()}.xlsx`;
        const errorContent = await this.errorWorkbook(stagedRows);
        await this.storage.write({
          key: newErrorStorageKey,
          content: errorContent,
          mimeType: XLSX_MIME_TYPE,
        });
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        const batch = await this.requireBatchFrom(tx, id);
        this.assertDraft(batch.status);
        this.assertSnapshotCurrent(snapshot, batch);
        previousErrorStorageKey = batch.errorStorageKey;

        await tx.employeeWorkImportRow.deleteMany({ where: { batchId: id } });
        if (stagedRows.length > 0) {
          await tx.employeeWorkImportRow.createMany({
            data: stagedRows.map((row) => this.rowCreateData(row)),
          });
        }
        const result = await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            status,
            ...counts,
            importedRows: 0,
            previewFingerprint,
            errorStorageKey: newErrorStorageKey,
          },
        });
        await this.audit.record(
          {
            action: 'EMPLOYEE_IMPORT_PREVIEWED',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'SUCCEEDED',
            changedFields: ['status', 'totalRows', 'validRows', 'errorRows', 'unresolvedRows'],
            metadata: { status, ...counts },
          },
          tx,
        );
        return result;
      }, IMPORT_TRANSACTION_OPTIONS);
      if (previousErrorStorageKey && previousErrorStorageKey !== newErrorStorageKey) {
        await this.deleteBestEffort(
          previousErrorStorageKey,
          `old preview artifact ${previousErrorStorageKey}`,
        );
      }
      return this.publicBatch(updated);
    } catch (error) {
      if (newErrorStorageKey && newErrorStorageKey !== previousErrorStorageKey) {
        await this.cleanupUnreferencedAttempt(id, newErrorStorageKey);
      }
      throw error;
    }
  }

  async resolve(id: string, input: ResolveEmployeeImportInput) {
    let newErrorStorageKey: string | null = null;
    let previousErrorStorageKey: string | null = null;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        const batch = await this.requireBatchFrom(tx, id);
        const storedRows = await tx.employeeWorkImportRow.findMany({
          where: { batchId: id },
          orderBy: { rowNumber: 'asc' },
        });
        this.assertResolvable(batch, storedRows.length);
        if (input.rows.length === 0) {
          throw this.resolutionInvalid('At least one row resolution is required');
        }
        previousErrorStorageKey = batch.errorStorageKey;
        const rows: StagedRowData[] = storedRows.map((row) => this.storedRow(row));
        const rowsByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
        const resolutionMap = new Map<number, EmployeeImportResolution>();
        const changedRows: NormalizedEmployeeWorkRow[] = [];
        for (const resolution of input.rows) {
          if (resolutionMap.has(resolution.rowNumber)) {
            throw this.resolutionInvalid('Each row may be resolved only once');
          }
          const staged = rowsByNumber.get(resolution.rowNumber);
          if (!staged || !this.isNormalizedRow(staged.normalizedValues)) {
            throw this.resolutionInvalid(`Row ${resolution.rowNumber} cannot be resolved`);
          }
          const merged: EmployeeImportResolution = {
            employeeId:
              resolution.employeeId !== undefined
                ? resolution.employeeId
                : (staged.resolvedEmployeeId ?? undefined),
            projectId:
              resolution.projectId !== undefined
                ? resolution.projectId
                : (staged.resolvedProjectId ?? undefined),
            taskId:
              resolution.taskId !== undefined
                ? resolution.taskId
                : (staged.resolvedTaskId ?? undefined),
            keepUnlinked: resolution.keepUnlinked ?? staged.keepUnlinked,
          };
          resolutionMap.set(resolution.rowNumber, merged);
          changedRows.push(staged.normalizedValues);
        }

        const validated = await this.validator.validate(changedRows, resolutionMap, tx);
        const invalid = validated.filter(({ status }) => status !== EmployeeImportRowStatus.VALID);
        if (invalid.length > 0) {
          throw new AppError({
            code: ErrorCodes.EMPLOYEE_IMPORT_RESOLUTION_INVALID,
            message: 'One or more employee import resolutions are invalid',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            details: {
              issues: invalid.flatMap(({ row, errors }) =>
                errors.map((error) => ({ rowNumber: row.rowNumber, ...error })),
              ),
            },
          });
        }

        const validatedByNumber = new Map(validated.map((row) => [row.row.rowNumber, row]));
        const nextRows = rows.map((row) => {
          const replacement = validatedByNumber.get(row.rowNumber);
          return replacement ? this.validatedStageRow(id, replacement, row.id) : row;
        });
        const counts = this.counts(nextRows);
        const status = this.previewStatus(counts);
        const previewFingerprint = this.fingerprint({
          fileHash: batch.fileHash,
          templateVersion: batch.templateVersion,
          periodType: batch.periodType,
          periodStart: this.dateOnly(batch.periodStartAt),
          periodEnd: this.dateOnly(batch.periodEndAt),
          rows: nextRows,
        });
        const errorStorageKey =
          counts.errorRows + counts.unresolvedRows > 0
            ? `employee-imports/${id}/errors/${previewFingerprint}-${randomUUID()}.xlsx`
            : null;
        newErrorStorageKey = errorStorageKey;
        if (errorStorageKey && errorStorageKey !== previousErrorStorageKey) {
          await this.storage.write({
            key: errorStorageKey,
            content: await this.errorWorkbook(nextRows),
            mimeType: XLSX_MIME_TYPE,
          });
        }

        await this.bulkUpdateResolvedRows(tx, validated, rowsByNumber);
        const result = await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            status,
            ...counts,
            previewFingerprint,
            errorStorageKey,
          },
        });
        await this.audit.record(
          {
            action: 'EMPLOYEE_IMPORT_RESOLVED',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'SUCCEEDED',
            changedFields: ['status', 'validRows', 'unresolvedRows'],
            metadata: { status, itemCount: validated.length, ...counts },
          },
          tx,
        );
        return result;
      }, IMPORT_TRANSACTION_OPTIONS);
      if (previousErrorStorageKey && previousErrorStorageKey !== newErrorStorageKey) {
        await this.deleteBestEffort(
          previousErrorStorageKey,
          `old resolve artifact ${previousErrorStorageKey}`,
        );
      }
      return this.publicBatch(updated);
    } catch (error) {
      if (newErrorStorageKey && newErrorStorageKey !== previousErrorStorageKey) {
        await this.cleanupUnreferencedAttempt(id, newErrorStorageKey);
      }
      throw error;
    }
  }

  async errorFile(id: string) {
    const batch = await this.requireBatch(id);
    if (!batch.errorStorageKey) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_ERROR_FILE_NOT_FOUND,
        message: 'Employee import has no error workbook',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    const stored = await this.storage.read(batch.errorStorageKey);
    return {
      fileName: `${this.safeDownloadStem(batch.originalName)}-错误行.xlsx`,
      content: stored.content,
      mimeType: stored.mimeType || XLSX_MIME_TYPE,
    };
  }

  async remove(id: string): Promise<void> {
    const cleanup = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `employee-import:${id}`);
      const batch = await this.requireBatchFrom(tx, id, false);
      if (batch.status !== EmployeeWorkImportStatus.EXPIRED) {
        this.assertDraft(batch.status);
        await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            status: EmployeeWorkImportStatus.EXPIRED,
            archivedAt: this.now(),
          },
        });
        await this.audit.record(
          {
            action: 'EMPLOYEE_IMPORT_EXPIRED',
            entityType: 'employeeWorkImportBatch',
            entityId: id,
            outcome: 'SUCCEEDED',
            changedFields: ['status', 'archivedAt'],
            metadata: {
              previousStatus: batch.status,
              status: EmployeeWorkImportStatus.EXPIRED,
            },
          },
          tx,
        );
      }
      return {
        sourceStorageKey: batch.sourceStorageKey,
        errorStorageKey: batch.errorStorageKey,
      };
    }, IMPORT_TRANSACTION_OPTIONS);
    const files = [cleanup.sourceStorageKey, cleanup.errorStorageKey].filter((key): key is string =>
      Boolean(key),
    );
    try {
      await Promise.all(files.map((key) => this.storage.delete(key)));
    } catch (cause) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_CLEANUP_FAILED,
        message: 'Employee import expired but its stored files could not be removed',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        cause,
      });
    }
    if (cleanup.errorStorageKey) {
      await this.clearDeletedErrorLocator(id, cleanup.errorStorageKey);
    }
  }

  private stageRows(
    batchId: string,
    sourceRows: EmployeeWorkbookSourceRow[],
    workbookIssues: EmployeeWorkbookInspectionIssue[],
    validated: ValidatedEmployeeImportRow[],
  ): StagedRowData[] {
    const issuesByRow = new Map<number, EmployeeWorkbookInspectionIssue[]>();
    for (const issue of workbookIssues) {
      const issues = issuesByRow.get(issue.rowNumber) ?? [];
      issues.push(issue);
      issuesByRow.set(issue.rowNumber, issues);
    }
    const validatedByRow = new Map(validated.map((row) => [row.row.rowNumber, row]));
    return sourceRows.map((source) => {
      const issues = issuesByRow.get(source.rowNumber) ?? [];
      if (issues.length > 0) {
        return {
          batchId,
          rowNumber: source.rowNumber,
          rawValues: source.rawValues,
          normalizedValues: {},
          status: EmployeeImportRowStatus.ERROR,
          errors: issues,
          resolvedEmployeeId: null,
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
        };
      }
      const row = validatedByRow.get(source.rowNumber);
      if (!row) {
        return {
          batchId,
          rowNumber: source.rowNumber,
          rawValues: source.rawValues,
          normalizedValues: {},
          status: EmployeeImportRowStatus.ERROR,
          errors: [
            {
              field: 'row',
              code: 'ROW_NOT_NORMALIZED',
              rawValue: null,
              reason: 'row could not be normalized',
            },
          ],
          resolvedEmployeeId: null,
          resolvedProjectId: null,
          resolvedTaskId: null,
          keepUnlinked: false,
        };
      }
      return this.validatedStageRow(batchId, row);
    });
  }

  private validatedStageRow(
    batchId: string,
    validated: ValidatedEmployeeImportRow,
    id?: string,
  ): StagedRowData {
    return {
      id,
      batchId,
      rowNumber: validated.row.rowNumber,
      rawValues: validated.row.rawValues,
      normalizedValues: validated.row,
      status: validated.status,
      errors: validated.errors,
      resolvedEmployeeId: validated.resolvedEmployeeId,
      resolvedProjectId: validated.resolvedProjectId,
      resolvedTaskId: validated.resolvedTaskId,
      keepUnlinked: validated.keepUnlinked,
    };
  }

  private rowCreateData(row: StagedRowData) {
    return {
      batchId: row.batchId,
      rowNumber: row.rowNumber,
      rawValues: row.rawValues as unknown as Prisma.InputJsonValue,
      normalizedValues: row.normalizedValues as unknown as Prisma.InputJsonValue,
      status: row.status,
      errors: row.errors as unknown as Prisma.InputJsonValue,
      resolvedEmployeeId: row.resolvedEmployeeId,
      resolvedProjectId: row.resolvedProjectId,
      resolvedTaskId: row.resolvedTaskId,
      keepUnlinked: row.keepUnlinked,
    };
  }

  private counts(rows: StagedRowData[]) {
    return {
      totalRows: rows.length,
      validRows: rows.filter(({ status }) => status === EmployeeImportRowStatus.VALID).length,
      errorRows: rows.filter(({ status }) => status === EmployeeImportRowStatus.ERROR).length,
      unresolvedRows: rows.filter(({ status }) => status === EmployeeImportRowStatus.UNRESOLVED)
        .length,
    };
  }

  private previewStatus(counts: {
    errorRows: number;
    unresolvedRows: number;
  }): EmployeeWorkImportStatus {
    if (counts.errorRows > 0) return EmployeeWorkImportStatus.PREVIEWED;
    if (counts.unresolvedRows > 0) return EmployeeWorkImportStatus.RESOLVING;
    return EmployeeWorkImportStatus.READY;
  }

  private async errorWorkbook(rows: StagedRowData[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RD Manager Workbench';
    workbook.created = new Date(0);
    workbook.modified = new Date(0);
    const sheet = workbook.addWorksheet('错误行');
    sheet.addRow([
      ...ERROR_HEADERS,
      '__row_number',
      '__error_fields',
      '__error_codes',
      '__error_reasons',
    ]);
    for (const row of rows) {
      if (row.status === EmployeeImportRowStatus.VALID) continue;
      sheet.addRow([
        ...ERROR_HEADERS.map((header) => row.rawValues[header] ?? null),
        row.rowNumber,
        row.errors.map(({ field }) => field).join('|'),
        row.errors.map(({ code }) => code).join('|'),
        row.errors.map(({ reason, code }) => reason ?? code).join('|'),
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private fingerprint(input: {
    fileHash: string;
    templateVersion: number;
    periodType: string;
    periodStart: string;
    periodEnd: string;
    rows: StagedRowData[];
  }): string {
    return employeeImportFingerprint({
      ...input,
      rows: input.rows.map((row) => ({
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
  }

  private storedRow(row: {
    id: string;
    batchId: string;
    rowNumber: number;
    rawValues: Prisma.JsonValue;
    normalizedValues: Prisma.JsonValue;
    status: EmployeeImportRowStatus;
    errors: Prisma.JsonValue;
    resolvedEmployeeId: string | null;
    resolvedProjectId: string | null;
    resolvedTaskId: string | null;
    keepUnlinked: boolean;
  }): StagedRowData {
    return parseStoredEmployeeImportRow(row);
  }

  private isNormalizedRow(
    value: NormalizedEmployeeWorkRow | Record<string, never>,
  ): value is NormalizedEmployeeWorkRow {
    return isNormalizedEmployeeImportRow(value);
  }

  private async requireBatch(id: string) {
    const batch = await this.prisma.employeeWorkImportBatch.findUnique({
      where: { id },
    });
    if (!batch) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_NOT_FOUND,
        message: 'Employee work import batch not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    if (
      batch.status === EmployeeWorkImportStatus.EXPIRED ||
      (DRAFT_STATUSES.has(batch.status) && batch.expiresAt <= this.now())
    ) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_EXPIRED,
        message: 'Employee work import batch has expired',
        statusCode: HttpStatus.GONE,
      });
    }
    return batch;
  }

  private async requireBatchFrom(
    client: Prisma.TransactionClient,
    id: string,
    enforceExpiry = true,
  ): Promise<EmployeeWorkImportBatch> {
    const batch = await client.employeeWorkImportBatch.findUnique({
      where: { id },
    });
    if (!batch) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_NOT_FOUND,
        message: 'Employee work import batch not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    if (
      (enforceExpiry && batch.status === EmployeeWorkImportStatus.EXPIRED) ||
      (enforceExpiry && DRAFT_STATUSES.has(batch.status) && batch.expiresAt <= this.now())
    ) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_EXPIRED,
        message: 'Employee work import batch has expired',
        statusCode: HttpStatus.GONE,
      });
    }
    return batch;
  }

  private async bulkUpdateResolvedRows(
    client: Prisma.TransactionClient,
    validated: ValidatedEmployeeImportRow[],
    rowsByNumber: ReadonlyMap<number, StagedRowData>,
  ): Promise<void> {
    const updates = validated.flatMap((validatedRow) => {
      const existing = rowsByNumber.get(validatedRow.row.rowNumber);
      return existing?.id ? [{ id: existing.id, validatedRow }] : [];
    });
    for (let offset = 0; offset < updates.length; offset += RESOLUTION_UPDATE_CHUNK_SIZE) {
      const chunk = updates.slice(offset, offset + RESOLUTION_UPDATE_CHUNK_SIZE);
      const values = Prisma.join(
        chunk.map(
          ({ id, validatedRow }) => Prisma.sql`(
          ${id}::text,
          ${validatedRow.status}::"app"."EmployeeImportRowStatus",
          ${JSON.stringify(validatedRow.errors)}::jsonb,
          ${validatedRow.resolvedEmployeeId}::text,
          ${validatedRow.resolvedProjectId}::text,
          ${validatedRow.resolvedTaskId}::text,
          ${validatedRow.keepUnlinked}::boolean
        )`,
        ),
      );
      const affectedRows = await client.$executeRaw(Prisma.sql`
        UPDATE "app"."employee_work_import_rows" AS target
        SET
          "status" = incoming.status,
          "errors" = incoming.errors,
          "resolved_employee_id" = incoming.resolved_employee_id,
          "resolved_project_id" = incoming.resolved_project_id,
          "resolved_task_id" = incoming.resolved_task_id,
          "keep_unlinked" = incoming.keep_unlinked,
          "updated_at" = now()
        FROM (
          VALUES ${values}
        ) AS incoming(
          id,
          status,
          errors,
          resolved_employee_id,
          resolved_project_id,
          resolved_task_id,
          keep_unlinked
        )
        WHERE target.id = incoming.id
      `);
      if (affectedRows !== chunk.length) {
        throw this.integrityFailed(
          `Employee import resolution update matched ${affectedRows} of ${chunk.length} rows`,
        );
      }
    }
  }

  private async cleanupUnreferencedAttempt(id: string, attemptKey: string): Promise<void> {
    try {
      const canDelete = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        const current = await tx.employeeWorkImportBatch.findUnique({
          where: { id },
          select: { errorStorageKey: true },
        });
        return current?.errorStorageKey !== attemptKey;
      }, IMPORT_TRANSACTION_OPTIONS);
      if (canDelete) {
        await this.deleteBestEffort(attemptKey, `attempt artifact ${attemptKey}`);
      }
    } catch {
      // A failed ownership check must leave a possible committed artifact intact.
    }
  }

  private async cleanupUnreferencedUpload(
    lockKey: string,
    attempt: { id: string; sourceStorageKey: string },
  ): Promise<void> {
    try {
      const canDelete = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, lockKey);
        const current = await tx.employeeWorkImportBatch.findUnique({
          where: { id: attempt.id },
          select: { sourceStorageKey: true },
        });
        return current?.sourceStorageKey !== attempt.sourceStorageKey;
      }, IMPORT_TRANSACTION_OPTIONS);
      if (canDelete) {
        await this.deleteBestEffort(
          attempt.sourceStorageKey,
          `uncommitted upload source ${attempt.sourceStorageKey}`,
        );
      }
    } catch {
      // A failed ownership check must leave a possible committed source intact.
    }
  }

  private async clearDeletedErrorLocator(id: string, deletedKey: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        const current = await tx.employeeWorkImportBatch.findUnique({
          where: { id },
          select: { errorStorageKey: true },
        });
        if (current?.errorStorageKey === deletedKey) {
          await tx.employeeWorkImportBatch.update({
            where: { id },
            data: { errorStorageKey: null },
          });
        }
      }, IMPORT_TRANSACTION_OPTIONS);
    } catch {
      // The retained locator makes a later idempotent cleanup safe.
      this.logger.warn(`Could not clear deleted employee import artifact locator ${deletedKey}`);
    }
  }

  private async deleteBestEffort(storageKey: string, description: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch {
      this.logger.warn(`Could not delete ${description}`);
    }
  }

  private async lock(client: Prisma.TransactionClient, key: string): Promise<void> {
    await client.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }

  private assertSourceMetadata(
    batch: {
      templateVersion: number;
      periodType: string;
      periodStartAt: Date;
      periodEndAt: Date;
    },
    meta: {
      templateVersion: number;
      periodType: string;
      periodStart: string;
      periodEnd: string;
    },
  ): void {
    if (
      meta.templateVersion !== batch.templateVersion ||
      meta.periodType !== batch.periodType ||
      meta.periodStart !== this.dateOnly(batch.periodStartAt) ||
      meta.periodEnd !== this.dateOnly(batch.periodEndAt)
    ) {
      throw this.integrityFailed('Stored employee import source metadata does not match');
    }
  }

  private assertSourceIdentity(
    snapshot: EmployeeWorkImportBatch,
    current: EmployeeWorkImportBatch,
  ): void {
    if (
      current.sourceStorageKey !== snapshot.sourceStorageKey ||
      current.fileHash !== snapshot.fileHash ||
      current.templateVersion !== snapshot.templateVersion ||
      current.periodType !== snapshot.periodType ||
      current.periodStartAt.getTime() !== snapshot.periodStartAt.getTime() ||
      current.periodEndAt.getTime() !== snapshot.periodEndAt.getTime()
    ) {
      throw this.integrityFailed('Employee import source changed during preview');
    }
  }

  private assertSnapshotCurrent(
    snapshot: EmployeeWorkImportBatch,
    current: EmployeeWorkImportBatch,
  ): void {
    this.assertSourceIdentity(snapshot, current);
    if (
      current.status !== snapshot.status ||
      current.updatedAt.getTime() !== snapshot.updatedAt.getTime() ||
      current.previewFingerprint !== snapshot.previewFingerprint
    ) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_STATE_STALE,
        message: 'Employee import changed while preview was being prepared',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private assertResolvable(
    batch: {
      status: EmployeeWorkImportStatus;
      previewFingerprint: string | null;
      totalRows: number;
    },
    persistedRowCount: number,
  ): void {
    const previewedStatus =
      batch.status === EmployeeWorkImportStatus.PREVIEWED ||
      batch.status === EmployeeWorkImportStatus.RESOLVING ||
      batch.status === EmployeeWorkImportStatus.READY ||
      batch.status === EmployeeWorkImportStatus.FAILED;
    if (!previewedStatus || !batch.previewFingerprint || persistedRowCount !== batch.totalRows) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_STATE_INVALID,
        message: 'Employee work import batch must have a complete preview before resolution',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private integrityFailed(message: string): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_INTEGRITY_FAILED,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }

  private assertDraft(status: EmployeeWorkImportStatus): void {
    if (!DRAFT_STATUSES.has(status)) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_STATE_INVALID,
        message: `Employee work import batch cannot be changed from ${status}`,
        statusCode: HttpStatus.CONFLICT,
      });
    }
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
    const errorStorageKey = batch.errorStorageKey;
    return { ...safe, hasErrors: Boolean(errorStorageKey) };
  }

  private safeOriginalName(name: string): string {
    return (
      basename(name.replace(/\\/g, '/'))
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 240) || 'employee-work-import.xlsx'
    );
  }

  private safeDownloadStem(name: string): string {
    return (
      name
        .replace(/\.xlsx$/i, '')
        .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
        .slice(0, 100) || 'employee-work-import'
    );
  }

  private utcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
