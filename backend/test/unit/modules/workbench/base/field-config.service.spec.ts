import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataFieldType, DataTableSource, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../../src/infrastructure/prisma/platform-prisma.service';
import { FieldConfigService } from '../../../../../src/modules/workbench/base/field-config.service';

type Field = {
  id: string;
  tableId: string;
  key: string;
  name: string;
  type: DataFieldType;
  config: Prisma.JsonValue;
  isPrimary: boolean;
  isRequired: boolean;
  archivedAt: Date | null;
};

describe('FieldConfigService', () => {
  const currentTableId = 'table-current';
  const targetTableId = 'table-target';
  const systemTableId = 'table-system';
  const archivedTableId = 'table-archived';
  const tables = [
    { id: currentTableId, source: DataTableSource.CUSTOM, archivedAt: null },
    { id: targetTableId, source: DataTableSource.CUSTOM, archivedAt: null },
    { id: systemTableId, source: DataTableSource.PROJECTS, archivedAt: null },
    { id: archivedTableId, source: DataTableSource.CUSTOM, archivedAt: new Date() },
  ];
  let fields: Field[];
  let records: Array<{
    id: string;
    tableId: string;
    values: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }>;
  let service: FieldConfigService;

  beforeEach(() => {
    fields = [
      field('amount', currentTableId, 'amount', DataFieldType.NUMBER),
      field('relation', currentTableId, 'project', DataFieldType.RELATION, {
        targetTableId,
        multiple: true,
        relationMode: 'ONE_WAY',
      }),
      field('system-relation', currentTableId, 'systemProject', DataFieldType.RELATION, {
        targetTableId: systemTableId,
        multiple: false,
        relationMode: 'ONE_WAY',
      }),
      field('target-name', targetTableId, 'name', DataFieldType.TEXT),
      field('target-number', targetTableId, 'budget', DataFieldType.NUMBER),
      field('target-formula', targetTableId, 'computed', DataFieldType.FORMULA, {
        expression: '1',
        astVersion: 1,
        dependencies: [],
        ast: { kind: 'literal', value: 1 },
      }),
      field('archived-relation', currentTableId, 'archivedProject', DataFieldType.RELATION, {
        targetTableId: archivedTableId,
        multiple: false,
        relationMode: 'ONE_WAY',
      }),
      field('archived-target', archivedTableId, 'title', DataFieldType.TEXT),
      field('missing-target-relation', currentTableId, 'missingProject', DataFieldType.RELATION, {
        targetTableId: 'missing-table',
        multiple: false,
        relationMode: 'ONE_WAY',
      }),
      field('trusted-relation', currentTableId, 'trustedProject', DataFieldType.RELATION, {
        targetTableId,
        multiple: true,
        relationMode: 'TWO_WAY',
        inverseFieldId: 'trusted-inverse',
      }),
      field('lookup', currentTableId, 'projectName', DataFieldType.LOOKUP, {
        relationFieldId: 'relation',
        targetFieldId: 'target-name',
      }),
      field('rollup', currentTableId, 'projectBudget', DataFieldType.ROLLUP, {
        relationFieldId: 'relation',
        targetFieldId: 'target-number',
        aggregation: 'SUM',
      }),
      field('created-at', currentTableId, 'createdAt', DataFieldType.CREATED_AT),
      field('updated-at', currentTableId, 'updatedAt', DataFieldType.UPDATED_AT),
    ];
    records = [
      {
        id: 'record-1',
        tableId: currentTableId,
        values: { amount: 5 },
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        updatedAt: new Date('2026-07-21T00:00:00.000Z'),
      },
    ];
    const prisma = {
      dataTable: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            tables.find((table) => table.id === where.id && table.archivedAt === null) ?? null,
          ),
        ),
      },
      dataField: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(findFirstField(where)),
        ),
        findMany: jest.fn(({ where }: { where: { tableId: string } }) =>
          Promise.resolve(
            fields.filter((item) => item.tableId === where.tableId && !item.archivedAt),
          ),
        ),
      },
      dataRecord: {
        findFirst: jest.fn(({ where }: { where: { id: string; tableId: string } }) =>
          Promise.resolve(
            records.find((record) => record.id === where.id && record.tableId === where.tableId) ??
              null,
          ),
        ),
      },
    } as unknown as PlatformPrismaService;
    service = new FieldConfigService(prisma);
  });

  it('normalizes valid relations and defaults inverseMultiple on two-way creation', async () => {
    const twoWay = await service.normalizeCreate(currentTableId, {
      key: 'owner',
      name: '负责人',
      type: DataFieldType.RELATION,
      config: {
        targetTableId,
        multiple: false,
        relationMode: 'TWO_WAY',
        inverseFieldName: 'nested value must be ignored',
        inverseMultiple: 'nested value must be ignored',
        inverseFieldId: 'forged-inverse',
        ast: { client: true },
      },
      inverseFieldName: '需求',
    });
    expect(twoWay).toMatchObject({
      config: { targetTableId, multiple: false, relationMode: 'TWO_WAY' },
      inverseFieldName: '需求',
      inverseMultiple: true,
    });
    expect(twoWay.config).not.toHaveProperty('inverseFieldId');
    expect(twoWay.config).not.toHaveProperty('inverseFieldName');
    expect(twoWay.config).not.toHaveProperty('inverseMultiple');
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'oneWayOwner',
        name: '单向负责人',
        type: DataFieldType.RELATION,
        config: {
          targetTableId,
          multiple: false,
          relationMode: 'ONE_WAY',
          inverseFieldId: 'forged-one-way-inverse',
        },
      }),
    ).resolves.not.toHaveProperty('config.inverseFieldId');

    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'nestedOnly',
        name: '嵌套旁路',
        type: DataFieldType.RELATION,
        config: {
          targetTableId,
          multiple: true,
          relationMode: 'TWO_WAY',
          inverseFieldName: 'nested is not a create option',
        },
      }),
    ).rejects.toThrow('inverseFieldName is required');
  });

  it('merges partial client-owned configs and strips forged server-owned keys', async () => {
    const relation = await service.normalizeUpdate(fields.find((item) => item.id === 'relation')!, {
      config: { multiple: false, inverseFieldId: 'forged' },
    });
    expect(relation.config).toEqual({
      targetTableId,
      multiple: false,
      relationMode: 'ONE_WAY',
    });
    const lookup = await service.normalizeUpdate(fields.find((item) => item.id === 'lookup')!, {
      config: { targetFieldId: 'target-name', ast: { forged: true } },
    });
    expect(lookup.config).toEqual({
      relationFieldId: 'relation',
      targetFieldId: 'target-name',
    });
    const rollup = await service.normalizeUpdate(fields.find((item) => item.id === 'rollup')!, {
      config: { aggregation: 'COUNT', dependencies: ['forged'] },
    });
    expect(rollup.config).toEqual({
      relationFieldId: 'relation',
      aggregation: 'COUNT',
    });
    const formula = field(
      'formula-update',
      currentTableId,
      'formulaUpdate',
      DataFieldType.FORMULA,
      {
        expression: '1',
        astVersion: 1,
        dependencies: [],
        ast: { kind: 'literal', value: 1 },
      },
    );
    const normalizedFormula = await service.normalizeUpdate(formula, {
      config: {
        expression: '{amount}',
        astVersion: 999,
        dependencies: ['forged'],
        ast: { kind: 'literal', value: 999 },
      },
    });
    expect(normalizedFormula.config).toEqual({
      expression: '{amount}',
      astVersion: 1,
      dependencies: ['amount'],
      ast: { kind: 'field', fieldId: 'amount' },
    });
  });

  it('rejects immutable type changes and relation changes that invalidate dependents', async () => {
    await expect(
      service.normalizeUpdate(fields.find((item) => item.id === 'amount')!, {
        type: DataFieldType.TEXT,
      }),
    ).rejects.toThrow('Field type cannot be changed');
    await expect(
      service.normalizeUpdate(fields.find((item) => item.id === 'relation')!, {
        config: { targetTableId: currentTableId },
      }),
    ).rejects.toThrow();
  });

  it('preserves only the trusted inverse field id while the two-way target is unchanged', async () => {
    const trusted = fields.find((item) => item.id === 'trusted-relation')!;
    const unchanged = await service.normalizeUpdate(trusted, {
      config: {
        targetTableId,
        multiple: false,
        relationMode: 'TWO_WAY',
        inverseFieldId: 'forged-inverse',
      },
    });
    expect(unchanged.config).toMatchObject({ inverseFieldId: 'trusted-inverse' });

    const switchedMode = await service.normalizeUpdate(trusted, {
      config: { targetTableId, multiple: true, relationMode: 'ONE_WAY' },
    });
    expect(switchedMode.config).not.toHaveProperty('inverseFieldId');

    const changedTarget = await service.normalizeUpdate(trusted, {
      config: {
        targetTableId: currentTableId,
        multiple: true,
        relationMode: 'TWO_WAY',
        inverseFieldId: 'forged-other-target-inverse',
      },
    });
    expect(changedTarget.config).not.toHaveProperty('inverseFieldId');
  });

  it('rejects missing or archived relation targets and malformed relation options', async () => {
    for (const config of [
      { targetTableId: 'missing', multiple: true, relationMode: 'ONE_WAY' },
      { targetTableId, multiple: 'yes', relationMode: 'ONE_WAY' },
      { targetTableId, multiple: true, relationMode: 'OTHER' },
      { targetTableId, multiple: true, relationMode: 'TWO_WAY' },
    ]) {
      await expect(
        service.normalizeCreate(currentTableId, {
          key: 'relation2',
          name: '关系',
          type: DataFieldType.RELATION,
          config,
        }),
      ).rejects.toBeInstanceOf(
        config.targetTableId === 'missing' ? NotFoundException : BadRequestException,
      );
    }
  });

  it('rejects two-way relations targeting a system table', async () => {
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'system',
        name: '系统项目',
        type: DataFieldType.RELATION,
        config: {
          targetTableId: systemTableId,
          multiple: true,
          relationMode: 'TWO_WAY',
          inverseFieldName: '来源',
        },
      }),
    ).rejects.toThrow('Two-way relations require custom tables');
  });

  it('validates lookup ownership, target table, and target type', async () => {
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'projectName',
        name: '项目名称',
        type: DataFieldType.LOOKUP,
        config: { relationFieldId: 'relation', targetFieldId: 'target-name' },
      }),
    ).resolves.toMatchObject({
      config: { relationFieldId: 'relation', targetFieldId: 'target-name' },
      isPrimary: false,
      isRequired: false,
    });

    for (const config of [
      { relationFieldId: 'amount', targetFieldId: 'target-name' },
      { relationFieldId: 'relation', targetFieldId: 'amount' },
      { relationFieldId: 'relation', targetFieldId: 'target-formula' },
      { relationFieldId: 'missing', targetFieldId: 'target-name' },
      { relationFieldId: 'archived-relation', targetFieldId: 'archived-target' },
    ]) {
      await expect(
        service.normalizeCreate(currentTableId, {
          key: 'invalidLookup',
          name: '非法引用',
          type: DataFieldType.LOOKUP,
          config,
        }),
      ).rejects.toThrow();
    }
  });

  it('accepts COUNT without a target and restricts numeric rollups to base NUMBER fields', async () => {
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'count',
        name: '数量',
        type: DataFieldType.ROLLUP,
        config: { relationFieldId: 'relation', aggregation: 'COUNT' },
      }),
    ).resolves.toMatchObject({
      config: { relationFieldId: 'relation', aggregation: 'COUNT' },
    });

    for (const relationFieldId of ['archived-relation', 'missing-target-relation']) {
      await expect(
        service.normalizeCreate(currentTableId, {
          key: `invalidCount${relationFieldId}`,
          name: '失效关系数量',
          type: DataFieldType.ROLLUP,
          config: { relationFieldId, aggregation: 'COUNT' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    }

    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'sum',
        name: '合计',
        type: DataFieldType.ROLLUP,
        config: {
          relationFieldId: 'relation',
          aggregation: 'SUM',
          targetFieldId: 'target-number',
        },
      }),
    ).resolves.toMatchObject({ config: { targetFieldId: 'target-number' } });

    for (const config of [
      { relationFieldId: 'relation', aggregation: 'SUM' },
      { relationFieldId: 'relation', aggregation: 'AVG', targetFieldId: 'target-name' },
      { relationFieldId: 'relation', aggregation: 'MAX', targetFieldId: 'target-formula' },
    ]) {
      await expect(
        service.normalizeCreate(currentTableId, {
          key: 'invalidRollup',
          name: '非法聚合',
          type: DataFieldType.ROLLUP,
          config,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it.each([DataFieldType.LOOKUP, DataFieldType.ROLLUP, DataFieldType.FORMULA])(
    'forbids %s fields from being primary or required',
    async (type) => {
      const config =
        type === DataFieldType.LOOKUP
          ? { relationFieldId: 'relation', targetFieldId: 'target-name' }
          : type === DataFieldType.ROLLUP
            ? { relationFieldId: 'relation', aggregation: 'COUNT' }
            : { expression: '{amount}' };
      await expect(
        service.normalizeCreate(currentTableId, {
          key: `computed${type}`,
          name: '计算字段',
          type,
          config,
          isPrimary: true,
        }),
      ).rejects.toThrow('Computed fields cannot be primary or required');
      await expect(
        service.normalizeCreate(currentTableId, {
          key: `computed${type}`,
          name: '计算字段',
          type,
          config,
          isRequired: true,
        }),
      ).rejects.toThrow('Computed fields cannot be primary or required');
    },
  );

  it('replaces client-owned formula AST and dependencies with parser output', async () => {
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'total',
        name: '总额',
        type: DataFieldType.FORMULA,
        config: {
          expression: '{amount} + 1',
          astVersion: 99,
          dependencies: ['forged'],
          ast: { kind: 'literal', value: 999 },
        },
      }),
    ).resolves.toMatchObject({
      config: {
        expression: '{amount} + 1',
        astVersion: 1,
        dependencies: ['amount'],
        ast: {
          kind: 'binary',
          left: { kind: 'field', fieldId: 'amount' },
        },
      },
    });
  });

  it('rejects unknown formula fields and direct self-dependencies', async () => {
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'broken',
        name: '未知字段',
        type: DataFieldType.FORMULA,
        config: { expression: '{missing}' },
      }),
    ).rejects.toThrow('Unknown field');
    await expect(
      service.normalizeCreate(currentTableId, {
        key: 'self',
        name: '自引用',
        type: DataFieldType.FORMULA,
        config: { expression: '{self} + 1' },
      }),
    ).rejects.toThrow('Circular computed field dependency');
  });

  it('rejects indirect cycles using safe JSON formula configs', async () => {
    fields.push(
      field('formula-a', currentTableId, 'formulaA', DataFieldType.FORMULA, {
        expression: '{formulaB}',
        astVersion: 1,
        dependencies: ['formula-b'],
        ast: { kind: 'field', fieldId: 'formula-b' },
      }),
      field('formula-b', currentTableId, 'formulaB', DataFieldType.FORMULA, {
        expression: '{amount}',
        astVersion: 1,
        dependencies: ['amount'],
        ast: { kind: 'field', fieldId: 'amount' },
      }),
    );

    await expect(
      service.normalizeUpdate(fields.at(-1)!, {
        config: { expression: '{formulaA}' },
      }),
    ).rejects.toThrow('Circular computed field dependency');
  });

  it('previews generated timestamps from a custom record and rejects computed dependencies', async () => {
    await expect(
      service.previewFormula(currentTableId, {
        expression: 'DATE_DIFF({updatedAt}, {createdAt}, "day")',
        recordId: 'record-1',
      }),
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      service.previewFormula(currentTableId, {
        expression: '{projectName}',
        recordId: 'record-1',
      }),
    ).rejects.toThrow('Formula preview does not support computed field dependencies yet');
  });

  it('keeps field keys immutable in the update API', async () => {
    await expect(service.normalizeUpdate(fields[0], { key: 'renamed' } as never)).rejects.toThrow(
      'Field key cannot be changed',
    );
  });

  function field(
    id: string,
    tableId: string,
    key: string,
    type: DataFieldType,
    config: Prisma.JsonValue = {},
  ): Field {
    return {
      id,
      tableId,
      key,
      name: key,
      type,
      config,
      isPrimary: false,
      isRequired: false,
      archivedAt: null,
    };
  }

  function findFirstField(where: Record<string, unknown>): Field | null {
    return (
      fields.find((item) => {
        if ('id' in where && item.id !== where.id) return false;
        if ('tableId' in where && item.tableId !== where.tableId) return false;
        if ('key' in where && item.key !== where.key) return false;
        return !item.archivedAt;
      }) ?? null
    );
  }
});
