import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { DataImportStatus, DataTableSource, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { UploadedContentFile } from '../../content/application/files.service';
import { RelationSyncService } from '../relation-sync.service';
import { BaseFileParserService } from './base-file-parser.service';
import { ImportRowConverterService } from './import-row-converter.service';
import { ImportColumnMapping, ImportRowError, RowConversionResult } from './import.types';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 250;

@Injectable()
export class BaseImportService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
    private readonly storage: StoragePort,
    private readonly parser: BaseFileParserService,
    private readonly converter: ImportRowConverterService,
    private readonly relationSync: RelationSyncService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async upload(tableId: string, file: UploadedContentFile | undefined) {
    const table = await this.prisma.dataTable.findFirst({
      where: {
        AND: [
          { id: tableId, archivedAt: null },
          this.dataScope.baseTables(this.principal(), 'base.update'),
        ],
      },
    });
    if (!table) throw new NotFoundException('Data table not found');
    if (table.source !== DataTableSource.CUSTOM) throw new BadRequestException('Imports are only available for custom tables');
    if (!file) throw new BadRequestException('Import file is required');
    const originalName = this.safeOriginalName(file.originalname);
    const format = originalName.toLocaleLowerCase().endsWith('.xlsx') ? 'XLSX' : originalName.toLocaleLowerCase().endsWith('.csv') ? 'CSV' : null;
    if (!format) throw new BadRequestException('Only CSV and XLSX files are supported');
    const parsed = await this.parser.parse(file.buffer, originalName, file.mimetype);
    const id = randomUUID();
    const sourceStorageKey = `imports/${id}/source.${format.toLocaleLowerCase()}`;
    await this.storage.write({ key: sourceStorageKey, content: file.buffer, mimeType: file.mimetype || 'application/octet-stream' });
    try {
      const session = await this.prisma.dataImportSession.create({
        data: {
          id,
          tableId,
          originalName,
          format,
          selectedSheet: parsed.selectedSheet,
          sourceStorageKey,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      return { session: this.publicSession(session), preview: this.publicPreview(parsed) };
    } catch (error) {
      await this.storage.delete(sourceStorageKey).catch(() => undefined);
      throw error;
    }
  }

  async preview(id: string, input: { selectedSheet?: string; mapping: ImportColumnMapping[] }) {
    const session = await this.requireSession(id);
    if (session.status === DataImportStatus.IMPORTING) throw new ConflictException('Import is already running');
    if (session.status === DataImportStatus.COMPLETED || session.status === DataImportStatus.PARTIAL) {
      throw new ConflictException('Import session has already been committed');
    }
    const source = await this.storage.read(session.sourceStorageKey);
    const parsed = await this.parser.parse(source.content, session.originalName, source.mimeType, input.selectedSheet);
    const fields = await this.prisma.dataField.findMany({ where: { tableId: session.tableId, archivedAt: null } });
    this.converter.validateMapping(fields, input.mapping, parsed.columns);
    const results = await this.converter.convertRows(fields, input.mapping, parsed.rows);
    const errors = this.errors(results);
    const errorStorageKey = errors.length ? `imports/${id}/errors.csv` : null;
    if (errorStorageKey) {
      await this.storage.write({ key: errorStorageKey, content: this.errorCsv(parsed.columns, errors), mimeType: 'text/csv; charset=utf-8' });
    } else if (session.errorStorageKey) await this.storage.delete(session.errorStorageKey).catch(() => undefined);
    const updated = await this.prisma.dataImportSession.update({
      where: { id },
      data: {
        selectedSheet: parsed.selectedSheet,
        status: DataImportStatus.PREVIEWED,
        mapping: input.mapping as unknown as Prisma.InputJsonValue,
        previewFingerprint: this.fingerprint(parsed.selectedSheet, input.mapping),
        totalRows: parsed.rows.length,
        validRows: results.length - errors.length,
        errorRows: errors.length,
        importedRows: 0,
        errorStorageKey,
      },
    });
    return {
      session: this.publicSession(updated),
      errors: errors.slice(0, 100),
      preview: this.publicPreview(parsed),
    };
  }

  async inspect(id: string, selectedSheet: string) {
    const session = await this.requireSession(id);
    if (session.status === DataImportStatus.IMPORTING) {
      throw new ConflictException('Import is already running');
    }
    if (session.status === DataImportStatus.COMPLETED || session.status === DataImportStatus.PARTIAL) {
      throw new ConflictException('Import session has already been committed');
    }
    const source = await this.storage.read(session.sourceStorageKey);
    const parsed = await this.parser.parse(
      source.content,
      session.originalName,
      source.mimeType,
      selectedSheet,
    );
    return this.publicPreview(parsed);
  }

  async commit(id: string) {
    const session = await this.requireSession(id);
    if (session.status === DataImportStatus.COMPLETED || session.status === DataImportStatus.PARTIAL) return this.publicSession(session);
    if (session.status === DataImportStatus.IMPORTING) throw new ConflictException('Import is already running');
    if (session.status !== DataImportStatus.PREVIEWED) throw new BadRequestException('A full preview is required before commit');
    const mapping = session.mapping as unknown as ImportColumnMapping[];
    if (session.previewFingerprint !== this.fingerprint(session.selectedSheet ?? '', mapping)) {
      throw new BadRequestException('Mapping changed after preview');
    }
    const claimed = await this.prisma.dataImportSession.updateMany({
      where: { id, status: DataImportStatus.PREVIEWED },
      data: { status: DataImportStatus.IMPORTING },
    });
    if (claimed.count !== 1) throw new ConflictException('Import session could not be claimed');
    try {
      const source = await this.storage.read(session.sourceStorageKey);
      const parsed = await this.parser.parse(
        source.content,
        session.originalName,
        source.mimeType,
        session.selectedSheet ?? undefined,
      );
      const initialFields = await this.prisma.dataField.findMany({
        where: { tableId: session.tableId, archivedAt: null },
      });
      const results = await this.converter.convertRows(initialFields, mapping, parsed.rows);
      const valid = results.filter(
        (result): result is Extract<RowConversionResult, { ok: true }> => result.ok,
      );
      const failures = this.errors(results);
      let importedRows = 0;
      for (let offset = 0; offset < valid.length; offset += BATCH_SIZE) {
        const batch = valid.slice(offset, offset + BATCH_SIZE);
        try {
          await this.prisma.$transaction(async (tx) => {
            await this.relationSync.lockTableConfigs(tx, await this.relationSync.relationTableIds(tx, session.tableId));
            if (offset === 0) await this.createMappedFields(tx, session.tableId, mapping, parsed.rows);
            for (const row of batch) {
              await this.relationSync.validateRelationValues(tx, session.tableId, row.values);
              const created = await tx.dataRecord.create({
                data: { tableId: session.tableId, values: row.values as Prisma.InputJsonValue },
              });
              await this.relationSync.syncRecord(tx, session.tableId, created.id, {}, row.values);
            }
          });
          importedRows += batch.length;
        } catch {
          for (const row of valid.slice(offset)) {
            failures.push({ rowNumber: row.rowNumber, fields: [], message: 'Database batch failed; row was not written', source: parsed.rows.find((item) => item.rowNumber === row.rowNumber)?.values ?? {} });
          }
          break;
        }
      }
      const status = failures.length ? (importedRows ? DataImportStatus.PARTIAL : DataImportStatus.FAILED) : DataImportStatus.COMPLETED;
      const errorStorageKey = failures.length ? `imports/${id}/errors.csv` : null;
      if (errorStorageKey) await this.storage.write({ key: errorStorageKey, content: this.errorCsv(parsed.columns, failures), mimeType: 'text/csv; charset=utf-8' });
      const updated = await this.prisma.dataImportSession.update({
        where: { id },
        data: { status, importedRows, validRows: importedRows, errorRows: failures.length, errorStorageKey },
      });
      return this.publicSession(updated);
    } catch (error) {
      await this.prisma.dataImportSession
        .update({ where: { id }, data: { status: DataImportStatus.FAILED } })
        .catch(() => undefined);
      throw error;
    }
  }

  async get(id: string) {
    return this.publicSession(await this.requireSession(id));
  }

  async errorFile(id: string) {
    const session = await this.requireSession(id);
    if (!session.errorStorageKey) throw new NotFoundException('Import has no error rows');
    const file = await this.storage.read(session.errorStorageKey);
    return { fileName: `${this.safeDownloadName(session.originalName)}-错误行.csv`, ...file };
  }

  async remove(id: string) {
    const session = await this.requireSession(id);
    if (session.status === DataImportStatus.IMPORTING) throw new ConflictException('Running imports cannot be deleted');
    await Promise.all([
      this.storage.delete(session.sourceStorageKey).catch(() => undefined),
      session.errorStorageKey ? this.storage.delete(session.errorStorageKey).catch(() => undefined) : Promise.resolve(),
    ]);
    await this.prisma.dataImportSession.update({ where: { id }, data: { status: DataImportStatus.EXPIRED, errorStorageKey: null } });
  }

  async cleanupExpired() {
    const sessions = await this.prisma.dataImportSession.findMany({
      where: { expiresAt: { lte: new Date() }, status: { not: DataImportStatus.IMPORTING } },
    });
    for (const session of sessions) {
      await Promise.all([
        this.storage.delete(session.sourceStorageKey).catch(() => undefined),
        session.errorStorageKey
          ? this.storage.delete(session.errorStorageKey).catch(() => undefined)
          : Promise.resolve(),
      ]);
      await this.prisma.dataImportSession.update({
        where: { id: session.id },
        data: { status: DataImportStatus.EXPIRED, errorStorageKey: null },
      });
    }
    return sessions.length;
  }

  private async createMappedFields(
    tx: Prisma.TransactionClient,
    tableId: string,
    mappings: ImportColumnMapping[],
    rows: Array<{ values: Record<string, unknown> }>,
  ) {
    const max = await tx.dataField.aggregate({ where: { tableId, archivedAt: null }, _max: { sequence: true } });
    let sequence = (max._max.sequence ?? 0) + 1;
    for (const mapping of mappings) {
      if (!mapping.newField) continue;
      const config =
        mapping.newField.type === 'SINGLE_SELECT' || mapping.newField.type === 'MULTI_SELECT'
          ? {
              options: [...new Set(rows.flatMap((row) => String(row.values[mapping.sourceColumn] ?? '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)))].map((value) => ({ label: value, value, color: 'blue' })),
            }
          : {};
      await tx.dataField.create({
        data: { tableId, ...mapping.newField, sequence, config: config as Prisma.InputJsonValue },
      });
      sequence += 1;
    }
  }

  private async requireSession(id: string) {
    const session = await this.prisma.dataImportSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Import session not found');
    if (session.status === DataImportStatus.EXPIRED || session.expiresAt <= new Date()) {
      throw new GoneException('Import session has expired');
    }
    await this.assertReadableTable(session.tableId);
    return session;
  }

  private async assertReadableTable(tableId: string) {
    const table = await this.prisma.dataTable.findFirst({
      where: {
        AND: [
          { id: tableId, archivedAt: null },
          this.dataScope.baseTables(this.principal(), 'base.update'),
        ],
      },
    });
    if (!table) throw new NotFoundException('Data table not found');
    return table;
  }

  private publicSession<T extends Record<string, unknown>>(
    session: T,
  ): Omit<T, 'sourceStorageKey' | 'errorStorageKey' | 'mapping' | 'previewFingerprint'> & {
    hasErrors: boolean;
  } {
    const safe = Object.fromEntries(
      Object.entries(session).filter(
        ([key]) =>
          key !== 'sourceStorageKey' &&
          key !== 'errorStorageKey' &&
          key !== 'mapping' &&
          key !== 'previewFingerprint',
      ),
    ) as Omit<T, 'sourceStorageKey' | 'errorStorageKey' | 'mapping' | 'previewFingerprint'>;
    return { ...safe, hasErrors: Boolean(session.errorStorageKey) };
  }

  private publicPreview(parsed: { sheetNames: string[]; selectedSheet: string; columns: string[]; inferredTypes: Record<string, unknown>; rows: unknown[] }) {
    return { ...parsed, rows: parsed.rows.slice(0, 100) };
  }

  private errors(results: RowConversionResult[]): ImportRowError[] {
    return results.flatMap((result) => (result.ok ? [] : [result]));
  }

  private errorCsv(columns: string[], errors: ImportRowError[]) {
    const headers = [...columns, '__row_number', '__error_fields', '__error_message'];
    const line = (values: unknown[]) => values.map((value) => this.csvCell(String(value ?? ''))).join(',');
    return Buffer.from(`\uFEFF${line(headers)}\r\n${errors.map((error) => line([...columns.map((column) => error.source[column]), error.rowNumber, error.fields.join('|'), error.message])).join('\r\n')}\r\n`);
  }

  private csvCell(value: string) {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  private fingerprint(sheet: string, mapping: ImportColumnMapping[]) {
    return createHash('sha256').update(JSON.stringify({ sheet, mapping })).digest('hex');
  }

  private safeOriginalName(name: string) {
    return basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001F]/g, '').slice(0, 240) || 'import.csv';
  }

  private safeDownloadName(name: string) {
    return name.replace(/\.(csv|xlsx)$/i, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '导入';
  }
}
