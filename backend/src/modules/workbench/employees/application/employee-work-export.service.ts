import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { safeExportText } from '../../../../shared/export/safe-export-text';
import { AuditLogService } from '../../governance/application/audit-log.service';

const DAY_MS = 86_400_000;

const CURRENT_ITEM_SELECT = {
  id: true,
  sourceRowId: true,
  periodStartAt: true,
  periodEndAt: true,
  title: true,
  workKind: true,
  plannedCompletionAt: true,
  planText: true,
  summaryText: true,
  completionRate: true,
  status: true,
  nextPlanText: true,
  riskText: true,
  plannedHours: true,
  actualHours: true,
  note: true,
  importBatchId: true,
  projectId: true,
  taskId: true,
  employee: { select: { displayName: true, department: true, workDirection: true } },
  project: { select: { id: true, code: true, name: true } },
  task: { select: { id: true, code: true, title: true } },
  sourceRow: {
    select: { sourceSheetName: true, sourceSection: true, sourceRowNumber: true },
  },
} satisfies Prisma.EmployeeWorkItemSelect;

const PLAN_ITEM_SELECT = {
  id: true,
  sourceRowId: true,
  periodStartAt: true,
  periodEndAt: true,
  title: true,
  deliverableText: true,
  plannedCompletionAt: true,
  priority: true,
  collaborationText: true,
  planText: true,
  note: true,
  workKind: true,
  carryStatus: true,
  cancelReason: true,
  importBatchId: true,
  projectId: true,
  taskId: true,
  employee: { select: { displayName: true, department: true, workDirection: true } },
  project: { select: { id: true, code: true, name: true } },
  task: { select: { id: true, code: true, title: true } },
  sourceRow: {
    select: { sourceSheetName: true, sourceSection: true, sourceRowNumber: true },
  },
} satisfies Prisma.EmployeeWeekPlanItemSelect;

type CurrentExportItem = Prisma.EmployeeWorkItemGetPayload<{
  select: typeof CURRENT_ITEM_SELECT;
}>;
type PlanExportItem = Prisma.EmployeeWeekPlanItemGetPayload<{ select: typeof PLAN_ITEM_SELECT }>;
type EmployeeWorkExportItem =
  | { sourceType: '当前工作'; item: CurrentExportItem }
  | { sourceType: '未来计划'; item: PlanExportItem };

type ExportCell = string | number | null;

interface EmployeeWorkExportColumn {
  header: string;
  width: number;
  value: (item: EmployeeWorkExportItem) => ExportCell;
}

// Single source of truth: header, column width, and cell extractor per column
// so the three can never drift apart.
const COLUMNS: readonly EmployeeWorkExportColumn[] = [
  { header: '员工姓名', width: 16, value: ({ item }) => item.employee.displayName },
  { header: '部门', width: 16, value: ({ item }) => item.employee.department },
  { header: '周期开始', width: 14, value: ({ item }) => dateOnly(item.periodStartAt) },
  { header: '工作内容', width: 32, value: ({ item }) => item.title },
  {
    header: '本期计划',
    width: 32,
    value: (row) => (row.sourceType === '当前工作' ? row.item.planText : null),
  },
  {
    header: '本期完成情况',
    width: 32,
    value: (row) => (row.sourceType === '当前工作' ? row.item.summaryText : null),
  },
  {
    header: '完成度',
    width: 12,
    value: (row) => (row.sourceType === '当前工作' ? row.item.completionRate : null),
  },
  {
    header: '工作状态',
    width: 14,
    value: (row) => (row.sourceType === '当前工作' ? row.item.status : null),
  },
  {
    header: '下期计划',
    width: 32,
    value: (row) => (row.sourceType === '当前工作' ? row.item.nextPlanText : null),
  },
  {
    header: '风险与阻塞',
    width: 32,
    value: (row) => (row.sourceType === '当前工作' ? row.item.riskText : null),
  },
  {
    header: '计划工时',
    width: 12,
    value: (row) =>
      row.sourceType === '当前工作' && row.item.plannedHours !== null
        ? Number(row.item.plannedHours)
        : null,
  },
  {
    header: '实际工时',
    width: 12,
    value: (row) =>
      row.sourceType === '当前工作' && row.item.actualHours !== null
        ? Number(row.item.actualHours)
        : null,
  },
  { header: '项目编号', width: 16, value: ({ item }) => item.project?.code ?? null },
  { header: '项目名称', width: 24, value: ({ item }) => item.project?.name ?? null },
  { header: '任务编号', width: 16, value: ({ item }) => item.task?.code ?? null },
  { header: '来源批次', width: 40, value: ({ item }) => item.importBatchId },
  { header: '备注', width: 28, value: ({ item }) => item.note },
  { header: '来源类型', width: 14, value: ({ sourceType }) => sourceType },
  { header: '周期结束', width: 14, value: ({ item }) => dateOnly(item.periodEndAt) },
  { header: '工作方向', width: 18, value: ({ item }) => item.employee.workDirection },
  { header: '系统分类', width: 14, value: ({ item }) => item.workKind },
  {
    header: '计划完成日期',
    width: 16,
    value: ({ item }) =>
      item.plannedCompletionAt ? dateOnly(item.plannedCompletionAt) : null,
  },
  {
    header: '交付物',
    width: 32,
    value: (row) => (row.sourceType === '未来计划' ? row.item.deliverableText : null),
  },
  {
    header: '优先级',
    width: 14,
    value: (row) => (row.sourceType === '未来计划' ? row.item.priority : null),
  },
  {
    header: '协作需求',
    width: 32,
    value: (row) => (row.sourceType === '未来计划' ? row.item.collaborationText : null),
  },
  {
    header: '未来计划',
    width: 32,
    value: (row) => (row.sourceType === '未来计划' ? row.item.planText : null),
  },
  {
    header: '计划流转状态',
    width: 16,
    value: (row) => (row.sourceType === '未来计划' ? row.item.carryStatus : null),
  },
  {
    header: '取消原因',
    width: 28,
    value: (row) => (row.sourceType === '未来计划' ? row.item.cancelReason : null),
  },
  { header: '项目ID', width: 28, value: ({ item }) => item.projectId },
  { header: '任务ID', width: 28, value: ({ item }) => item.taskId },
  { header: '任务名称', width: 28, value: ({ item }) => item.task?.title ?? null },
  {
    header: '工时风险',
    width: 20,
    value: (row) => workHoursRisk(row),
  },
  {
    header: '来源工作表',
    width: 20,
    value: ({ item }) => item.sourceRow.sourceSheetName,
  },
  { header: '来源区段', width: 18, value: ({ item }) => item.sourceRow.sourceSection },
  { header: '来源行号', width: 12, value: ({ item }) => item.sourceRow.sourceRowNumber },
  { header: '来源记录ID', width: 32, value: ({ item }) => item.sourceRowId },
];

const LAST_COLUMN_LETTER = columnLetter(COLUMNS.length);

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function columnLetter(columnNumber: number): string {
  let value = columnNumber;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function workHoursRisk(row: EmployeeWorkExportItem): string | null {
  if (
    row.sourceType !== '当前工作' ||
    row.item.plannedHours === null ||
    row.item.actualHours === null
  ) {
    return null;
  }
  const overrun = Number(row.item.actualHours) - Number(row.item.plannedHours);
  return overrun > 0 ? `超出计划 ${overrun} 小时` : null;
}

export interface EmployeeWorkExportQuery {
  periodType: EmployeeProgressPeriod;
  periodStart: string;
  employeeId?: string;
  department?: string;
  projectId?: string;
  status?: EmployeeWorkStatus;
  format?: 'csv' | 'xlsx';
}

@Injectable()
export class EmployeeWorkExportService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async export(query: EmployeeWorkExportQuery) {
    const format = query.format ?? 'xlsx';
    try {
      const period = this.periodBounds(query.periodType, query.periodStart);
      const importBatchWhere = {
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt:
          query.periodType === EmployeeProgressPeriod.WEEK
            ? period.startAt
            : { gte: period.batchWindowStart, lte: period.endAt },
        periodEndAt:
          query.periodType === EmployeeProgressPeriod.WEEK
            ? period.endAt
            : { gte: period.startAt, lte: period.endAt },
        status: EmployeeWorkImportStatus.COMPLETED,
        archivedAt: null,
      } satisfies Prisma.EmployeeWorkImportBatchWhereInput;
      const employeeWhere = {
        archivedAt: null,
        ...(query.department ? { department: query.department } : {}),
      } satisfies Prisma.ResourceProfileWhereInput;
      const [currentItems, planItems] = await Promise.all([
        this.prisma.employeeWorkItem.findMany({
          where: {
            archivedAt: null,
            periodEndAt: { gte: period.startAt, lte: period.endAt },
            ...(query.periodType === EmployeeProgressPeriod.WEEK
              ? { periodStartAt: period.startAt }
              : {}),
            ...(query.employeeId ? { employeeId: query.employeeId } : {}),
            ...(query.projectId ? { projectId: query.projectId } : {}),
            ...(query.status ? { status: query.status } : {}),
            employee: employeeWhere,
            importBatch: importBatchWhere,
          },
          select: CURRENT_ITEM_SELECT,
          orderBy: [{ periodStartAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.employeeWeekPlanItem.findMany({
          where: {
            archivedAt: null,
            ...(query.employeeId ? { employeeId: query.employeeId } : {}),
            ...(query.projectId ? { projectId: query.projectId } : {}),
            employee: employeeWhere,
            importBatch: importBatchWhere,
          },
          select: PLAN_ITEM_SELECT,
          orderBy: [{ periodStartAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const items: EmployeeWorkExportItem[] = [
        ...currentItems.map((item) => ({ sourceType: '当前工作' as const, item })),
        ...planItems.map((item) => ({ sourceType: '未来计划' as const, item })),
      ];
      const rows: ExportCell[][] = [
        COLUMNS.map(({ header }) => header),
        ...items.map((item) => COLUMNS.map(({ value }) => value(item))),
      ];
      const sourceBatchIds = [
        ...new Set(items.map(({ item }) => item.importBatchId)),
      ].sort();
      const result = format === 'csv' ? this.csv(rows) : await this.xlsx(rows, query.periodStart);
      await this.audit.record({
        action: 'EMPLOYEE_WORK_EXPORTED',
        entityType: 'employeeWorkItem',
        outcome: 'SUCCEEDED',
        changedFields: [],
        metadata: {
          format,
          rowCount: items.length,
          periodType: query.periodType,
          periodStart: period.start,
          periodEnd: period.end,
        },
      });
      return {
        ...result,
        fileName: `employee-work-items-${period.start}-${period.end}.${result.extension}`,
        rowCount: items.length,
        sourceBatchIds,
      };
    } catch (error) {
      await this.audit
        .record({
          action: 'EMPLOYEE_WORK_EXPORT_FAILED',
          entityType: 'employeeWorkItem',
          outcome: 'FAILED',
          changedFields: [],
          metadata: {
            format,
            rowCount: 0,
            periodType: query.periodType,
            periodStart: query.periodStart,
            errorCode: error instanceof AppError ? error.code : ErrorCodes.INTERNAL_ERROR,
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private csv(rows: ExportCell[][]) {
    const content = `\uFEFF${rows
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n')}\r\n`;
    return {
      content: Buffer.from(content, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv' as const,
    };
  }

  private async xlsx(rows: ExportCell[][], periodStart: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RD Manager Workbench';
    workbook.created = new Date();
    workbook.properties.date1904 = false;
    const sheet = workbook.addWorksheet('员工工作明细', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.addRows(
      rows.map((row) =>
        row.map((value) => (typeof value === 'string' ? safeExportText(value) : value)),
      ),
    );
    sheet.autoFilter = { from: 'A1', to: `${LAST_COLUMN_LETTER}${Math.max(1, rows.length)}` };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    sheet.columns.forEach((column, index) => {
      column.width = COLUMNS[index]?.width;
    });
    workbook.subject = `员工工作明细 ${periodStart}`;
    return {
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx' as const,
    };
  }

  private csvCell(value: ExportCell): string {
    const text = typeof value === 'string' ? safeExportText(value) : String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private periodBounds(type: EmployeeProgressPeriod, start: string) {
    const startAt = new Date(`${start}T00:00:00.000Z`);
    if (!Number.isFinite(startAt.getTime()) || startAt.toISOString().slice(0, 10) !== start) {
      throw this.invalid('Employee work export periodStart is invalid');
    }
    if (type === EmployeeProgressPeriod.WEEK && startAt.getUTCDay() !== 1) {
      throw this.invalid('Weekly employee work export periodStart must be a Monday');
    }
    if (type === EmployeeProgressPeriod.MONTH && startAt.getUTCDate() !== 1) {
      throw this.invalid('Monthly employee work export periodStart must be the first day');
    }
    const endAt =
      type === EmployeeProgressPeriod.WEEK
        ? new Date(startAt.getTime() + 6 * DAY_MS)
        : new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + 1, 0));
    const batchWindowStart =
      type === EmployeeProgressPeriod.WEEK
        ? startAt
        : new Date(startAt.getTime() + (((7 - startAt.getUTCDay()) % 7) - 6) * DAY_MS);
    return {
      startAt,
      endAt,
      batchWindowStart,
      start,
      end: dateOnly(endAt),
    };
  }

  private invalid(message: string): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_WORK_EXPORT_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}
