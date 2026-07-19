import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataFieldType, DataTableSource, Prisma } from '@prisma/client';

type Values = Record<string, unknown>;

type RelationConfig = {
  targetTableId: string;
  multiple: boolean;
  relationMode: 'ONE_WAY' | 'TWO_WAY';
  inverseFieldId?: string;
};

type RelationField = {
  id: string;
  tableId: string;
  key: string;
  name: string;
  type: DataFieldType;
  config: Prisma.JsonValue;
};

type RelationDataClient = Pick<Prisma.TransactionClient, 'dataTable' | 'dataField' | 'dataRecord'>;

export function stableSortedUniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

@Injectable()
export class RelationSyncService {
  async lockTableConfigs(tx: Prisma.TransactionClient, tableIds: readonly string[]): Promise<void> {
    for (const tableId of stableSortedUniqueIds(tableIds)) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:data-field-config:${tableId}`}))`,
      );
    }
  }

  async relationTableIds(
    tx: Prisma.TransactionClient,
    tableId: string,
    extraTableIds: readonly string[] = [],
  ): Promise<string[]> {
    const fields = await tx.dataField.findMany({
      where: { tableId, archivedAt: null, type: DataFieldType.RELATION },
      select: { config: true },
    });
    return [
      tableId,
      ...extraTableIds,
      ...fields.flatMap((field) => {
        const config = this.relationConfig(field.config);
        return config?.relationMode === 'TWO_WAY' ? [config.targetTableId] : [];
      }),
    ];
  }

  async validateRelationValues(
    tx: RelationDataClient,
    tableId: string,
    values: Values,
    fields?: RelationField[],
  ): Promise<void> {
    const relations =
      fields ??
      (await tx.dataField.findMany({
        where: { tableId, archivedAt: null, type: DataFieldType.RELATION },
      }));
    for (const field of relations) {
      const config = this.relationConfig(field.config);
      if (!config) continue;
      const ids = this.valueIds(values[field.key], config.multiple, field.name);
      if (!ids.length) continue;
      const target = await tx.dataTable.findFirst({
        where: { id: config.targetTableId, archivedAt: null },
      });
      if (!target) throw new NotFoundException('Relation target table not found');
      if (target.source !== DataTableSource.CUSTOM) continue;
      const found = await tx.dataRecord.findMany({
        where: { id: { in: ids }, tableId: target.id },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        throw new BadRequestException(`${field.name} contains a missing or wrong-table record id`);
      }
    }
  }

  async syncRecord(
    tx: Prisma.TransactionClient,
    tableId: string,
    recordId: string,
    oldValues: Values,
    newValues: Values,
  ): Promise<void> {
    const fields = await tx.dataField.findMany({
      where: { tableId, archivedAt: null, type: DataFieldType.RELATION },
    });
    const changes = fields.flatMap((field) => {
      const config = this.relationConfig(field.config);
      if (!config || config.relationMode !== 'TWO_WAY' || !config.inverseFieldId) return [];
      const before = this.valueIds(oldValues[field.key], config.multiple, field.name);
      const after = this.valueIds(newValues[field.key], config.multiple, field.name);
      return [{ field, config, before, after }];
    });
    const affectedIds = [
      recordId,
      ...changes.flatMap((change) => [...change.before, ...change.after]),
    ];
    await this.lockRecords(tx, affectedIds);

    const targetIds = [
      ...new Set(changes.flatMap((change) => [...change.before, ...change.after])),
    ];
    const targetRecords = targetIds.length
      ? await tx.dataRecord.findMany({ where: { id: { in: targetIds } } })
      : [];
    const recordsById = new Map(targetRecords.map((record) => [record.id, record]));
    const pending = new Map<string, Values>();

    for (const change of changes) {
      const inverse = await tx.dataField.findFirst({
        where: {
          id: change.config.inverseFieldId,
          tableId: change.config.targetTableId,
          archivedAt: null,
          type: DataFieldType.RELATION,
        },
      });
      if (!inverse) throw new BadRequestException('Two-way relation inverse field is invalid');
      const inverseConfig = this.relationConfig(inverse.config);
      if (
        !inverseConfig ||
        inverseConfig.relationMode !== 'TWO_WAY' ||
        inverseConfig.inverseFieldId !== change.field.id ||
        inverseConfig.targetTableId !== tableId
      ) {
        throw new BadRequestException('Two-way relation inverse field is invalid');
      }
      const removed = change.before.filter((id) => !change.after.includes(id));
      const added = change.after.filter((id) => !change.before.includes(id));
      for (const targetId of [...removed, ...added]) {
        const target = recordsById.get(targetId);
        if (!target || target.tableId !== change.config.targetTableId) {
          throw new BadRequestException(
            `${change.field.name} contains a missing or wrong-table record id`,
          );
        }
        const values = pending.get(targetId) ?? ({ ...(target.values as Values) } as Values);
        const current = this.valueIds(values[inverse.key], inverseConfig.multiple, inverse.name);
        if (removed.includes(targetId)) {
          const next = current.filter((id) => id !== recordId);
          values[inverse.key] = inverseConfig.multiple ? next : (next[0] ?? null);
        } else if (!current.includes(recordId)) {
          if (!inverseConfig.multiple && current.length) {
            throw new ConflictException(`${inverse.name} already relates to another record`);
          }
          const next = [...current, recordId];
          values[inverse.key] = inverseConfig.multiple ? next : next[0];
        }
        pending.set(targetId, values);
      }
    }
    for (const [id, values] of pending) {
      await tx.dataRecord.update({
        where: { id },
        data: { values: values as Prisma.InputJsonValue },
      });
    }
  }

  async clearPairValues(
    tx: Prisma.TransactionClient,
    field: RelationField,
    inverse: RelationField,
    clearSourceValues = true,
  ): Promise<void> {
    const records = await tx.dataRecord.findMany({
      where: { tableId: { in: [...new Set([field.tableId, inverse.tableId])] } },
      orderBy: { id: 'asc' },
    });
    await this.lockRecords(
      tx,
      records.map((record) => record.id),
    );
    for (const record of records) {
      const values = { ...(record.values as Values) };
      let changed = false;
      if (clearSourceValues && record.tableId === field.tableId && field.key in values) {
        delete values[field.key];
        changed = true;
      }
      if (record.tableId === inverse.tableId && inverse.key in values) {
        delete values[inverse.key];
        changed = true;
      }
      if (!changed) continue;
      await tx.dataRecord.update({
        where: { id: record.id },
        data: { values: values as Prisma.InputJsonValue },
      });
    }
  }

  async decouplePair(
    tx: Prisma.TransactionClient,
    field: RelationField,
    clearSourceValues = true,
  ): Promise<void> {
    const config = this.relationConfig(field.config);
    if (config?.relationMode !== 'TWO_WAY' || !config.inverseFieldId) return;
    const inverse = await tx.dataField.findFirst({
      where: { id: config.inverseFieldId, archivedAt: null, type: DataFieldType.RELATION },
    });
    if (!inverse) return;
    await this.clearPairValues(tx, field, inverse, clearSourceValues);
    const inverseConfig = this.relationConfig(inverse.config);
    await tx.dataField.update({
      where: { id: inverse.id },
      data: {
        config: {
          targetTableId: field.tableId,
          multiple: inverseConfig?.multiple ?? true,
          relationMode: 'ONE_WAY',
        },
      },
    });
  }

  relationConfig(value: Prisma.JsonValue): RelationConfig | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const config = value as Prisma.JsonObject;
    if (
      typeof config.targetTableId !== 'string' ||
      typeof config.multiple !== 'boolean' ||
      (config.relationMode !== 'ONE_WAY' && config.relationMode !== 'TWO_WAY')
    ) {
      return undefined;
    }
    return {
      targetTableId: config.targetTableId,
      multiple: config.multiple,
      relationMode: config.relationMode,
      ...(typeof config.inverseFieldId === 'string'
        ? { inverseFieldId: config.inverseFieldId }
        : {}),
    };
  }

  private valueIds(value: unknown, multiple: boolean, fieldName: string): string[] {
    if (value === undefined || value === null) return [];
    if (multiple) {
      if (!Array.isArray(value)) throw new BadRequestException(`${fieldName} must be an id array`);
      if (value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
        throw new BadRequestException(`${fieldName} must contain only non-empty string ids`);
      }
      if (new Set(value).size !== value.length) {
        throw new BadRequestException(`${fieldName} must not contain duplicate ids`);
      }
      return value;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} must be a relation id`);
    }
    return [value];
  }

  private async lockRecords(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void> {
    const sorted = stableSortedUniqueIds(ids);
    if (!sorted.length) return;
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM app.data_records WHERE id IN (${Prisma.join(
        sorted,
      )}) ORDER BY id FOR UPDATE`,
    );
  }
}
