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
const sourceSectionSchema = z.enum(['CURRENT_WORK', 'NEXT_WEEK_PLAN']);
const sourceCoordinatesSchema = {
  sourceSheetName: z.string().min(1).max(200),
  sourceRowNumber: z.number().int().min(1).max(1_048_576),
};
const v2CurrentRowSchema = normalizedRowSchema
  .extend({
    sourceSection: z.literal('CURRENT_WORK'),
    ...sourceCoordinatesSchema,
    department: persistedNullableTextSchema,
    workDirection: persistedNullableTextSchema,
    plannedCompletionAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .strict();
const v2NextPlanRowSchema = z
  .object({
    rowNumber: z.number().int().min(2).max(1_048_576),
    sourceSection: z.literal('NEXT_WEEK_PLAN'),
    ...sourceCoordinatesSchema,
    employeeName: z.string().min(1).max(10_000),
    department: persistedNullableTextSchema,
    workDirection: persistedNullableTextSchema,
    title: z.string().min(1).max(10_000),
    deliverableText: persistedNullableTextSchema,
    plannedCompletionAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    priority: z.enum(['UNSPECIFIED', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    collaborationText: persistedNullableTextSchema,
    planText: persistedNullableTextSchema,
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
  normalizedValues: NormalizedEmployeeImportWorkbookRow | Record<string, never>;
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
  sourceSheetName: string | null;
  sourceSection: EmployeeImportSourceSection | null;
  sourceRowNumber: number | null;
  sourceKey: string | null;
  workKind: EmployeeImportWorkKind | null;
  plannedHours: number | null;
  actualHours: number | null;
  profileAction: EmployeeImportProfileAction | null;
  riskDecision: EmployeeImportRiskDecision | null;
  riskText: string | null;
}

export type EmployeeImportSourceSection = z.infer<typeof sourceSectionSchema>;
export type EmployeeImportWorkKind = 'PROJECT' | 'NON_PROJECT';
export type EmployeeImportProfileAction = 'KEEP' | 'CREATE' | 'UPDATE';
export type EmployeeImportRiskDecision = 'KEEP' | 'REMOVE' | 'EDIT';
export type NormalizedV2EmployeeWorkRow = z.infer<typeof v2CurrentRowSchema>;
export type NormalizedV2EmployeeWeekPlanRow = z.infer<typeof v2NextPlanRowSchema>;
export type NormalizedEmployeeImportWorkbookRow =
  | NormalizedEmployeeWorkRow
  | NormalizedV2EmployeeWorkRow
  | NormalizedV2EmployeeWeekPlanRow;

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
  sourceSheetName?: string | null;
  sourceSection?: string | null;
  sourceRowNumber?: number | null;
  sourceKey?: string | null;
  workKind?: string | null;
  plannedHours?: Prisma.Decimal | number | string | null;
  actualHours?: Prisma.Decimal | number | string | null;
  profileAction?: string | null;
  riskDecision?: string | null;
  riskText?: string | null;
}): StagedEmployeeImportRow {
  const rawValues = rawValuesSchema.safeParse(row.rawValues);
  const normalizedValues = z
    .union([
      normalizedRowSchema,
      v2CurrentRowSchema,
      v2NextPlanRowSchema,
      emptyNormalizedRowSchema,
    ])
    .safeParse(row.normalizedValues);
  const errors = rowErrorsSchema.safeParse(row.errors);
  const sourceSheetName = row.sourceSheetName ?? null;
  const sourceSection = sourceSectionSchema.nullable().safeParse(row.sourceSection ?? null);
  const sourceRowNumber = z
    .number()
    .int()
    .min(1)
    .max(1_048_576)
    .nullable()
    .safeParse(row.sourceRowNumber ?? null);
  const sourceKey = z.string().min(1).max(600).nullable().safeParse(row.sourceKey ?? null);
  const workKind = z
    .enum(['PROJECT', 'NON_PROJECT'])
    .nullable()
    .safeParse(row.workKind ?? null);
  const plannedHours = persistedHoursSchema.safeParse(thisNumber(row.plannedHours));
  const actualHours = persistedHoursSchema.safeParse(thisNumber(row.actualHours));
  const profileAction = z
    .enum(['KEEP', 'CREATE', 'UPDATE'])
    .nullable()
    .safeParse(row.profileAction ?? null);
  const riskDecision = z
    .enum(['KEEP', 'REMOVE', 'EDIT'])
    .nullable()
    .safeParse(row.riskDecision ?? null);
  const riskText = persistedNullableTextSchema.safeParse(row.riskText ?? null);
  const hasSourceCoordinates =
    sourceSheetName !== null ||
    (sourceSection.success && sourceSection.data !== null) ||
    (sourceRowNumber.success && sourceRowNumber.data !== null) ||
    (sourceKey.success && sourceKey.data !== null);
  const validSourceCoordinates =
    !hasSourceCoordinates ||
    (sourceSheetName !== null &&
      sourceSection.success &&
      sourceSection.data !== null &&
      sourceRowNumber.success &&
      sourceRowNumber.data !== null &&
      sourceKey.success &&
      sourceKey.data === `${sourceSheetName}:${sourceSection.data}:${sourceRowNumber.data}`);
  const normalizedSourceMatches =
    !normalizedValues.success ||
    !('sourceSection' in normalizedValues.data) ||
    (normalizedValues.data.sourceSection === sourceSection.data &&
      normalizedValues.data.sourceSheetName === sourceSheetName &&
      normalizedValues.data.sourceRowNumber === sourceRowNumber.data);
  if (
    !rawValues.success ||
    !normalizedValues.success ||
    !errors.success ||
    !sourceSection.success ||
    !sourceRowNumber.success ||
    !sourceKey.success ||
    !workKind.success ||
    !plannedHours.success ||
    !actualHours.success ||
    !profileAction.success ||
    !riskDecision.success ||
    !riskText.success ||
    !validSourceCoordinates ||
    !normalizedSourceMatches ||
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
    sourceSheetName,
    sourceSection: sourceSection.data,
    sourceRowNumber: sourceRowNumber.data,
    sourceKey: sourceKey.data,
    workKind: workKind.data,
    plannedHours: plannedHours.data,
    actualHours: actualHours.data,
    profileAction: profileAction.data,
    riskDecision: riskDecision.data,
    riskText: riskText.data,
  };
}

export function isNormalizedEmployeeImportRow(
  value: NormalizedEmployeeImportWorkbookRow | Record<string, never>,
): value is NormalizedEmployeeWorkRow | NormalizedV2EmployeeWorkRow {
  return (
    typeof value === 'object' &&
    typeof (value as Partial<NormalizedEmployeeWorkRow>).rowNumber === 'number' &&
    typeof (value as Partial<NormalizedEmployeeWorkRow>).employeeName === 'string' &&
    (value as Partial<NormalizedV2EmployeeWeekPlanRow>).sourceSection !== 'NEXT_WEEK_PLAN'
  );
}

export function isNormalizedEmployeeWeekPlanImportRow(
  value: NormalizedEmployeeImportWorkbookRow | Record<string, never>,
): value is NormalizedV2EmployeeWeekPlanRow {
  return (
    typeof value === 'object' &&
    (value as Partial<NormalizedV2EmployeeWeekPlanRow>).sourceSection === 'NEXT_WEEK_PLAN'
  );
}

function thisNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value.toString());
}
