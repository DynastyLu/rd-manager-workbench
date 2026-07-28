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

export type EmployeeWorkbookSourceSection = 'CURRENT_WORK' | 'NEXT_WEEK_PLAN';

export interface NormalizedEmployeeCurrentWorkRow extends NormalizedEmployeeWorkRow {
  sourceSection: 'CURRENT_WORK';
  sourceSheetName: string;
  sourceRowNumber: number;
  department: string | null;
  workDirection: string | null;
  plannedCompletionAt: string | null;
}

export type NormalizedEmployeePlanPriority = 'UNSPECIFIED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface NormalizedEmployeeNextWeekPlanRow {
  sourceSection: 'NEXT_WEEK_PLAN';
  rowNumber: number;
  sourceSheetName: string;
  sourceRowNumber: number;
  employeeName: string;
  department: string | null;
  workDirection: string | null;
  title: string;
  deliverableText: string | null;
  plannedCompletionAt: string | null;
  priority: NormalizedEmployeePlanPriority;
  collaborationText: string | null;
  planText: string | null;
  note: string | null;
  rawValues: Record<string, string | number | null>;
}

export type NormalizedEmployeeWorkbookRow =
  | NormalizedEmployeeWorkRow
  | NormalizedEmployeeCurrentWorkRow
  | NormalizedEmployeeNextWeekPlanRow;

export interface EmployeeWorkbookV1Meta {
  templateVersion: 1;
  periodType: 'WEEK';
  periodStart: string;
  periodEnd: string;
}

export interface EmployeeWorkbookV2Meta {
  templateVersion: 2;
  periodType: 'WEEK';
  periodStart: string;
  periodEnd: string;
  nextPeriodStart: string;
  nextPeriodEnd: string;
  employeeSheetCount: number;
}

export type EmployeeWorkbookMeta = EmployeeWorkbookV1Meta | EmployeeWorkbookV2Meta;

export interface EmployeeWorkbookProfileWarning {
  employeeName: string;
  sourceSheetName: string;
  field: 'department' | 'workDirection';
  instructionValue: string | null;
  sheetValue: string | null;
  reason: string;
}

export interface EmployeeWorkbookParseResult {
  meta: EmployeeWorkbookMeta;
  rows: NormalizedEmployeeWorkbookRow[];
  profileWarnings?: EmployeeWorkbookProfileWarning[];
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
  sourceSheetName?: string;
  sourceSection?: EmployeeWorkbookSourceSection;
  sourceRowNumber?: number;
}

export interface EmployeeWorkbookSourceRow {
  rowNumber: number;
  rawValues: Record<string, string | number | null>;
  sourceSheetName?: string;
  sourceSection?: EmployeeWorkbookSourceSection;
  sourceRowNumber?: number;
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
