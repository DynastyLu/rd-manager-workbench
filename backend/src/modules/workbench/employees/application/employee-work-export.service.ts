import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';

const DAY_MS = 86_400_000;
const HEADERS = [
  '员工姓名',
  '部门',
  '周期开始',
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
  '项目名称',
  '任务编号',
  '来源批次',
  '备注',
] as const;

export interface EmployeeWorkExportQuery {
  periodType: EmployeeProgressPeriod;
  periodStart: string;
  employeeId?: string;
  department?: string;
  projectId?: string;
  status?: EmployeeWorkStatus;
  format?: 'csv' | 'xlsx';
}

type ExportCell = string | number | null;

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
      const items = await this.prisma.employeeWorkItem.findMany({
        where: {
          archivedAt: null,
          periodEndAt: { gte: period.startAt, lte: period.endAt },
          ...(query.periodType === EmployeeProgressPeriod.WEEK
            ? { periodStartAt: period.startAt }
            : {}),
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.projectId ? { projectId: query.projectId } : {}),
          ...(query.status ? { status: query.status } : {}),
          employee: {
            archivedAt: null,
            ...(query.department ? { department: query.department } : {}),
          },
          importBatch: {
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
          },
        },
        select: {
          id: true,
          periodStartAt: true,
          periodEndAt: true,
          title: true,
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
          employee: { select: { displayName: true, department: true } },
          project: { select: { code: true, name: true } },
          task: { select: { code: true, title: true } },
        },
        orderBy: [{ periodStartAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      const rows: ExportCell[][] = [
        [...HEADERS],
        ...items.map((item) => [
          item.employee.displayName,
          item.employee.department,
          this.dateOnly(item.periodStartAt),
          item.title,
          item.planText,
          item.summaryText,
          item.completionRate,
          item.status,
          item.nextPlanText,
          item.riskText,
          item.plannedHours === null ? null : Number(item.plannedHours),
          item.actualHours === null ? null : Number(item.actualHours),
          item.project?.code ?? null,
          item.project?.name ?? null,
          item.task?.code ?? null,
          item.importBatchId,
          item.note,
        ]),
      ];
      const sourceBatchIds = [...new Set(items.map(({ importBatchId }) => importBatchId))].sort();
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
        row.map((value) => (typeof value === 'string' ? this.safeText(value) : value)),
      ),
    );
    sheet.autoFilter = { from: 'A1', to: `Q${Math.max(1, rows.length)}` };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    sheet.columns.forEach((column, index) => {
      column.width = [16, 16, 14, 32, 32, 32, 12, 14, 32, 32, 12, 12, 16, 24, 16, 40, 28][index];
    });
    workbook.subject = `员工工作明细 ${periodStart}`;
    return {
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx' as const,
    };
  }

  private csvCell(value: ExportCell): string {
    const text = typeof value === 'string' ? this.safeText(value) : String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private safeText(value: string): string {
    return /^[=+\-@]/.test(value) ? `'${value}` : value;
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
      end: this.dateOnly(endAt),
    };
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private invalid(message: string): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_WORK_EXPORT_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}
