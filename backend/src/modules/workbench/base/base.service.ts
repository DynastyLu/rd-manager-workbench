import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataFieldType, DataTableSource, DataViewType, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { SystemRecordsAdapter } from './adapters/system-records.adapter';
import { DATA_TABLE_PRESETS } from './domain/base-presets';
import { RecordQuery, UnifiedDataRecord } from './domain/base.types';
import {
  CreateFieldDto,
  FormulaPreviewDto,
  CreateTableDto,
  CreateViewDto,
  CreateWorkspaceDto,
  RecordValuesDto,
  UpdateFieldDto,
  UpdateTableDto,
  UpdateViewDto,
  UpdateWorkspaceDto,
} from './dto/base.dto';
import { FieldConfigService } from './field-config.service';
import { RelationSyncService } from './relation-sync.service';

const DEFAULT_WORKSPACE_ID = 'rd-workbench-default-data-workspace';

@Injectable()
export class BaseService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly systemRecords: SystemRecordsAdapter,
    private readonly fieldConfig: FieldConfigService,
    private readonly relationSync: RelationSyncService,
  ) {}

  async ensureDefaultWorkspace() {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('rd-manager-workbench:data-table-presets'))`,
      );
      const workspace = await tx.dataWorkspace.upsert({
        where: { id: DEFAULT_WORKSPACE_ID },
        create: {
          id: DEFAULT_WORKSPACE_ID,
          name: '研发工作台',
          description: '项目、任务、会议、文档与治理数据的统一视图',
          sequence: 0,
        },
        update: { archivedAt: null },
      });
      for (const preset of DATA_TABLE_PRESETS) {
        const existing = await tx.dataTable.findUnique({ where: { presetKey: preset.key } });
        const table = existing
          ? await tx.dataTable.update({
              where: { id: existing.id },
              data: { workspaceId: workspace.id, source: preset.source, archivedAt: null },
            })
          : await tx.dataTable.create({
              data: {
                workspaceId: workspace.id,
                name: preset.name,
                description: preset.description,
                icon: preset.icon,
                source: preset.source,
                presetKey: preset.key,
                sequence: DATA_TABLE_PRESETS.indexOf(preset),
              },
            });
        for (const field of preset.fields) {
          await tx.dataField.upsert({
            where: { tableId_key: { tableId: table.id, key: field.key } },
            create: {
              tableId: table.id,
              key: field.key,
              name: field.name,
              type: field.type,
              config: (field.config ?? {}) as Prisma.InputJsonValue,
              isPrimary: field.isPrimary ?? false,
              sequence: field.sequence,
            },
            update: {
              type: field.type,
              config: (field.config ?? {}) as Prisma.InputJsonValue,
              isPrimary: field.isPrimary ?? false,
              archivedAt: null,
            },
          });
        }
        for (const view of preset.views) {
          const exists = await tx.dataView.findFirst({
            where: { tableId: table.id, name: view.name, type: view.type },
          });
          if (!exists)
            await tx.dataView.create({
              data: {
                tableId: table.id,
                name: view.name,
                type: view.type,
                config: (view.config ?? {}) as Prisma.InputJsonValue,
                isDefault: view.isDefault ?? false,
                sequence: view.sequence,
              },
            });
        }
      }
      return tx.dataWorkspace.findUniqueOrThrow({
        where: { id: workspace.id },
        include: this.workspaceInclude(),
      });
    });
  }

  async listWorkspaces() {
    await this.ensureDefaultWorkspace();
    return this.prisma.dataWorkspace.findMany({
      where: { archivedAt: null },
      include: this.workspaceInclude(),
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    });
  }

  async getWorkspace(id: string) {
    await this.ensureDefaultWorkspace();
    const workspace = await this.prisma.dataWorkspace.findFirst({
      where: { id, archivedAt: null },
      include: this.workspaceInclude(),
    });
    if (!workspace) throw new NotFoundException('Data workspace not found');
    return workspace;
  }

  createWorkspace(dto: CreateWorkspaceDto) {
    return this.prisma.dataWorkspace.create({ data: dto });
  }

  async updateWorkspace(id: string, dto: UpdateWorkspaceDto) {
    await this.assertWorkspace(id);
    return this.prisma.dataWorkspace.update({ where: { id }, data: dto });
  }

  async deleteWorkspace(id: string) {
    if (id === DEFAULT_WORKSPACE_ID)
      throw new BadRequestException('The default workspace cannot be deleted');
    await this.assertWorkspace(id);
    const presetCount = await this.prisma.dataTable.count({
      where: { workspaceId: id, archivedAt: null, source: { not: DataTableSource.CUSTOM } },
    });
    if (presetCount)
      throw new ConflictException('A workspace containing preset tables cannot be deleted');
    await this.prisma.dataWorkspace.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async listTables(workspaceId: string) {
    await this.assertWorkspace(workspaceId);
    return this.prisma.dataTable.findMany({
      where: { workspaceId, archivedAt: null },
      include: this.tableInclude(),
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    });
  }

  async getTable(id: string) {
    const table = await this.prisma.dataTable.findFirst({
      where: { id, archivedAt: null },
      include: this.tableInclude(),
    });
    if (!table) throw new NotFoundException('Data table not found');
    return table;
  }

  async createTable(workspaceId: string, dto: CreateTableDto) {
    await this.assertWorkspace(workspaceId);
    return this.prisma.dataTable.create({
      data: {
        workspaceId,
        ...dto,
        source: DataTableSource.CUSTOM,
        fields: {
          create: {
            key: 'title',
            name: '标题',
            type: 'TEXT',
            isPrimary: true,
            isRequired: true,
            sequence: 0,
          },
        },
        views: {
          create: [
            { name: '表格', type: DataViewType.GRID, isDefault: true, sequence: 0 },
            { name: '表单', type: DataViewType.FORM, sequence: 1 },
          ],
        },
      },
      include: this.tableInclude(),
    });
  }

  async updateTable(id: string, dto: UpdateTableDto) {
    await this.assertTable(id);
    return this.prisma.dataTable.update({ where: { id }, data: dto, include: this.tableInclude() });
  }

  async deleteTable(id: string) {
    const table = await this.assertTable(id);
    if (table.source !== DataTableSource.CUSTOM)
      throw new BadRequestException('Preset tables cannot be deleted');
    await this.prisma.dataTable.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async listFields(tableId: string) {
    await this.assertTable(tableId);
    return this.prisma.dataField.findMany({
      where: { tableId, archivedAt: null },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
  }

  async createField(tableId: string, dto: CreateFieldDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const requestedTarget =
          dto.config && typeof dto.config.targetTableId === 'string'
            ? dto.config.targetTableId
            : undefined;
        await this.relationSync.lockTableConfigs(
          tx,
          requestedTarget ? [tableId, requestedTarget] : [tableId],
        );
        const table = await tx.dataTable.findFirst({ where: { id: tableId, archivedAt: null } });
        if (!table) throw new NotFoundException('Data table not found');
        if (table.source !== DataTableSource.CUSTOM)
          throw new BadRequestException('This operation is only available for custom tables');
        const normalized = await this.fieldConfig.normalizeCreate(tableId, dto, tx);
        if (
          normalized.isPrimary &&
          (await tx.dataField.count({
            where: { tableId: table.id, isPrimary: true, archivedAt: null },
          }))
        )
          throw new ConflictException('The table already has a primary field');
        const archived = await tx.dataField.findUnique({
          where: { tableId_key: { tableId, key: dto.key } },
        });
        const { config } = normalized;
        const fields = {
          key: normalized.key,
          name: normalized.name,
          type: normalized.type,
          isPrimary: normalized.isPrimary,
          isRequired: normalized.isRequired,
          sequence: normalized.sequence,
        };
        const source = archived?.archivedAt
          ? await tx.dataField.update({
              where: { id: archived.id },
              data: {
                ...fields,
                archivedAt: null,
                config: (config ?? {}) as Prisma.InputJsonValue,
              },
            })
          : await tx.dataField.create({
              data: { ...fields, tableId, config: (config ?? {}) as Prisma.InputJsonValue },
            });
        const relationConfig = this.relationSync.relationConfig(source.config);
        if (source.type !== DataFieldType.RELATION || relationConfig?.relationMode !== 'TWO_WAY') {
          return source;
        }
        const inverseKey = await this.uniqueInverseKey(
          tx,
          relationConfig.targetTableId,
          source.key,
        );
        const inverse = await tx.dataField.create({
          data: {
            tableId: relationConfig.targetTableId,
            key: inverseKey,
            name: normalized.inverseFieldName!,
            type: DataFieldType.RELATION,
            sequence: normalized.sequence,
            config: {
              targetTableId: tableId,
              multiple: normalized.inverseMultiple ?? true,
              relationMode: 'TWO_WAY',
              inverseFieldId: source.id,
            },
          },
        });
        return tx.dataField.update({
          where: { id: source.id },
          data: {
            config: {
              ...relationConfig,
              inverseFieldId: inverse.id,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          dto.isPrimary ? 'The table already has a primary field' : 'Field key already exists',
        );
      throw error;
    }
  }

  private async uniqueInverseKey(
    tx: Prisma.TransactionClient,
    tableId: string,
    sourceKey: string,
  ): Promise<string> {
    const keys = new Set(
      (
        await tx.dataField.findMany({
          where: { tableId },
          select: { key: true },
        })
      ).map((field) => field.key),
    );
    const base = `inverse_${sourceKey}`.slice(0, 100);
    if (!keys.has(base)) return base;
    for (let suffix = 2; ; suffix += 1) {
      const ending = `_${suffix}`;
      const candidate = `${base.slice(0, 100 - ending.length)}${ending}`;
      if (!keys.has(candidate)) return candidate;
    }
  }

  async updateField(id: string, dto: UpdateFieldDto) {
    const located = await this.prisma.dataField.findFirst({
      where: { id, archivedAt: null },
      select: { tableId: true, config: true },
    });
    if (!located) throw new NotFoundException('Data field not found');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const oldRelation = this.relationSync.relationConfig(located.config);
        const requestedTarget =
          dto.config && typeof dto.config.targetTableId === 'string'
            ? dto.config.targetTableId
            : undefined;
        await this.relationSync.lockTableConfigs(tx, [
          located.tableId,
          ...(oldRelation ? [oldRelation.targetTableId] : []),
          ...(requestedTarget ? [requestedTarget] : []),
        ]);
        const field = await tx.dataField.findFirst({
          where: { id, archivedAt: null },
          include: { table: true },
        });
        if (!field) throw new NotFoundException('Data field not found');
        if (field.table.source !== DataTableSource.CUSTOM)
          throw new BadRequestException('Preset fields cannot be changed');
        const normalized = await this.fieldConfig.normalizeUpdate(field, dto, tx);
        const prospectiveRelation = this.relationSync.relationConfig(
          (normalized.config ?? field.config) as Prisma.JsonValue,
        );
        const existingRelation = this.relationSync.relationConfig(field.config);
        if (
          existingRelation?.relationMode === 'TWO_WAY' &&
          (prospectiveRelation?.relationMode !== 'TWO_WAY' ||
            prospectiveRelation.targetTableId !== existingRelation.targetTableId)
        ) {
          await this.relationSync.decouplePair(
            tx,
            field,
            prospectiveRelation?.targetTableId !== existingRelation.targetTableId,
          );
        }
        if (field.isPrimary && normalized.isPrimary === false)
          throw new BadRequestException('The primary field cannot be downgraded');
        if (
          normalized.isPrimary &&
          !field.isPrimary &&
          (await tx.dataField.count({
            where: { tableId: field.tableId, isPrimary: true, archivedAt: null },
          }))
        )
          throw new ConflictException('The table already has a primary field');
        const { config, ...fields } = normalized;
        return tx.dataField.update({
          where: { id },
          data: { ...fields, ...(config ? { config: config as Prisma.InputJsonValue } : {}) },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('The table already has a primary field');
      throw error;
    }
  }

  previewFormula(tableId: string, dto: FormulaPreviewDto) {
    return this.fieldConfig.previewFormula(tableId, dto);
  }

  async deleteField(id: string) {
    const located = await this.prisma.dataField.findFirst({
      where: { id, archivedAt: null },
      include: { table: true },
    });
    if (!located) throw new NotFoundException('Data field not found');
    if (located.table.source !== DataTableSource.CUSTOM)
      throw new BadRequestException('Preset fields cannot be deleted');
    if (located.isPrimary) throw new BadRequestException('The primary field cannot be deleted');
    await this.prisma.$transaction(async (tx) => {
      const relation = this.relationSync.relationConfig(located.config);
      await this.relationSync.lockTableConfigs(tx, [
        located.tableId,
        ...(relation ? [relation.targetTableId] : []),
      ]);
      const field = await tx.dataField.findFirst({ where: { id, archivedAt: null } });
      if (!field) throw new NotFoundException('Data field not found');
      await this.relationSync.decouplePair(tx, field);
      const records = await tx.dataRecord.findMany({ where: { tableId: field.tableId } });
      for (const record of records) {
        const values = { ...(record.values as Values) };
        delete values[field.key];
        await tx.dataRecord.update({
          where: { id: record.id },
          data: { values: values as Prisma.InputJsonValue },
        });
      }
      await tx.dataField.update({ where: { id }, data: { archivedAt: new Date() } });
    });
  }

  async listRecords(tableId: string, query: RecordQuery) {
    const table = await this.assertTable(tableId);
    if (table.source !== DataTableSource.CUSTOM)
      return this.systemRecords.list(table.source, query);
    const [records, generatedFields] = await Promise.all([
      this.prisma.dataRecord.findMany({
        where: { tableId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      this.generatedFields(tableId),
    ]);
    return this.applyCustomQuery(
      records.map((record) => this.toCustomRecord(record, generatedFields)),
      query,
    );
  }

  async createRecord(tableId: string, dto: RecordValuesDto) {
    const record = await this.prisma.$transaction(async (tx) => {
      const table = await tx.dataTable.findFirst({ where: { id: tableId, archivedAt: null } });
      if (!table) throw new NotFoundException('Data table not found');
      if (table.source !== DataTableSource.CUSTOM)
        throw new BadRequestException('This operation is only available for custom tables');
      await this.relationSync.lockTableConfigs(
        tx,
        await this.relationSync.relationTableIds(tx, tableId),
      );
      await this.validateRecordValues(tableId, dto.values, true, tx);
      const created = await tx.dataRecord.create({
        data: { tableId, values: dto.values as Prisma.InputJsonValue },
      });
      await this.relationSync.syncRecord(tx, tableId, created.id, {}, dto.values);
      return created;
    });
    return this.toCustomRecord(record, await this.generatedFields(tableId));
  }

  async updateRecord(tableId: string, id: string, dto: RecordValuesDto) {
    const table = await this.assertTable(tableId);
    if (table.source !== DataTableSource.CUSTOM) {
      await this.validateRecordValues(tableId, dto.values, false);
      return this.systemRecords.update(table.source, id, dto.values);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.relationSync.lockTableConfigs(
        tx,
        await this.relationSync.relationTableIds(tx, tableId),
      );
      const record = await tx.dataRecord.findFirst({ where: { id, tableId } });
      if (!record) throw new NotFoundException('Data record not found');
      const oldValues = record.values as Values;
      const values = { ...oldValues, ...dto.values };
      await this.validateRecordValues(tableId, values, true, tx);
      const result = await tx.dataRecord.update({
        where: { id },
        data: { values: values as Prisma.InputJsonValue },
      });
      await this.relationSync.syncRecord(tx, tableId, id, oldValues, values);
      return result;
    });
    return this.toCustomRecord(updated, await this.generatedFields(tableId));
  }

  async deleteRecord(tableId: string, id: string) {
    await this.assertCustomTable(tableId);
    await this.prisma.$transaction(async (tx) => {
      await this.relationSync.lockTableConfigs(
        tx,
        await this.relationSync.relationTableIds(tx, tableId),
      );
      const record = await tx.dataRecord.findFirst({ where: { id, tableId } });
      if (!record) throw new NotFoundException('Data record not found');
      await this.relationSync.syncRecord(tx, tableId, id, record.values as Values, {});
      await tx.dataRecord.delete({ where: { id } });
    });
  }

  async listViews(tableId: string) {
    await this.assertTable(tableId);
    return this.prisma.dataView.findMany({
      where: { tableId },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
  }

  async createView(tableId: string, dto: CreateViewDto) {
    await this.assertTable(tableId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.dataView.updateMany({ where: { tableId }, data: { isDefault: false } });
      return tx.dataView.create({
        data: { ...dto, tableId, config: (dto.config ?? {}) as Prisma.InputJsonValue },
      });
    });
  }

  async updateView(id: string, dto: UpdateViewDto) {
    const view = await this.prisma.dataView.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('Data view not found');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.dataView.updateMany({
          where: { tableId: view.tableId },
          data: { isDefault: false },
        });
      const { config, ...fields } = dto;
      return tx.dataView.update({
        where: { id },
        data: { ...fields, ...(config ? { config: config as Prisma.InputJsonValue } : {}) },
      });
    });
  }

  async deleteView(id: string) {
    const view = await this.prisma.dataView.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('Data view not found');
    const count = await this.prisma.dataView.count({ where: { tableId: view.tableId } });
    if (count <= 1) throw new BadRequestException('A table must retain at least one view');
    await this.prisma.dataView.delete({ where: { id } });
    if (view.isDefault) {
      const next = await this.prisma.dataView.findFirst({
        where: { tableId: view.tableId },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      });
      if (next)
        await this.prisma.dataView.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  private async validateRecordValues(
    tableId: string,
    values: Values,
    requireFields: boolean,
    client: BaseDataClient = this.prisma,
  ) {
    const fields = await client.dataField.findMany({ where: { tableId, archivedAt: null } });
    const fieldKeys = new Set(fields.map((field) => field.key));
    const unknown = Object.keys(values).filter((key) => !fieldKeys.has(key));
    if (unknown.length) throw new BadRequestException(`Unknown fields: ${unknown.join(', ')}`);
    for (const field of fields) {
      if (
        values[field.key] === undefined ||
        values[field.key] === null ||
        (values[field.key] === '' && !field.isRequired && field.type !== DataFieldType.RELATION)
      )
        continue;
      const value = values[field.key];
      if (field.type === DataFieldType.CREATED_AT || field.type === DataFieldType.UPDATED_AT)
        throw new BadRequestException(`${field.name} is generated and cannot be written`);
      if (field.type === DataFieldType.NUMBER && typeof value !== 'number')
        throw new BadRequestException(`${field.name} must be a number`);
      if (field.type === DataFieldType.CHECKBOX && typeof value !== 'boolean')
        throw new BadRequestException(`${field.name} must be a boolean`);
      if (
        (field.type === DataFieldType.MULTI_SELECT || field.type === DataFieldType.ATTACHMENT) &&
        !Array.isArray(value)
      )
        throw new BadRequestException(`${field.name} must be an array`);
      if (
        (field.type === DataFieldType.MULTI_SELECT || field.type === DataFieldType.ATTACHMENT) &&
        Array.isArray(value) &&
        value.some((item) => typeof item !== 'string')
      )
        throw new BadRequestException(`${field.name} must contain only strings`);
      if (
        field.type === DataFieldType.RELATION &&
        typeof value !== 'string' &&
        !Array.isArray(value)
      )
        throw new BadRequestException(`${field.name} must be a relation id or id array`);
      if (
        field.type === DataFieldType.RELATION &&
        typeof value === 'string' &&
        value.trim().length === 0 &&
        this.hasNormalizedRelationTarget(field.config)
      )
        throw new BadRequestException(`${field.name} must be a non-empty relation id`);
      if (
        field.type === DataFieldType.RELATION &&
        Array.isArray(value) &&
        value.some((item) => typeof item !== 'string' || item.trim().length === 0)
      )
        throw new BadRequestException(`${field.name} must contain only non-empty string ids`);
      if (
        field.type === DataFieldType.DATETIME &&
        (typeof value !== 'string' || Number.isNaN(new Date(value).getTime()))
      )
        throw new BadRequestException(`${field.name} must be an ISO date`);
      if (
        (field.type === DataFieldType.TEXT ||
          field.type === DataFieldType.LONG_TEXT ||
          field.type === DataFieldType.LINK ||
          field.type === DataFieldType.SINGLE_SELECT) &&
        typeof value !== 'string'
      )
        throw new BadRequestException(`${field.name} must be text`);
      if (field.type === DataFieldType.LINK && typeof value === 'string' && !this.isHttpUrl(value))
        throw new BadRequestException(`${field.name} must be a valid URL`);
      const optionValues = this.optionValues(field.config);
      if (
        field.type === DataFieldType.SINGLE_SELECT &&
        optionValues.length &&
        !optionValues.includes(String(value))
      )
        throw new BadRequestException(`${field.name} is not an allowed option`);
      if (
        field.type === DataFieldType.MULTI_SELECT &&
        Array.isArray(value) &&
        optionValues.length &&
        value.some((item) => !optionValues.includes(String(item)))
      )
        throw new BadRequestException(`${field.name} contains an unsupported option`);
    }
    await this.relationSync.validateRelationValues(client, tableId, values, fields);
    if (requireFields) {
      const missing = fields
        .filter((field) => {
          const value = values[field.key];
          return (
            field.isRequired &&
            (value === undefined ||
              value === null ||
              value === '' ||
              (Array.isArray(value) && value.length === 0))
          );
        })
        .map((field) => field.name);
      if (missing.length)
        throw new BadRequestException(`Required fields missing: ${missing.join(', ')}`);
    }
  }

  private applyCustomQuery(records: UnifiedDataRecord[], query: RecordQuery) {
    let result = query.query
      ? records.filter((record) =>
          JSON.stringify(record.values)
            .toLocaleLowerCase()
            .includes(query.query!.toLocaleLowerCase()),
        )
      : records;
    if (query.filterField)
      result = result.filter(
        (record) =>
          String(record.values[query.filterField!] ?? '') === String(query.filterValue ?? ''),
      );
    if (query.sortField)
      result = [...result].sort(
        (left, right) =>
          String(left.values[query.sortField!] ?? '').localeCompare(
            String(right.values[query.sortField!] ?? ''),
            'zh-CN',
            { numeric: true },
          ) * (query.sortOrder === 'desc' ? -1 : 1),
      );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    return {
      data: result.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: result.length },
    };
  }

  private toCustomRecord(
    record: {
      id: string;
      tableId: string;
      values: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    },
    generatedFields: Array<{ key: string; type: DataFieldType }> = [],
  ): UnifiedDataRecord {
    const generatedValues = Object.fromEntries(
      generatedFields.map((field) => [
        field.key,
        field.type === DataFieldType.CREATED_AT ? record.createdAt : record.updatedAt,
      ]),
    );
    return {
      id: record.id,
      values: { ...(record.values as Values), ...generatedValues },
      sourceType: 'CUSTOM',
      sourceId: record.id,
      sourcePath: `/base?tableId=${record.tableId}&recordId=${record.id}`,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private generatedFields(tableId: string) {
    return this.prisma.dataField.findMany({
      where: {
        tableId,
        archivedAt: null,
        type: { in: [DataFieldType.CREATED_AT, DataFieldType.UPDATED_AT] },
      },
      select: { key: true, type: true },
    });
  }

  private optionValues(config: Prisma.JsonValue): string[] {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
    const options = (config as Prisma.JsonObject).options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((option) => {
      if (typeof option === 'string') return [option];
      if (
        option &&
        typeof option === 'object' &&
        !Array.isArray(option) &&
        typeof option.value === 'string'
      )
        return [option.value];
      return [];
    });
  }

  private hasNormalizedRelationTarget(config: Prisma.JsonValue): boolean {
    return (
      !!config &&
      typeof config === 'object' &&
      !Array.isArray(config) &&
      typeof (config as Prisma.JsonObject).targetTableId === 'string'
    );
  }

  private isHttpUrl(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async assertWorkspace(id: string) {
    const workspace = await this.prisma.dataWorkspace.findFirst({
      where: { id, archivedAt: null },
    });
    if (!workspace) throw new NotFoundException('Data workspace not found');
    return workspace;
  }
  private async assertTable(id: string) {
    const table = await this.prisma.dataTable.findFirst({ where: { id, archivedAt: null } });
    if (!table) throw new NotFoundException('Data table not found');
    return table;
  }
  private async assertCustomTable(id: string) {
    const table = await this.assertTable(id);
    if (table.source !== DataTableSource.CUSTOM)
      throw new BadRequestException('This operation is only available for custom tables');
    return table;
  }
  private tableInclude() {
    return {
      fields: {
        where: { archivedAt: null },
        orderBy: [{ sequence: 'asc' as const }, { id: 'asc' as const }],
      },
      views: { orderBy: [{ sequence: 'asc' as const }, { id: 'asc' as const }] },
    };
  }
  private workspaceInclude() {
    return {
      tables: {
        where: { archivedAt: null },
        include: this.tableInclude(),
        orderBy: [{ sequence: 'asc' as const }, { name: 'asc' as const }],
      },
    };
  }
}

type Values = Record<string, unknown>;
type BaseDataClient = Pick<Prisma.TransactionClient, 'dataField' | 'dataTable' | 'dataRecord'>;
