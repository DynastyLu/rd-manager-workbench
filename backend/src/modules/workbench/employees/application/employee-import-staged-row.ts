import { HttpStatus } from '@nestjs/common';
import { EmployeeImportRowStatus, EmployeeWorkStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { NormalizedEmployeeWorkRow } from '../domain/employee-work.types';

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

export interface StagedEmployeeImportRow {
  id: string;
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

export function parseStoredEmployeeImportRow(row: {
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
}): StagedEmployeeImportRow {
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
    throw new AppError({
      code: ErrorCodes.EMPLOYEE_IMPORT_INTEGRITY_FAILED,
      message: `Persisted employee import row ${row.rowNumber} is malformed`,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
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

export function isNormalizedEmployeeImportRow(
  value: NormalizedEmployeeWorkRow | Record<string, never>,
): value is NormalizedEmployeeWorkRow {
  return (
    typeof value === 'object' &&
    typeof (value as Partial<NormalizedEmployeeWorkRow>).rowNumber === 'number' &&
    typeof (value as Partial<NormalizedEmployeeWorkRow>).employeeName === 'string'
  );
}
