import { DataFieldType, DataTableSource, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../../src/infrastructure/prisma/platform-prisma.service';
import { SystemRecordsAdapter } from '../../../../../src/modules/workbench/base/adapters/system-records.adapter';
import { ComputedFieldResolver } from '../../../../../src/modules/workbench/base/computed-field-resolver.service';
import { UnifiedDataRecord } from '../../../../../src/modules/workbench/base/domain/base.types';

type Field = {
  id: string;
  tableId: string;
  key: string;
  name: string;
  type: DataFieldType;
  config: Prisma.JsonValue;
  isPrimary: boolean;
  isRequired: boolean;
  sequence: number;
  archivedAt: Date | null;
};

describe('ComputedFieldResolver', () => {
  const sourceTableId = 'source-table';
  const targetTableId = 'target-table';
  const systemTableId = 'system-table';
  const createdAt = new Date('2026-07-19T08:00:00.000Z');
  let fields: Field[];
  let targetRecords: UnifiedDataRecord[];
  let prisma: {
    dataTable: { findFirst: jest.Mock; findMany: jest.Mock };
    dataField: { findMany: jest.Mock };
    dataRecord: { findMany: jest.Mock };
  };
  let systemRecords: { findByIds: jest.Mock };
  let resolver: ComputedFieldResolver;

  beforeEach(() => {
    fields = [
      field('title', sourceTableId, 'title', DataFieldType.TEXT),
      field('amount', sourceTableId, 'amount', DataFieldType.NUMBER),
      field('created', sourceTableId, 'createdAt', DataFieldType.CREATED_AT),
      field('relation', sourceTableId, 'projects', DataFieldType.RELATION, {
        targetTableId,
        multiple: true,
        relationMode: 'ONE_WAY',
      }),
      field('target-title', targetTableId, 'title', DataFieldType.TEXT),
      field('target-score', targetTableId, 'score', DataFieldType.NUMBER),
    ];
    targetRecords = [
      record('target-a', targetTableId, { title: '甲', score: 80 }),
      record('target-b', targetTableId, { title: '乙', score: 100 }),
      record('target-null', targetTableId, { title: '空', score: null }),
    ];
    prisma = {
      dataTable: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === sourceTableId
              ? { id: sourceTableId, source: DataTableSource.CUSTOM, archivedAt: null }
              : null,
          ),
        ),
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            where.id.in.flatMap<{
              id: string;
              source: DataTableSource;
              archivedAt: Date | null;
            }>((id) => {
              if (id === targetTableId)
                return [{ id, source: DataTableSource.CUSTOM, archivedAt: null }];
              if (id === systemTableId)
                return [{ id, source: DataTableSource.PROJECTS, archivedAt: null }];
              return [];
            }),
          ),
        ),
      },
      dataField: {
        findMany: jest.fn(({ where }: { where: { tableId: string | { in: string[] } } }) => {
          const ids = typeof where.tableId === 'string' ? [where.tableId] : where.tableId.in;
          return Promise.resolve(fields.filter((item) => ids.includes(item.tableId)));
        }),
      },
      dataRecord: {
        findMany: jest.fn(({ where }: { where: { tableId: string; id: { in: string[] } } }) =>
          Promise.resolve(
            targetRecords
              .filter((item) => where.tableId === targetTableId && where.id.in.includes(item.id))
              .map((item) => ({
                id: item.id,
                tableId: targetTableId,
                values: item.values,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              })),
          ),
        ),
      },
    };
    systemRecords = { findByIds: jest.fn().mockResolvedValue([]) };
    resolver = new ComputedFieldResolver(
      prisma as unknown as PlatformPrismaService,
      systemRecords as unknown as SystemRecordsAdapter,
    );
  });

  it('preserves multi-lookup relation order and loads a target table only once per resolve call', async () => {
    fields.push(
      field('lookup-title', sourceTableId, 'projectNames', DataFieldType.LOOKUP, {
        relationFieldId: 'relation',
        targetFieldId: 'target-title',
      }),
      field('lookup-score', sourceTableId, 'projectScores', DataFieldType.LOOKUP, {
        relationFieldId: 'relation',
        targetFieldId: 'target-score',
      }),
    );

    const resolved = await resolver.resolve(sourceTableId, [
      record('source-a', sourceTableId, {
        title: '候选人',
        projects: ['target-b', 'target-a'],
      }),
      record('source-b', sourceTableId, { title: '候选人 2', projects: ['target-a'] }),
    ]);

    expect(resolved[0].values).toMatchObject({
      projectNames: ['乙', '甲'],
      projectScores: [100, 80],
    });
    expect(resolved[1].values.projectNames).toEqual(['甲']);
    expect(prisma.dataRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dataRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tableId: targetTableId, id: { in: ['target-a', 'target-b'] } },
      }),
    );
  });

  it('computes COUNT, SUM, AVG, MIN, and MAX with the specified empty-set semantics', async () => {
    for (const aggregation of ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const) {
      fields.push(
        field(
          `rollup-${aggregation}`,
          sourceTableId,
          aggregation.toLowerCase(),
          DataFieldType.ROLLUP,
          {
            relationFieldId: 'relation',
            ...(aggregation === 'COUNT' ? {} : { targetFieldId: 'target-score' }),
            aggregation,
          },
        ),
      );
    }

    const [filled, empty] = await resolver.resolve(sourceTableId, [
      record('source-filled', sourceTableId, {
        projects: ['target-a', 'target-null', 'target-b'],
      }),
      record('source-empty', sourceTableId, { projects: [] }),
    ]);

    expect(filled.values).toMatchObject({ count: 3, sum: 180, avg: 90, min: 80, max: 100 });
    expect(empty.values).toMatchObject({ count: 0, sum: 0, avg: null, min: null, max: null });

    targetRecords[0].values.score = 'not-a-number';
    const [invalid] = await resolver.resolve(sourceTableId, [
      record('source-invalid', sourceTableId, { projects: ['target-a'] }),
    ]);
    expect(invalid.values.sum).toBeNull();
    expect(invalid.computedErrors?.sum).toMatchObject({ code: 'TYPE_ERROR' });
  });

  it('evaluates formulas after lookups and rollups in dependency order with generated fields', async () => {
    fields.push(
      field('rollup-avg', sourceTableId, 'average', DataFieldType.ROLLUP, {
        relationFieldId: 'relation',
        targetFieldId: 'target-score',
        aggregation: 'AVG',
      }),
      field('formula-grade', sourceTableId, 'grade', DataFieldType.FORMULA, {
        expression: 'IF({average} >= 90, "A", "B")',
        astVersion: 1,
        dependencies: ['rollup-avg'],
        ast: {
          kind: 'call',
          name: 'IF',
          args: [
            {
              kind: 'binary',
              operator: '>=',
              left: { kind: 'field', fieldId: 'rollup-avg' },
              right: { kind: 'literal', value: 90 },
            },
            { kind: 'literal', value: 'A' },
            { kind: 'literal', value: 'B' },
          ],
        },
      }),
      field('formula-label', sourceTableId, 'label', DataFieldType.FORMULA, {
        expression: 'CONCAT({grade}, {createdAt})',
        astVersion: 1,
        dependencies: ['formula-grade', 'created'],
        ast: {
          kind: 'call',
          name: 'CONCAT',
          args: [
            { kind: 'field', fieldId: 'formula-grade' },
            { kind: 'field', fieldId: 'created' },
          ],
        },
      }),
    );

    const [resolved] = await resolver.resolve(sourceTableId, [
      record('source', sourceTableId, {
        projects: ['target-a', 'target-b'],
        createdAt: createdAt.toISOString(),
      }),
    ]);

    expect(resolved.values).toMatchObject({
      average: 90,
      grade: 'A',
      label: `A${createdAt.toISOString()}`,
    });
  });

  it('isolates missing targets, division by zero, malformed configs, and defensive cycles per field', async () => {
    fields.push(
      field('lookup-title', sourceTableId, 'projectNames', DataFieldType.LOOKUP, {
        relationFieldId: 'relation',
        targetFieldId: 'target-title',
      }),
      field('formula-div', sourceTableId, 'division', DataFieldType.FORMULA, {
        expression: '1 / 0',
        astVersion: 1,
        dependencies: [],
        ast: {
          kind: 'binary',
          operator: '/',
          left: { kind: 'literal', value: 1 },
          right: { kind: 'literal', value: 0 },
        },
      }),
      field('formula-a', sourceTableId, 'formulaA', DataFieldType.FORMULA, {
        expression: '{formulaB}',
        astVersion: 1,
        dependencies: [],
        ast: { kind: 'field', fieldId: 'formula-b' },
      }),
      field('formula-b', sourceTableId, 'formulaB', DataFieldType.FORMULA, {
        expression: '{formulaA}',
        astVersion: 1,
        dependencies: [],
        ast: { kind: 'field', fieldId: 'formula-a' },
      }),
      field('formula-broken', sourceTableId, 'broken', DataFieldType.FORMULA, {
        expression: 'broken',
        astVersion: 1,
        dependencies: [],
        ast: { forged: true },
      }),
      field('formula-missing', sourceTableId, 'missingField', DataFieldType.FORMULA, {
        expression: '{archived}',
        astVersion: 1,
        dependencies: ['archived-field'],
        ast: { kind: 'field', fieldId: 'archived-field' },
      }),
      field('missing-relation', sourceTableId, 'missingProjects', DataFieldType.RELATION, {
        targetTableId: 'archived-table',
        multiple: true,
        relationMode: 'ONE_WAY',
      }),
      field('missing-count', sourceTableId, 'missingCount', DataFieldType.ROLLUP, {
        relationFieldId: 'missing-relation',
        aggregation: 'COUNT',
      }),
    );

    const [resolved] = await resolver.resolve(sourceTableId, [
      record('source', sourceTableId, { projects: ['target-a', 'missing-target'] }),
    ]);

    expect(resolved.values).toMatchObject({
      projectNames: ['甲', null],
      division: null,
      formulaA: null,
      formulaB: null,
      broken: null,
      missingField: null,
      missingCount: null,
    });
    expect(resolved.computedErrors).toMatchObject({
      projectNames: { code: 'MISSING_TARGET' },
      division: { code: 'DIV_ZERO' },
      formulaA: { code: 'CYCLE' },
      formulaB: { code: 'CYCLE' },
      broken: { code: 'INVALID_FORMULA' },
      missingField: { code: 'INVALID_FORMULA' },
      missingCount: { code: 'MISSING_TARGET' },
    });
  });

  it('loads system preset targets through the system adapter and keeps source relation order', async () => {
    fields.push(
      field('system-relation', sourceTableId, 'systemProjects', DataFieldType.RELATION, {
        targetTableId: systemTableId,
        multiple: true,
        relationMode: 'ONE_WAY',
      }),
      field('system-name', systemTableId, 'name', DataFieldType.TEXT),
      field('system-lookup', sourceTableId, 'systemProjectNames', DataFieldType.LOOKUP, {
        relationFieldId: 'system-relation',
        targetFieldId: 'system-name',
      }),
    );
    systemRecords.findByIds.mockResolvedValue([
      record('project-1', systemTableId, { name: '系统项目一' }),
      record('project-2', systemTableId, { name: '系统项目二' }),
    ]);

    const [resolved] = await resolver.resolve(sourceTableId, [
      record('source', sourceTableId, { systemProjects: ['project-2', 'project-1'] }),
    ]);

    expect(resolved.values.systemProjectNames).toEqual(['系统项目二', '系统项目一']);
    expect(systemRecords.findByIds).toHaveBeenCalledTimes(1);
    expect(systemRecords.findByIds).toHaveBeenCalledWith(DataTableSource.PROJECTS, [
      'project-1',
      'project-2',
    ]);
    expect(prisma.dataRecord.findMany).not.toHaveBeenCalled();
  });
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
    sequence: 0,
    archivedAt: null,
  };
}

function record(id: string, tableId: string, values: Record<string, unknown>): UnifiedDataRecord {
  return {
    id,
    values,
    sourceType: 'CUSTOM',
    sourceId: id,
    sourcePath: `/base?tableId=${tableId}&recordId=${id}`,
    createdAt: new Date('2026-07-19T08:00:00.000Z'),
    updatedAt: new Date('2026-07-19T09:00:00.000Z'),
  };
}
