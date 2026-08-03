import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataFieldType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { Writable } from 'node:stream';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { BaseService } from '../base.service';

export interface BaseExportResult {
  contentType: string;
  fileName: string;
  writeTo(output: NodeJS.WritableStream): Promise<void>;
}

type ExportInput = { format: 'csv' | 'xlsx'; scope: 'view' | 'all'; viewId?: string };
type ExportField = { id: string; key: string; name: string; type: DataFieldType; sequence: number };

@Injectable()
export class BaseExportService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
    private readonly base: BaseService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async create(tableId: string, input: ExportInput): Promise<BaseExportResult> {
    const table = await this.prisma.dataTable.findFirst({
      where: {
        AND: [
          { id: tableId, archivedAt: null },
          this.dataScope.baseTables(this.principal(), 'base.read'),
        ],
      },
      include: { fields: { where: { archivedAt: null }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } },
    });
    if (!table) throw new NotFoundException('Data table not found');
    let fields: ExportField[] = table.fields;
    let viewName = '全部';
    if (input.scope === 'view') {
      if (!input.viewId) throw new BadRequestException('viewId is required for current-view export');
      const view = await this.prisma.dataView.findFirst({ where: { id: input.viewId, tableId } });
      if (!view) throw new NotFoundException('Data view not found');
      viewName = view.name;
      const config = this.object(view.config);
      const hidden = new Set(Array.isArray(config.hiddenFieldIds) ? config.hiddenFieldIds : []);
      const byId = new Map(fields.map((field) => [field.id, field]));
      const orderedIds = Array.isArray(config.fieldOrder)
        ? config.fieldOrder.filter((id): id is string => typeof id === 'string')
        : [];
      fields = [
        ...orderedIds.flatMap((id) => {
          const field = byId.get(id);
          return field && !hidden.has(id) ? [field] : [];
        }),
        ...fields.filter((field) => !orderedIds.includes(field.id) && !hidden.has(field.id)),
      ];
    }
    const fileName = `${this.safeName(table.name)}-${this.safeName(viewName)}-${this.stamp()}.${input.format}`;
    const viewId = input.scope === 'view' ? input.viewId : undefined;
    return input.format === 'csv'
      ? {
          contentType: 'text/csv; charset=utf-8',
          fileName,
          writeTo: async (output) => this.writeCsv(output, fields, tableId, viewId),
        }
      : {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName,
          writeTo: async (output) => this.writeXlsx(output, fields, tableId, viewId, table.name),
        };
  }

  private async *recordPages(tableId: string, viewId?: string) {
    let page = 1;
    let emitted = 0;
    for (;;) {
      const result = await this.base.listRecords(tableId, { ...(viewId ? { viewId } : {}), page, pageSize: 500 });
      if (!result.data.length) return;
      emitted += result.data.length;
      yield result.data as Array<{ values: Record<string, unknown> }>;
      if (emitted >= result.meta.total) return;
      page += 1;
    }
  }

  private async writeCsv(
    output: NodeJS.WritableStream,
    fields: ExportField[],
    tableId: string,
    viewId?: string,
  ) {
    output.write('\uFEFF');
    output.write(`${fields.map((field) => this.csvCell(field.name)).join(',')}\r\n`);
    for await (const records of this.recordPages(tableId, viewId)) {
      for (const record of records) {
        output.write(
          `${fields.map((field) => this.csvCell(this.csvValue(field, record.values[field.key]))).join(',')}\r\n`,
        );
      }
    }
    output.end();
  }

  private async writeXlsx(
    output: NodeJS.WritableStream,
    fields: ExportField[],
    tableId: string,
    viewId: string | undefined,
    sheetName: string,
  ) {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output as Writable });
    const worksheet = workbook.addWorksheet(this.safeName(sheetName).slice(0, 31) || '数据', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(fields.length, 1) } };
    worksheet.columns = fields.map((field) => ({ header: field.name, key: field.key, width: Math.min(Math.max(field.name.length + 4, 12), 40) }));
    worksheet.getRow(1).commit();
    for await (const records of this.recordPages(tableId, viewId)) {
      for (const record of records) {
        worksheet
          .addRow(
            Object.fromEntries(
              fields.map((field) => [field.key, this.xlsxValue(field, record.values[field.key])]),
            ),
          )
          .commit();
      }
    }
    worksheet.commit();
    await workbook.commit();
  }

  private csvValue(field: ExportField, value: unknown): string {
    if (
      value !== undefined &&
      value !== null &&
      (field.type === DataFieldType.DATETIME ||
        field.type === DataFieldType.CREATED_AT ||
        field.type === DataFieldType.UPDATED_AT)
    ) {
      const date = value instanceof Date ? value : new Date(String(value));
      if (!Number.isNaN(date.getTime())) return date.toLocaleString('zh-CN');
    }
    return this.display(value);
  }

  private xlsxValue(field: ExportField, value: unknown): string | number | boolean | Date | null {
    if (value === undefined || value === null || value === '') return null;
    if (field.type === DataFieldType.DATETIME || field.type === DataFieldType.CREATED_AT || field.type === DataFieldType.UPDATED_AT) {
      const date = value instanceof Date ? value : new Date(String(value));
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return this.display(value);
  }

  private display(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.map((entry) => this.display(entry)).join(', ');
    if (value instanceof Date) return value.toLocaleString('zh-CN');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private csvCell(value: string) {
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  private safeName(value: string) {
    return value.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim().slice(0, 80) || '数据';
  }

  private stamp() {
    const date = new Date();
    const pair = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pair(date.getMonth() + 1)}${pair(date.getDate())}-${pair(date.getHours())}${pair(date.getMinutes())}`;
  }

  private object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
}
