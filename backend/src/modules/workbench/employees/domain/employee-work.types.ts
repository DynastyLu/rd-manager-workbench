import { EmployeeWorkStatus } from '@prisma/client';

export interface NormalizedEmployeeWorkRow {
  rowNumber: number;
  employeeName: string;
  title: string;
  planText: string | null;
  summaryText: string | null;
  completionRate: number | null;
  status: EmployeeWorkStatus;
  nextPlanText: string | null;
  riskText: string | null;
  plannedHours: number | null;
  actualHours: number | null;
  projectCode: string | null;
  taskCode: string | null;
  note: string | null;
  rawValues: Record<string, string | number | null>;
}

export interface EmployeeWorkbookMeta {
  templateVersion: 1;
  periodType: 'WEEK';
  periodStart: string;
  periodEnd: string;
}

export interface EmployeeWorkbookParseResult {
  meta: EmployeeWorkbookMeta;
  rows: NormalizedEmployeeWorkRow[];
}

export type EmployeeWorkbookIssueCode =
  | 'REQUIRED_FIELD'
  | 'INVALID_VALUE'
  | 'TEXT_TOO_LONG'
  | 'FORMULA_NOT_ALLOWED'
  | 'UNSUPPORTED_CELL_VALUE'
  | 'DATA_OUTSIDE_SCHEMA';

export interface EmployeeWorkbookInspectionIssue {
  code: EmployeeWorkbookIssueCode;
  rowNumber: number;
  field: string;
  rawValue: string | number | null;
  reason: string;
}

export interface EmployeeWorkbookSourceRow {
  rowNumber: number;
  rawValues: Record<string, string | number | null>;
}

export interface EmployeeWorkbookInspectionResult extends EmployeeWorkbookParseResult {
  sourceRows: EmployeeWorkbookSourceRow[];
  issues: EmployeeWorkbookInspectionIssue[];
}

export interface EmployeeWorkbookValidationIssue {
  reason: string;
  rowNumber?: number;
  field?: string;
}
