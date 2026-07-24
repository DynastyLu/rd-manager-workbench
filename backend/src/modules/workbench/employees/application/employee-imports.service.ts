import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  EmployeeImportRowStatus,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { z } from 'zod';
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
const RESOLUTION_UPDATE_CHUNK_SIZE = 100;

const persistedTextSchema = z.string().max(10_000);
const persistedNullableTextSchema = persistedTextSchema.nullable();
const persistedHoursSchema = z.number().finite().min(0).max(9_999.99).multipleOf(0.01).nullable();
const rawValuesSchema = z.record(
  z.string().max(200),
  z.union([z.string().max(10_000), z.number().finite(), z.null()]),
);
const normalizedRowSchema = z
  .object({
    rowNumber: z.number().int().min(2).max(1_048_576),
    employeeName: z.string().min(1).max(10_000),
    title: z.string().min(1).max(10_000),
    planText: persistedNullableTextSchema,
    summaryText: persistedNullableTextSchema,
    completionRate: z.number().int().min(0).max(100).nullable(),
    status: z.nativeEnum(EmployeeWorkStatus),
    nextPlanText: persistedNullableTextSchema,
    riskText: persistedNullableTextSchema,
    plannedHours: persistedHoursSchema,
    actualHours: persistedHoursSchema,
    projectCode: persistedNullableTextSchema,
    taskCode: persistedNullableTextSchema,
    note: persistedNullableTextSchema,
    rawValues: rawValuesSchema,
  })
  .strict();
const emptyNormalizedRowSchema = z.object({}).strict();
const rowErrorsSchema = z.array(
  z
    .object({
      field: z.string().min(1).max(200),
      code: z.string().min(1).max(120),
      rawValue: z.union([z.string().max(256), z.number().finite(), z.null()]).optional(),
      reason: z.string().max(1_000).optional(),
    })
    .strict(),
);

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
  ) {
    this.now = clock ?? (() => new Date());
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
    let writtenSourceKey: string | null = null;
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await this.lock(
            tx,
            `employee-import-upload:${fileHash}:${inspected.meta.periodType}:${inspected.meta.periodStart}:${inspected.meta.periodEnd}`,
          );
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
          await this.storage.write({
            key: sourceStorageKey,
            content: file.buffer,
            mimeType: XLSX_MIME_TYPE,
          });
          writtenSourceKey = sourceStorageKey;
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
        },
        { timeout: 30_000 },
      );
      return this.publicBatch(result);
    } catch (error) {
      if (writtenSourceKey) {
        await this.storage.delete(writtenSourceKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async preview(id: string) {
    let newErrorStorageKey: string | null = null;
    let previousErrorStorageKey: string | null = null;
    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          await this.lock(tx, `employee-import:${id}`);
          const batch = await this.requireBatchFrom(tx, id);
          this.assertDraft(batch.status);
          previousErrorStorageKey = batch.errorStorageKey;

          const source = await this.storage.read(batch.sourceStorageKey);
          if (this.sha256(source.content) !== batch.fileHash) {
            throw this.integrityFailed('Stored employee import source hash does not match');
          }
          const inspected = await this.workbook.inspect(source.content);
          this.assertSourceMetadata(batch, inspected.meta);
          const validated = await this.validator.validate(inspected.rows, new Map(), tx);
          const stagedRows = this.stageRows(id, inspected.sourceRows, inspected.issues, validated);
          const counts = this.counts(stagedRows);
          const status = this.previewStatus(counts);
          const previewFingerprint = this.fingerprint({
            fileHash: batch.fileHash,
            templateVersion: batch.templateVersion,
            periodType: batch.periodType,
            periodStart: inspected.meta.periodStart,
            periodEnd: inspected.meta.periodEnd,
            rows: stagedRows,
          });
          const errorStorageKey =
            counts.errorRows + counts.unresolvedRows > 0
              ? `employee-imports/${id}/errors/${previewFingerprint}.xlsx`
              : null;
          newErrorStorageKey = errorStorageKey;
          if (errorStorageKey && errorStorageKey !== previousErrorStorageKey) {
            await this.storage.write({
              key: errorStorageKey,
              content: await this.errorWorkbook(stagedRows),
              mimeType: XLSX_MIME_TYPE,
            });
          }

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
              errorStorageKey,
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
        },
        { timeout: 30_000 },
      );
      if (previousErrorStorageKey && previousErrorStorageKey !== newErrorStorageKey) {
        await this.storage.delete(previousErrorStorageKey).catch(() => undefined);
      }
      return this.publicBatch(updated);
    } catch (error) {
      if (newErrorStorageKey && newErrorStorageKey !== previousErrorStorageKey) {
        await this.storage.delete(newErrorStorageKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async resolve(id: string, input: ResolveEmployeeImportInput) {
    let newErrorStorageKey: string | null = null;
    let previousErrorStorageKey: string | null = null;
    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
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
          const invalid = validated.filter(
            ({ status }) => status !== EmployeeImportRowStatus.VALID,
          );
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
              ? `employee-imports/${id}/errors/${previewFingerprint}.xlsx`
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
        },
        { timeout: 30_000 },
      );
      if (previousErrorStorageKey && previousErrorStorageKey !== newErrorStorageKey) {
        await this.storage.delete(previousErrorStorageKey).catch(() => undefined);
      }
      return this.publicBatch(updated);
    } catch (error) {
      if (newErrorStorageKey && newErrorStorageKey !== previousErrorStorageKey) {
        await this.storage.delete(newErrorStorageKey).catch(() => undefined);
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
    const files = await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `employee-import:${id}`);
        const batch = await this.requireBatchFrom(tx, id, false);
        this.assertDraft(batch.status);
        await tx.employeeWorkImportBatch.update({
          where: { id },
          data: {
            status: EmployeeWorkImportStatus.EXPIRED,
            archivedAt: this.now(),
            errorStorageKey: null,
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
        return [batch.sourceStorageKey, batch.errorStorageKey].filter((key): key is string =>
          Boolean(key),
        );
      },
      { timeout: 30_000 },
    );
    await Promise.all(files.map((key) => this.storage.delete(key).catch(() => undefined)));
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
    const rawValues = rawValuesSchema.safeParse(row.rawValues);
    const normalizedValues = z
      .union([normalizedRowSchema, emptyNormalizedRowSchema])
      .safeParse(row.normalizedValues);
    const errors = rowErrorsSchema.safeParse(row.errors);
    if (
      !rawValues.success ||
      !normalizedValues.success ||
      !errors.success ||
      ('rowNumber' in normalizedValues.data && normalizedValues.data.rowNumber !== row.rowNumber)
    ) {
      throw this.integrityFailed(`Persisted employee import row ${row.rowNumber} is malformed`);
    }
    return {
      id: row.id,
      batchId: row.batchId,
      rowNumber: row.rowNumber,
      rawValues: rawValues.data,
      normalizedValues: normalizedValues.data,
      status: row.status,
      errors: errors.data,
      resolvedEmployeeId: row.resolvedEmployeeId,
      resolvedProjectId: row.resolvedProjectId,
      resolvedTaskId: row.resolvedTaskId,
      keepUnlinked: row.keepUnlinked,
    };
  }

  private isNormalizedRow(
    value: NormalizedEmployeeWorkRow | Record<string, never>,
  ): value is NormalizedEmployeeWorkRow {
    return (
      typeof value === 'object' &&
      typeof (value as Partial<NormalizedEmployeeWorkRow>).rowNumber === 'number' &&
      typeof (value as Partial<NormalizedEmployeeWorkRow>).employeeName === 'string'
    );
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
      await client.$executeRaw(Prisma.sql`
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
