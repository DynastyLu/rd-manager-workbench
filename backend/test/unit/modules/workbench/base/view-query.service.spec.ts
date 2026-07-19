import { BadRequestException } from '@nestjs/common';
import { DataFieldType } from '@prisma/client';
import { UnifiedDataRecord } from '../../../../../src/modules/workbench/base/domain/base.types';
import { ViewQueryService } from '../../../../../src/modules/workbench/base/view-query.service';

describe('ViewQueryService', () => {
  const service = new ViewQueryService();
  const fields = [
    field('title', DataFieldType.TEXT),
    field('score', DataFieldType.NUMBER),
    field('dueAt', DataFieldType.DATETIME),
    field('labels', DataFieldType.MULTI_SELECT),
    field('done', DataFieldType.CHECKBOX),
    field('computed', DataFieldType.FORMULA),
    field('createdAt', DataFieldType.CREATED_AT),
    field('archived_field', DataFieldType.TEXT, new Date('2026-07-01T00:00:00.000Z')),
  ];

  it('converts legacy filters and sorts and enforces configured limits', () => {
    expect(
      service.normalize(fields, {
        query: '研发',
        filterField: 'title',
        filterValue: '工作台',
        sortField: 'score',
        sortOrder: 'desc',
      }),
    ).toMatchObject({
      query: '研发',
      filters: [{ fieldKey: 'title', operator: 'EQ', value: '工作台' }],
      sorts: [{ fieldKey: 'score', direction: 'desc' }],
      page: 1,
      pageSize: 100,
    });

    expect(() =>
      service.normalize(fields, {
        filters: Array.from({ length: 21 }, () => ({
          fieldKey: 'title',
          operator: 'EQ',
          value: 'x',
        })),
      }),
    ).toThrow('A view can contain at most 20 filters');
    expect(() =>
      service.normalize(fields, {
        sorts: Array.from({ length: 6 }, () => ({ fieldKey: 'score', direction: 'asc' })),
      }),
    ).toThrow('A view can contain at most 5 sorts');
  });

  it('validates type-aware operators, rejects computed fields, and ignores missing archived fields', () => {
    expect(() =>
      service.normalize(fields, {
        filters: [{ fieldKey: 'title', operator: 'GT', value: 'a' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.normalize(fields, {
        sorts: [{ fieldKey: 'computed', direction: 'asc' }],
      }),
    ).toThrow('Computed fields cannot be used in saved queries');
    expect(
      service.normalize(fields, {
        filters: [{ fieldKey: 'archived_field', operator: 'EQ', value: 'old' }],
        sorts: [{ fieldKey: 'archived_field', direction: 'asc' }],
      }),
    ).toMatchObject({ filters: [], sorts: [] });
    expect(() =>
      service.normalize(fields, {
        filters: [{ fieldKey: 'never_existed', operator: 'EQ', value: 'old' }],
      }),
    ).toThrow('Unknown view field: never_existed');
    expect(() =>
      service.normalize(fields, {
        filters: [
          { fieldKey: 'labels', operator: 'IN', value: Array.from({ length: 101 }, (_, i) => i) },
        ],
      }),
    ).toThrow('IN filters can contain at most 100 values');
  });

  it('applies search and filters with AND semantics before stable multi-sort and pagination', () => {
    const query = service.normalize(
      fields,
      {
        filters: [
          { fieldKey: 'title', operator: 'CONTAINS', value: '研发' },
          { fieldKey: 'score', operator: 'GTE', value: 80 },
          { fieldKey: 'labels', operator: 'CONTAINS', value: '重点' },
          { fieldKey: 'dueAt', operator: 'BEFORE', value: '2026-08-01T00:00:00.000Z' },
        ],
        sorts: [
          { fieldKey: 'score', direction: 'desc' },
          { fieldKey: 'title', direction: 'asc' },
        ],
      },
      { page: 1, pageSize: 1 },
    );
    const result = service.apply(
      [
        record('a', {
          title: '研发平台',
          score: 90,
          labels: ['重点'],
          dueAt: '2026-07-20T00:00:00.000Z',
        }),
        record('b', {
          title: '研发工具',
          score: 90,
          labels: ['重点'],
          dueAt: '2026-07-21T00:00:00.000Z',
        }),
        record('c', {
          title: '研发低分',
          score: 60,
          labels: ['重点'],
          dueAt: '2026-07-22T00:00:00.000Z',
        }),
        record('d', {
          title: '研发晚期',
          score: 100,
          labels: ['重点'],
          dueAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      query,
    );

    expect(result.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(result.data.map((item) => item.id)).toEqual(['b']);
  });

  it('uses a temporary query override while retaining saved filters and sorts', () => {
    expect(
      service.normalize(
        fields,
        {
          query: 'saved',
          filters: [{ fieldKey: 'done', operator: 'EQ', value: true }],
          sorts: [{ fieldKey: 'score', direction: 'asc' }],
        },
        { query: 'temporary', page: 2, pageSize: 20 },
      ),
    ).toMatchObject({
      query: 'temporary',
      filters: [{ fieldKey: 'done', operator: 'EQ', value: true }],
      sorts: [{ fieldKey: 'score', direction: 'asc' }],
      page: 2,
      pageSize: 20,
    });
  });

  it('normalizes legacy config on save, including checkbox string compatibility', () => {
    expect(
      service.normalizeConfig(fields, {
        filterField: 'done',
        filterValue: 'true',
        sortField: 'score',
        sortOrder: 'desc',
        customFutureKey: { retained: true },
      }),
    ).toEqual({
      filters: [{ fieldKey: 'done', operator: 'EQ', value: true }],
      sorts: [{ fieldKey: 'score', direction: 'desc' }],
      customFutureKey: { retained: true },
    });
  });

  it('rejects computed grouping and computed or non-date Gantt axes', () => {
    expect(() => service.normalizeConfig(fields, { groupField: 'computed' })).toThrow(
      'Computed fields cannot be used in saved queries',
    );
    expect(() =>
      service.normalizeConfig(
        fields,
        { startFieldKey: 'computed', endFieldKey: 'dueAt' },
        'GANTT',
      ),
    ).toThrow('Computed fields cannot be used in saved queries');
    expect(() =>
      service.normalizeConfig(
        fields,
        { startFieldKey: 'score', endFieldKey: 'dueAt' },
        'GANTT',
      ),
    ).toThrow('Gantt axes must use date fields');
    expect(() =>
      service.normalizeConfig(
        fields,
        { startFieldKey: 'createdAt', endFieldKey: 'dueAt' },
        'GANTT',
      ),
    ).toThrow('Gantt axes must use date fields');
  });
});

function field(key: string, type: DataFieldType, archivedAt: Date | null = null) {
  return { key, type, archivedAt };
}

function record(id: string, values: Record<string, unknown>): UnifiedDataRecord {
  const date = new Date('2026-07-19T00:00:00.000Z');
  return {
    id,
    values,
    sourceType: 'CUSTOM',
    sourceId: id,
    sourcePath: `/base/${id}`,
    createdAt: date,
    updatedAt: date,
  };
}
