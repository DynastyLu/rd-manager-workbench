import { BadRequestException, Injectable } from '@nestjs/common';
import { DataFieldType, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import {
  ImportColumnMapping,
  ParsedImportRow,
  RowConversionResult,
} from './import.types';

export interface ImportField {
  id: string;
  key: string;
  name: string;
  type: DataFieldType;
  config: Prisma.JsonValue | Record<string, unknown>;
  isPrimary: boolean;
  isRequired: boolean;
}

const NON_WRITABLE = new Set<DataFieldType>([
  DataFieldType.ATTACHMENT,
  DataFieldType.LOOKUP,
  DataFieldType.ROLLUP,
  DataFieldType.FORMULA,
  DataFieldType.CREATED_AT,
  DataFieldType.UPDATED_AT,
]);

@Injectable()
export class ImportRowConverterService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  validateMapping(
    fields: readonly ImportField[],
    mappings: readonly ImportColumnMapping[],
    sourceColumns: readonly string[],
  ): void {
    const sources = new Set<string>();
    const targets = new Set<string>();
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    for (const mapping of mappings) {
      if (!sourceColumns.includes(mapping.sourceColumn)) {
        throw new BadRequestException(`Unknown source column: ${mapping.sourceColumn}`);
      }
      if (sources.has(mapping.sourceColumn)) {
        throw new BadRequestException(`Source column ${mapping.sourceColumn} is mapped more than once`);
      }
      sources.add(mapping.sourceColumn);
      const modes = Number(Boolean(mapping.targetFieldId)) + Number(Boolean(mapping.newField)) + Number(Boolean(mapping.ignored));
      if (modes !== 1) throw new BadRequestException(`Mapping ${mapping.sourceColumn} must choose exactly one action`);
      if (mapping.targetFieldId) {
        const field = fieldById.get(mapping.targetFieldId);
        if (!field) throw new BadRequestException(`Unknown target field: ${mapping.targetFieldId}`);
        if (NON_WRITABLE.has(field.type)) throw new BadRequestException(`Field ${field.name} is not writable`);
        if (targets.has(field.id)) throw new BadRequestException(`Target field ${field.name} is mapped more than once`);
        targets.add(field.id);
      }
      if (mapping.newField) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(mapping.newField.key)) throw new BadRequestException('New field key is invalid');
        if (!mapping.newField.name.trim()) throw new BadRequestException('New field name is required');
        if (fields.some((field) => field.key === mapping.newField!.key)) throw new BadRequestException(`Field key already exists: ${mapping.newField.key}`);
      }
    }
    const primary = fields.find((field) => field.isPrimary);
    if (!primary || !targets.has(primary.id)) throw new BadRequestException('The required primary field must be mapped');
  }

  async convertRows(
    fields: readonly ImportField[],
    mappings: readonly ImportColumnMapping[],
    rows: readonly ParsedImportRow[],
  ): Promise<RowConversionResult[]> {
    this.validateMapping(fields, mappings, rows[0] ? Object.keys(rows[0].values) : mappings.map((item) => item.sourceColumn));
    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    const relationIndexes = await this.relationIndexes(fields, mappings, fieldsById);
    const newSelectConfigs = new Map(
      mappings.flatMap((mapping) => {
        if (
          !mapping.newField ||
          (mapping.newField.type !== DataFieldType.SINGLE_SELECT &&
            mapping.newField.type !== DataFieldType.MULTI_SELECT)
        ) {
          return [];
        }
        const values = [
          ...new Set(
            rows.flatMap((row) =>
              String(row.values[mapping.sourceColumn] ?? '')
                .split(/[,，\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
            ),
          ),
        ];
        return [[mapping.newField.key, { options: values.map((value) => ({ label: value, value })) }] as const];
      }),
    );
    return rows.map((row) => {
      const converted: Record<string, unknown> = {};
      const errors: Array<{ source: string; message: string }> = [];
      for (const mapping of mappings) {
        if (mapping.ignored) continue;
        const field = mapping.targetFieldId ? fieldsById.get(mapping.targetFieldId)! : {
          id: `new:${mapping.newField!.key}`,
          key: mapping.newField!.key,
          name: mapping.newField!.name,
          type: mapping.newField!.type,
          config: newSelectConfigs.get(mapping.newField!.key) ?? {},
          isPrimary: false,
          isRequired: false,
        };
        try {
          converted[field.key] = this.convertValue(
            row.values[mapping.sourceColumn],
            field,
            relationIndexes.get(field.id),
          );
        } catch (error) {
          errors.push({ source: mapping.sourceColumn, message: (error as Error).message });
        }
      }
      if (errors.length) {
        return {
          ok: false as const,
          rowNumber: row.rowNumber,
          fields: errors.map((error) => error.source),
          message: errors.map((error) => error.message).join('; '),
          source: row.values,
        };
      }
      return { ok: true as const, rowNumber: row.rowNumber, values: converted };
    });
  }

  private async relationIndexes(
    fields: readonly ImportField[],
    mappings: readonly ImportColumnMapping[],
    fieldsById: Map<string, ImportField>,
  ) {
    const result = new Map<string, Map<string, string[]>>();
    for (const mapping of mappings) {
      if (!mapping.targetFieldId) continue;
      const field = fieldsById.get(mapping.targetFieldId)!;
      if (field.type !== DataFieldType.RELATION) continue;
      const config = this.object(field.config);
      if (typeof config.targetTableId !== 'string') throw new BadRequestException(`Relation ${field.name} is not configured`);
      const primary = await this.prisma.dataField.findFirst({
        where: { tableId: config.targetTableId, isPrimary: true, archivedAt: null },
      });
      if (!primary) throw new BadRequestException(`Relation ${field.name} target has no primary field`);
      const records = await this.prisma.dataRecord.findMany({ where: { tableId: config.targetTableId } });
      const index = new Map<string, string[]>();
      for (const record of records) {
        const label = String(this.object(record.values)[primary.key] ?? '').trim();
        if (!label) continue;
        index.set(label, [...(index.get(label) ?? []), record.id]);
      }
      result.set(field.id, index);
    }
    return result;
  }

  private convertValue(value: unknown, field: ImportField, relations?: Map<string, string[]>): unknown {
    const blank = value === null || value === undefined || String(value).trim() === '';
    if (blank) {
      if (field.isRequired) throw new Error(`${field.name} is required`);
      return null;
    }
    const text = String(value).trim();
    switch (field.type) {
      case DataFieldType.NUMBER: {
        if (!/^[-+]?\d+(\.\d+)?$/.test(text)) throw new Error(`${field.name} must be a decimal number`);
        return Number(text);
      }
      case DataFieldType.DATETIME: {
        const date = value instanceof Date ? value : new Date(text);
        if (Number.isNaN(date.getTime())) throw new Error(`${field.name} must be a date`);
        return date.toISOString();
      }
      case DataFieldType.CHECKBOX:
        if (/^(true|是|1)$/i.test(text)) return true;
        if (/^(false|否|0)$/i.test(text)) return false;
        throw new Error(`${field.name} must be true/false, 是/否 or 1/0`);
      case DataFieldType.MULTI_SELECT:
        return this.selectValues(text.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean), field);
      case DataFieldType.SINGLE_SELECT:
        return this.selectValues([text], field)[0];
      case DataFieldType.RELATION: {
        const config = this.object(field.config);
        const labels = config.multiple ? text.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) : [text];
        const ids = labels.map((label) => {
          const matches = relations?.get(label) ?? [];
          if (matches.length !== 1) throw new Error(`${field.name} relation '${label}' must match exactly one record`);
          return matches[0]!;
        });
        return config.multiple ? ids : ids[0];
      }
      default:
        return value instanceof Date ? value.toISOString() : text;
    }
  }

  private selectValues(values: string[], field: ImportField): string[] {
    const options = this.object(field.config).options;
    const pairs = Array.isArray(options)
      ? options.flatMap((entry) => {
          const option = this.object(entry);
          return typeof option.value === 'string'
            ? [[String(option.value), String(option.label ?? option.value)] as const]
            : [];
        })
      : [];
    const normalized = values.map((value) => {
      const match = pairs.find(([optionValue, label]) => value === optionValue || value === label);
      if (!match) throw new Error(`${field.name} contains an unknown option: ${value}`);
      return match[0];
    });
    return [...new Set(normalized)];
  }

  private object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
