import { Injectable } from '@nestjs/common';
import { DataField, DataFieldType, DataTableSource, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { SystemRecordsAdapter } from './adapters/system-records.adapter';
import { ComputedFieldError, UnifiedDataRecord } from './domain/base.types';
import { evaluateFormula } from './domain/formula-evaluator';
import { FormulaAst } from './domain/formula.types';

const COMPUTED_TYPES = new Set<DataFieldType>([
  DataFieldType.LOOKUP,
  DataFieldType.ROLLUP,
  DataFieldType.FORMULA,
]);

type Values = Record<string, unknown>;
type ComputedField = Pick<DataField, 'id' | 'key' | 'name' | 'type' | 'config' | 'sequence'>;

interface RelationConfig {
  targetTableId: string;
  multiple: boolean;
}

interface LookupConfig {
  relationFieldId: string;
  targetFieldId: string;
}

interface RollupConfig {
  relationFieldId: string;
  targetFieldId?: string;
  aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
}

interface FormulaConfig {
  dependencies: string[];
  ast: FormulaAst;
}

interface TargetContext {
  recordsByTable: Map<string, Map<string, UnifiedDataRecord>>;
  fieldsById: Map<string, DataField>;
  activeTableIds: Set<string>;
}

@Injectable()
export class ComputedFieldResolver {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly systemRecords: SystemRecordsAdapter,
  ) {}

  async resolve(
    tableId: string,
    records: readonly UnifiedDataRecord[],
  ): Promise<UnifiedDataRecord[]> {
    if (records.length === 0) return [];
    const table = await this.prisma.dataTable.findFirst({
      where: { id: tableId, archivedAt: null },
    });
    if (!table || table.source !== DataTableSource.CUSTOM)
      return records.map((record) => ({ ...record }));

    const fields = await this.prisma.dataField.findMany({
      where: { tableId, archivedAt: null },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
    const computedFields = fields.filter((field) => COMPUTED_TYPES.has(field.type));
    if (computedFields.length === 0) return records.map((record) => this.copyRecord(record));

    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    const targetContext = await this.loadTargets(records, computedFields, fieldsById);
    return records.map((record) =>
      this.resolveRecord(record, fields, computedFields, fieldsById, targetContext),
    );
  }

  private async loadTargets(
    records: readonly UnifiedDataRecord[],
    computedFields: readonly ComputedField[],
    sourceFieldsById: ReadonlyMap<string, DataField>,
  ): Promise<TargetContext> {
    const idsByTable = new Map<string, Set<string>>();
    for (const field of computedFields) {
      if (field.type !== DataFieldType.LOOKUP && field.type !== DataFieldType.ROLLUP) continue;
      const config =
        field.type === DataFieldType.LOOKUP
          ? this.lookupConfig(field.config)
          : this.rollupConfig(field.config);
      if (!config) continue;
      const relation = sourceFieldsById.get(config.relationFieldId);
      const relationConfig = relation ? this.relationConfig(relation.config) : undefined;
      if (!relation || relation.type !== DataFieldType.RELATION || !relationConfig) continue;
      const ids = idsByTable.get(relationConfig.targetTableId) ?? new Set<string>();
      for (const record of records) {
        for (const id of this.relationIds(record.values[relation.key])) ids.add(id);
      }
      idsByTable.set(relationConfig.targetTableId, ids);
    }

    const targetTableIds = [...idsByTable.keys()].sort();
    if (targetTableIds.length === 0) {
      return { recordsByTable: new Map(), fieldsById: new Map(), activeTableIds: new Set() };
    }
    const [tables, targetFields] = await Promise.all([
      this.prisma.dataTable.findMany({
        where: { id: { in: targetTableIds }, archivedAt: null },
      }),
      this.prisma.dataField.findMany({
        where: { tableId: { in: targetTableIds }, archivedAt: null },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const tablesById = new Map(tables.map((table) => [table.id, table]));
    const targetFieldsByTable = new Map<string, DataField[]>();
    for (const field of targetFields) {
      const values = targetFieldsByTable.get(field.tableId) ?? [];
      values.push(field);
      targetFieldsByTable.set(field.tableId, values);
    }

    const recordsByTable = new Map<string, Map<string, UnifiedDataRecord>>();
    for (const targetTableId of targetTableIds) {
      const table = tablesById.get(targetTableId);
      const ids = [...(idsByTable.get(targetTableId) ?? [])].sort();
      if (!table || ids.length === 0) {
        recordsByTable.set(targetTableId, new Map());
        continue;
      }
      let loaded: UnifiedDataRecord[];
      if (table.source === DataTableSource.CUSTOM) {
        const stored = await this.prisma.dataRecord.findMany({
          where: { tableId: targetTableId, id: { in: ids } },
        });
        loaded = stored.map((record) =>
          this.toCustomTargetRecord(record, targetFieldsByTable.get(targetTableId) ?? []),
        );
      } else {
        loaded = await this.systemRecords.findByIds(table.source, ids);
      }
      recordsByTable.set(targetTableId, new Map(loaded.map((record) => [record.id, record])));
    }
    return {
      recordsByTable,
      fieldsById: new Map(targetFields.map((field) => [field.id, field])),
      activeTableIds: new Set(tables.map((table) => table.id)),
    };
  }

  private resolveRecord(
    record: UnifiedDataRecord,
    fields: readonly DataField[],
    computedFields: readonly ComputedField[],
    fieldsById: ReadonlyMap<string, DataField>,
    targets: TargetContext,
  ): UnifiedDataRecord {
    const resolved = this.copyRecord(record);
    const errors: Record<string, ComputedFieldError> = {};
    const valuesByFieldId: Values = {};
    for (const field of fields) valuesByFieldId[field.id] = resolved.values[field.key] ?? null;

    for (const field of computedFields) {
      if (field.type !== DataFieldType.LOOKUP && field.type !== DataFieldType.ROLLUP) continue;
      const result = this.resolveRelatedField(field, resolved.values, fieldsById, targets);
      resolved.values[field.key] = result.value;
      valuesByFieldId[field.id] = result.value;
      if (result.error) errors[field.key] = result.error;
    }

    const formulasById = new Map(
      computedFields
        .filter((field) => field.type === DataFieldType.FORMULA)
        .map((field) => [field.id, field]),
    );
    const states = new Map<string, 'VISITING' | 'DONE'>();
    const cycleIds = new Set<string>();
    const stack: string[] = [];
    const evaluateField = (fieldId: string): void => {
      if (states.get(fieldId) === 'DONE') return;
      if (states.get(fieldId) === 'VISITING') {
        const start = Math.max(0, stack.indexOf(fieldId));
        for (const id of stack.slice(start)) cycleIds.add(id);
        cycleIds.add(fieldId);
        return;
      }
      const field = formulasById.get(fieldId);
      if (!field) return;
      states.set(fieldId, 'VISITING');
      stack.push(fieldId);
      const config = this.formulaConfig(field.config);
      if (config) {
        for (const dependencyId of config.dependencies) {
          if (formulasById.has(dependencyId)) evaluateField(dependencyId);
        }
      }
      stack.pop();

      if (cycleIds.has(fieldId)) {
        resolved.values[field.key] = null;
        valuesByFieldId[field.id] = null;
        errors[field.key] = {
          code: 'CYCLE',
          message: `Circular formula dependency detected for ${field.name}`,
        };
        states.set(fieldId, 'DONE');
        return;
      }
      if (!config) {
        resolved.values[field.key] = null;
        valuesByFieldId[field.id] = null;
        errors[field.key] = {
          code: 'INVALID_FORMULA',
          message: `Stored formula configuration for ${field.name} is invalid`,
        };
        states.set(fieldId, 'DONE');
        return;
      }
      const missingDependency = config.dependencies.find(
        (dependencyId) => !fieldsById.has(dependencyId),
      );
      if (missingDependency) {
        resolved.values[field.key] = null;
        valuesByFieldId[field.id] = null;
        errors[field.key] = {
          code: 'INVALID_FORMULA',
          message: `Formula ${field.name} references a missing or archived field`,
        };
        states.set(fieldId, 'DONE');
        return;
      }
      const dependencyCycle = config.dependencies.find((id) => cycleIds.has(id));
      if (dependencyCycle) {
        resolved.values[field.key] = null;
        valuesByFieldId[field.id] = null;
        errors[field.key] = {
          code: 'CYCLE',
          message: `Formula ${field.name} depends on a circular formula`,
        };
        states.set(fieldId, 'DONE');
        return;
      }
      const result = evaluateFormula(config.ast, valuesByFieldId);
      resolved.values[field.key] = result.value;
      valuesByFieldId[field.id] = result.value;
      if (result.error) errors[field.key] = result.error;
      states.set(fieldId, 'DONE');
    };
    for (const field of formulasById.values()) evaluateField(field.id);

    if (Object.keys(errors).length > 0) resolved.computedErrors = errors;
    else delete resolved.computedErrors;
    return resolved;
  }

  private resolveRelatedField(
    field: ComputedField,
    values: Values,
    fieldsById: ReadonlyMap<string, DataField>,
    targets: TargetContext,
  ): { value: unknown; error?: ComputedFieldError } {
    const config =
      field.type === DataFieldType.LOOKUP
        ? this.lookupConfig(field.config)
        : this.rollupConfig(field.config);
    if (!config) return this.relatedConfigError(field);
    const relation = fieldsById.get(config.relationFieldId);
    const relationConfig = relation ? this.relationConfig(relation.config) : undefined;
    if (!relation || relation.type !== DataFieldType.RELATION || !relationConfig) {
      return this.relatedConfigError(field);
    }
    if (!targets.activeTableIds.has(relationConfig.targetTableId)) {
      return this.relatedConfigError(field);
    }
    const ids = this.relationIds(values[relation.key]);
    const recordsById = targets.recordsByTable.get(relationConfig.targetTableId) ?? new Map();
    const related = ids.map((id) => recordsById.get(id));
    const missing = related.some((record) => !record);
    const missingError: ComputedFieldError | undefined = missing
      ? {
          code: 'MISSING_TARGET',
          message: `One or more related records for ${field.name} are missing or archived`,
        }
      : undefined;

    if (field.type === DataFieldType.LOOKUP) {
      const lookup = config as LookupConfig;
      const targetField = targets.fieldsById.get(lookup.targetFieldId);
      if (!targetField || targetField.tableId !== relationConfig.targetTableId) {
        return this.relatedConfigError(field);
      }
      const lookedUp = related.map((target) => target?.values[targetField.key] ?? null);
      return {
        value: relationConfig.multiple ? lookedUp : (lookedUp[0] ?? null),
        ...(missingError ? { error: missingError } : {}),
      };
    }

    const rollup = config as RollupConfig;
    const validRecords = related.filter((target): target is UnifiedDataRecord => !!target);
    if (rollup.aggregation === 'COUNT') {
      return { value: validRecords.length, ...(missingError ? { error: missingError } : {}) };
    }
    const targetField = rollup.targetFieldId
      ? targets.fieldsById.get(rollup.targetFieldId)
      : undefined;
    if (!targetField || targetField.tableId !== relationConfig.targetTableId) {
      return this.relatedConfigError(field);
    }
    const present = validRecords
      .map((target) => target.values[targetField.key])
      .filter((value) => value !== null && value !== undefined);
    if (present.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return {
        value: null,
        error: { code: 'TYPE_ERROR', message: `${field.name} can only aggregate finite numbers` },
      };
    }
    const numbers = present as number[];
    if (numbers.length === 0) {
      return {
        value: rollup.aggregation === 'SUM' ? 0 : null,
        ...(missingError ? { error: missingError } : {}),
      };
    }
    let value: number;
    if (rollup.aggregation === 'SUM') value = numbers.reduce((sum, item) => sum + item, 0);
    else if (rollup.aggregation === 'AVG')
      value = numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
    else if (rollup.aggregation === 'MIN') value = Math.min(...numbers);
    else value = Math.max(...numbers);
    return { value, ...(missingError ? { error: missingError } : {}) };
  }

  private relatedConfigError(field: ComputedField): {
    value: null;
    error: ComputedFieldError;
  } {
    return {
      value: null,
      error: {
        code: 'MISSING_TARGET',
        message: `Stored relation configuration for ${field.name} has a missing target`,
      },
    };
  }

  private relationConfig(config: Prisma.JsonValue): RelationConfig | undefined {
    const value = this.jsonRecord(config);
    return typeof value?.targetTableId === 'string' && typeof value.multiple === 'boolean'
      ? { targetTableId: value.targetTableId, multiple: value.multiple }
      : undefined;
  }

  private lookupConfig(config: Prisma.JsonValue): LookupConfig | undefined {
    const value = this.jsonRecord(config);
    return typeof value?.relationFieldId === 'string' && typeof value.targetFieldId === 'string'
      ? { relationFieldId: value.relationFieldId, targetFieldId: value.targetFieldId }
      : undefined;
  }

  private rollupConfig(config: Prisma.JsonValue): RollupConfig | undefined {
    const value = this.jsonRecord(config);
    const aggregation = value?.aggregation;
    if (
      typeof value?.relationFieldId !== 'string' ||
      (aggregation !== 'COUNT' &&
        aggregation !== 'SUM' &&
        aggregation !== 'AVG' &&
        aggregation !== 'MIN' &&
        aggregation !== 'MAX') ||
      (aggregation !== 'COUNT' && typeof value.targetFieldId !== 'string')
    ) {
      return undefined;
    }
    return {
      relationFieldId: value.relationFieldId,
      ...(typeof value.targetFieldId === 'string' ? { targetFieldId: value.targetFieldId } : {}),
      aggregation,
    };
  }

  private formulaConfig(config: Prisma.JsonValue): FormulaConfig | undefined {
    const value = this.jsonRecord(config);
    if (
      value?.astVersion !== 1 ||
      !Array.isArray(value.dependencies) ||
      value.dependencies.some((dependency) => typeof dependency !== 'string') ||
      !value.ast ||
      typeof value.ast !== 'object' ||
      Array.isArray(value.ast)
    ) {
      return undefined;
    }
    return {
      dependencies: [
        ...new Set([...(value.dependencies as string[]), ...this.formulaReferences(value.ast)]),
      ],
      ast: value.ast as unknown as FormulaAst,
    };
  }

  private formulaReferences(ast: unknown): string[] {
    const references: string[] = [];
    const pending: unknown[] = [ast];
    const visited = new Set<object>();
    let inspected = 0;
    while (pending.length > 0 && inspected <= 256) {
      const node = pending.pop();
      if (!node || typeof node !== 'object' || Array.isArray(node) || visited.has(node)) continue;
      visited.add(node);
      inspected += 1;
      const value = node as Record<string, unknown>;
      if (value.kind === 'field' && typeof value.fieldId === 'string') {
        references.push(value.fieldId);
      }
      if (value.operand) pending.push(value.operand);
      if (value.left) pending.push(value.left);
      if (value.right) pending.push(value.right);
      if (Array.isArray(value.args)) pending.push(...value.args);
    }
    return references;
  }

  private relationIds(value: unknown): string[] {
    if (typeof value === 'string' && value.length > 0) return [value];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  private jsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private copyRecord(record: UnifiedDataRecord): UnifiedDataRecord {
    return {
      ...record,
      values: { ...record.values },
      ...(record.computedErrors ? { computedErrors: { ...record.computedErrors } } : {}),
    };
  }

  private toCustomTargetRecord(
    record: {
      id: string;
      tableId: string;
      values: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    },
    fields: readonly DataField[],
  ): UnifiedDataRecord {
    const generated = Object.fromEntries(
      fields.flatMap((field) => {
        if (field.type === DataFieldType.CREATED_AT) return [[field.key, record.createdAt]];
        if (field.type === DataFieldType.UPDATED_AT) return [[field.key, record.updatedAt]];
        return [];
      }),
    );
    return {
      id: record.id,
      values: { ...(record.values as Values), ...generated },
      sourceType: 'CUSTOM',
      sourceId: record.id,
      sourcePath: `/base?tableId=${record.tableId}&recordId=${record.id}`,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
