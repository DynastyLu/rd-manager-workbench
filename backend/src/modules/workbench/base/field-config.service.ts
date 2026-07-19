import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataFieldType, DataTableSource, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { evaluateFormula } from './domain/formula-evaluator';
import { FormulaParseError, parseFormula } from './domain/formula-parser';
import { CreateFieldDto, FormulaPreviewDto, UpdateFieldDto } from './dto/base.dto';

const COMPUTED_TYPES = new Set<DataFieldType>([
  DataFieldType.LOOKUP,
  DataFieldType.ROLLUP,
  DataFieldType.FORMULA,
]);
const FORBIDDEN_LOOKUP_TYPES = COMPUTED_TYPES;
const ROLLUP_AGGREGATIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const NEW_FIELD_ID = '__new_field__';

type StoredField = {
  id: string;
  tableId: string;
  key: string;
  name: string;
  type: DataFieldType;
  config: Prisma.JsonValue;
  isPrimary: boolean;
  isRequired: boolean;
};

@Injectable()
export class FieldConfigService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async normalizeCreate(tableId: string, dto: CreateFieldDto): Promise<CreateFieldDto> {
    const existing = await this.prisma.dataField.findFirst({
      where: { tableId, key: dto.key },
    });
    this.assertComputedFlags(dto.type, dto.isPrimary, dto.isRequired);
    const config = await this.normalizeConfig(
      tableId,
      dto.type,
      dto.config,
      { id: existing?.id ?? NEW_FIELD_ID, key: dto.key },
      true,
      dto,
    );
    return {
      ...dto,
      config,
      ...(COMPUTED_TYPES.has(dto.type) ? { isPrimary: false, isRequired: false } : {}),
      ...(dto.type === DataFieldType.RELATION && dto.config?.relationMode === 'TWO_WAY'
        ? {
            inverseFieldName:
              dto.inverseFieldName ?? this.optionalString(dto.config.inverseFieldName),
            inverseMultiple:
              dto.inverseMultiple ??
              (typeof dto.config.inverseMultiple === 'boolean' ? dto.config.inverseMultiple : true),
          }
        : {}),
    };
  }

  async normalizeUpdate(field: StoredField, dto: UpdateFieldDto): Promise<UpdateFieldDto> {
    if ('key' in dto) throw new BadRequestException('Field key cannot be changed');
    const type = dto.type ?? field.type;
    const isPrimary = dto.isPrimary ?? field.isPrimary;
    const isRequired = dto.isRequired ?? field.isRequired;
    this.assertComputedFlags(type, isPrimary, isRequired);
    const configInput = dto.config ?? (dto.type && dto.type !== field.type ? {} : field.config);
    const config = await this.normalizeConfig(
      field.tableId,
      type,
      configInput,
      { id: field.id, key: field.key },
      false,
      dto,
      field.type === DataFieldType.RELATION ? field.config : undefined,
    );
    return {
      ...dto,
      type,
      config,
      ...(COMPUTED_TYPES.has(type) ? { isPrimary: false, isRequired: false } : {}),
    };
  }

  async previewFormula(tableId: string, dto: FormulaPreviewDto) {
    const table = await this.prisma.dataTable.findFirst({
      where: { id: tableId, archivedAt: null },
    });
    if (!table) throw new NotFoundException('Data table not found');
    const fields = await this.activeFields(tableId);
    const parsed = this.parse(dto.expression, fields);
    let rawValues: Record<string, unknown> = {};
    if (dto.recordId) {
      const record = await this.prisma.dataRecord.findFirst({
        where: { id: dto.recordId, tableId },
      });
      if (!record) throw new NotFoundException('Data record not found');
      rawValues = this.jsonRecord(record.values);
    }
    const values = Object.fromEntries(
      fields.map((field) => [field.id, rawValues[field.key] ?? null]),
    );
    const result = evaluateFormula(parsed.ast, values);
    return {
      ...parsed,
      dependencyFields: parsed.dependencies.map((id) => {
        const field = fields.find((item) => item.id === id);
        return field
          ? { id: field.id, key: field.key, name: field.name, type: field.type }
          : { id };
      }),
      ...result,
    };
  }

  private async normalizeConfig(
    tableId: string,
    type: DataFieldType,
    input: unknown,
    proposedField: { id: string; key: string },
    isCreate: boolean,
    request: CreateFieldDto | UpdateFieldDto,
    trustedRelationConfig?: Prisma.JsonValue,
  ): Promise<Record<string, Prisma.JsonValue>> {
    const config = this.jsonRecord(input ?? {});
    if (type === DataFieldType.RELATION) {
      return this.normalizeRelation(config, tableId, isCreate, request, trustedRelationConfig);
    }
    if (type === DataFieldType.LOOKUP) return this.normalizeLookup(config, tableId);
    if (type === DataFieldType.ROLLUP) return this.normalizeRollup(config, tableId);
    if (type === DataFieldType.FORMULA) {
      return this.normalizeFormula(config, tableId, proposedField);
    }
    return config as Record<string, Prisma.JsonValue>;
  }

  private async normalizeRelation(
    config: Record<string, unknown>,
    sourceTableId: string,
    isCreate: boolean,
    request: CreateFieldDto | UpdateFieldDto,
    trustedConfig?: Prisma.JsonValue,
  ): Promise<Record<string, Prisma.JsonValue>> {
    const targetTableId = this.requiredString(config.targetTableId, 'targetTableId');
    if (typeof config.multiple !== 'boolean') {
      throw new BadRequestException('multiple must be a boolean');
    }
    if (config.relationMode !== 'ONE_WAY' && config.relationMode !== 'TWO_WAY') {
      throw new BadRequestException('relationMode must be ONE_WAY or TWO_WAY');
    }
    const target = await this.prisma.dataTable.findFirst({
      where: { id: targetTableId, archivedAt: null },
    });
    if (!target) throw new NotFoundException('Relation target table not found');
    if (config.relationMode === 'TWO_WAY') {
      const source = await this.prisma.dataTable.findFirst({
        where: { id: sourceTableId, archivedAt: null },
      });
      if (
        !source ||
        source.source !== DataTableSource.CUSTOM ||
        target.source !== DataTableSource.CUSTOM
      ) {
        throw new BadRequestException('Two-way relations require custom tables');
      }
      if (isCreate) {
        const inverseFieldName = this.optionalString(
          (request as CreateFieldDto).inverseFieldName ?? config.inverseFieldName,
        );
        if (!inverseFieldName) {
          throw new BadRequestException('inverseFieldName is required for two-way relations');
        }
        const inverseMultiple =
          (request as CreateFieldDto).inverseMultiple ?? config.inverseMultiple;
        if (inverseMultiple !== undefined && typeof inverseMultiple !== 'boolean') {
          throw new BadRequestException('inverseMultiple must be a boolean');
        }
      }
    }
    const normalized: Record<string, Prisma.JsonValue> = {
      targetTableId,
      multiple: config.multiple,
      relationMode: config.relationMode,
    };
    const trusted = trustedConfig ? this.jsonRecord(trustedConfig) : undefined;
    if (
      config.relationMode === 'TWO_WAY' &&
      trusted?.targetTableId === targetTableId &&
      typeof trusted.inverseFieldId === 'string'
    ) {
      normalized.inverseFieldId = trusted.inverseFieldId;
    }
    return normalized;
  }

  private async normalizeLookup(
    config: Record<string, unknown>,
    tableId: string,
  ): Promise<Record<string, Prisma.JsonValue>> {
    const relationFieldId = this.requiredString(config.relationFieldId, 'relationFieldId');
    const targetFieldId = this.requiredString(config.targetFieldId, 'targetFieldId');
    const relation = await this.requireRelationField(tableId, relationFieldId);
    const targetTableId = await this.requireRelationTargetTableId(relation.config);
    const target = await this.prisma.dataField.findFirst({
      where: { id: targetFieldId, tableId: targetTableId, archivedAt: null },
    });
    if (!target) throw new NotFoundException('Lookup target field not found');
    if (FORBIDDEN_LOOKUP_TYPES.has(target.type)) {
      throw new BadRequestException('Lookup target must be a base or system field');
    }
    return { relationFieldId, targetFieldId };
  }

  private async normalizeRollup(
    config: Record<string, unknown>,
    tableId: string,
  ): Promise<Record<string, Prisma.JsonValue>> {
    const relationFieldId = this.requiredString(config.relationFieldId, 'relationFieldId');
    const aggregation = this.requiredString(config.aggregation, 'aggregation');
    if (!ROLLUP_AGGREGATIONS.has(aggregation)) {
      throw new BadRequestException('Unsupported rollup aggregation');
    }
    const relation = await this.requireRelationField(tableId, relationFieldId);
    const targetTableId = await this.requireRelationTargetTableId(relation.config);
    if (aggregation === 'COUNT') return { relationFieldId, aggregation };
    const targetFieldId = this.requiredString(config.targetFieldId, 'targetFieldId');
    const target = await this.prisma.dataField.findFirst({
      where: { id: targetFieldId, tableId: targetTableId, archivedAt: null },
    });
    if (!target) throw new NotFoundException('Rollup target field not found');
    if (target.type !== DataFieldType.NUMBER) {
      throw new BadRequestException('Numeric rollups require a base NUMBER target field');
    }
    return { relationFieldId, targetFieldId, aggregation };
  }

  private async normalizeFormula(
    config: Record<string, unknown>,
    tableId: string,
    proposedField: { id: string; key: string },
  ): Promise<Record<string, Prisma.JsonValue>> {
    const expression = this.requiredString(config.expression, 'expression');
    const fields = await this.activeFields(tableId);
    const parserFields = fields
      .filter((field) => field.id !== proposedField.id)
      .concat({
        id: proposedField.id,
        tableId,
        key: proposedField.key,
        name: proposedField.key,
        type: DataFieldType.FORMULA,
        config: {},
        isPrimary: false,
        isRequired: false,
      });
    const parsed = this.parse(expression, parserFields);
    this.assertAcyclic(fields, proposedField.id, parsed.dependencies);
    return {
      expression,
      astVersion: parsed.astVersion,
      dependencies: [...parsed.dependencies],
      ast: parsed.ast as Prisma.JsonObject,
    };
  }

  private parse(expression: string, fields: StoredField[]) {
    try {
      return parseFormula(expression, fields);
    } catch (error) {
      if (error instanceof FormulaParseError) {
        throw new BadRequestException({
          message: error.message,
          code: error.code,
          position: error.position,
        });
      }
      throw error;
    }
  }

  private assertAcyclic(
    fields: StoredField[],
    proposedFieldId: string,
    proposedDependencies: readonly string[],
  ): void {
    const graph = new Map<string, string[]>();
    for (const field of fields) {
      if (field.type !== DataFieldType.FORMULA || field.id === proposedFieldId) continue;
      graph.set(field.id, this.formulaDependencies(field.config));
    }
    graph.set(proposedFieldId, [...proposedDependencies]);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id) || !graph.has(id)) return false;
      visiting.add(id);
      for (const dependency of graph.get(id) ?? []) {
        if (visit(dependency)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    for (const id of graph.keys()) {
      if (visit(id)) throw new BadRequestException('Circular computed field dependency');
    }
  }

  private formulaDependencies(config: Prisma.JsonValue): string[] {
    const object = this.jsonRecord(config);
    return Array.isArray(object.dependencies)
      ? object.dependencies.filter(
          (dependency): dependency is string => typeof dependency === 'string',
        )
      : [];
  }

  private async requireRelationField(tableId: string, fieldId: string): Promise<StoredField> {
    const field = await this.prisma.dataField.findFirst({
      where: { id: fieldId, tableId, archivedAt: null },
    });
    if (!field) throw new NotFoundException('Relation field not found');
    if (field.type !== DataFieldType.RELATION) {
      throw new BadRequestException('relationFieldId must identify a RELATION field in this table');
    }
    return field;
  }

  private async requireRelationTargetTableId(config: Prisma.JsonValue): Promise<string> {
    const targetTableId = this.jsonRecord(config).targetTableId;
    const id = this.requiredString(targetTableId, 'Relation targetTableId');
    const table = await this.prisma.dataTable.findFirst({
      where: { id, archivedAt: null },
    });
    if (!table) throw new NotFoundException('Relation target table not found');
    return id;
  }

  private async activeFields(tableId: string): Promise<StoredField[]> {
    return this.prisma.dataField.findMany({
      where: { tableId, archivedAt: null },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
  }

  private assertComputedFlags(
    type: DataFieldType,
    isPrimary: boolean | undefined,
    isRequired: boolean | undefined,
  ): void {
    if (COMPUTED_TYPES.has(type) && (isPrimary || isRequired)) {
      throw new BadRequestException('Computed fields cannot be primary or required');
    }
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      if (value === undefined || value === null) return {};
      throw new BadRequestException('Field config must be a JSON object');
    }
    try {
      return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Field config must be valid JSON');
    }
  }

  private requiredString(value: unknown, name: string): string {
    const normalized = this.optionalString(value);
    if (!normalized) throw new BadRequestException(`${name} is required`);
    return normalized;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }
}
