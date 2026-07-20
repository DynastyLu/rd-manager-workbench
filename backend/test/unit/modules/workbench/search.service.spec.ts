import { SearchService } from '../../../../src/modules/workbench/search/application/search.service';
import { SearchAdapter } from '../../../../src/modules/workbench/search/domain/search.types';

describe('SearchService', () => {
  const candidate = (id: string, title: string, updatedAt = '2026-07-20T00:00:00.000Z') => ({
    type: 'TASK' as const,
    id,
    title,
    snippet: '研发计划说明',
    path: `/my-work?taskId=${id}`,
    updatedAt: new Date(updatedAt),
    actions: ['OPEN', 'COPY_LINK', 'COMPLETE_TASK'] as const,
  });

  it('normalizes, ranks, groups and paginates candidates from requested adapters', async () => {
    const adapter: SearchAdapter = {
      types: ['TASK'],
      search: jest.fn().mockResolvedValue([
        candidate('2', '年度研发计划'),
        candidate('1', '研发计划', '2026-07-19T00:00:00.000Z'),
      ]),
    };
    const service = new SearchService([adapter]);

    const result = await service.search({ q: '  研发计划 ', types: ['TASK'], page: 1, pageSize: 1 });

    expect(adapter.search).toHaveBeenCalledWith('研发计划', ['TASK']);
    expect(result.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(result.groups).toEqual([{ type: 'TASK', count: 2 }]);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: '1',
        score: 510,
        matches: expect.arrayContaining([
          { field: 'title', start: 0, end: 4 },
          { field: 'snippet', start: 0, end: 4 },
        ]),
      }),
    );
  });

  it('keeps successful results and describes adapter failures without leaking errors', async () => {
    const good: SearchAdapter = {
      types: ['TASK'],
      search: jest.fn().mockResolvedValue([candidate('1', '研发计划')]),
    };
    const bad: SearchAdapter = {
      types: ['PROJECT', 'MEETING'],
      search: jest.fn().mockRejectedValue(new Error('postgres://secret@localhost/database')),
    };
    const service = new SearchService([good, bad]);

    const result = await service.search({ q: '研发计划' });

    expect(result.data).toHaveLength(1);
    expect(result.partialFailures).toEqual([
      {
        types: ['PROJECT', 'MEETING'],
        code: 'SEARCH_PARTIAL_FAILURE',
        message: '部分类型暂时无法搜索，请重试。',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('rejects invalid queries and all-adapter failure with stable errors', async () => {
    const adapter: SearchAdapter = {
      types: ['TASK'],
      search: jest.fn().mockRejectedValue(new Error('connection failed')),
    };
    const service = new SearchService([adapter]);

    await expect(service.search({ q: 'a' })).rejects.toMatchObject({ code: 'SEARCH_QUERY_INVALID' });
    await expect(service.search({ q: '研发' })).rejects.toMatchObject({
      code: 'SEARCH_PARTIAL_FAILURE',
    });
  });

  it('rejects non-local paths returned by an adapter', async () => {
    const adapter: SearchAdapter = {
      types: ['TASK'],
      search: jest.fn().mockResolvedValue([
        { ...candidate('1', '研发计划'), path: '/javascript:alert(1)' },
      ]),
    };
    const service = new SearchService([adapter]);

    await expect(service.search({ q: '研发计划' })).rejects.toMatchObject({
      code: 'SEARCH_PARTIAL_FAILURE',
    });
  });

  it('keeps healthy adapter results when another adapter returns an invalid candidate', async () => {
    const good: SearchAdapter = {
      types: ['TASK'],
      search: jest.fn().mockResolvedValue([candidate('good', '研发计划')]),
    };
    const bad: SearchAdapter = {
      types: ['PROJECT'],
      search: jest.fn().mockResolvedValue([
        { ...candidate('bad', '研发计划'), type: 'PROJECT', path: '/javascript:alert(1)' },
      ]),
    };
    const service = new SearchService([good, bad]);

    const result = await service.search({ q: '研发' });

    expect(result.data.map(({ id }) => id)).toEqual(['good']);
    expect(result.partialFailures).toEqual([
      expect.objectContaining({ types: ['PROJECT'], code: 'SEARCH_PARTIAL_FAILURE' }),
    ]);
  });

  it('scores every adapter fairly before applying per-adapter and global limits', async () => {
    const types = ['PROJECT', 'TASK', 'APPLICATION_CASE', 'DOCUMENT', 'MEETING'] as const;
    const adapters: SearchAdapter[] = types.map((type, adapterIndex) => ({
      types: [type],
      search: jest.fn().mockResolvedValue(
        Array.from({ length: 120 }, (_, index) => ({
          type,
          id: `${adapterIndex}-${index}`,
          title: `研发普通结果 ${adapterIndex}-${index}`,
          snippet: null,
          path: `/search?result=${adapterIndex}-${index}`,
          updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          actions: ['OPEN', 'COPY_LINK'] as const,
        })),
      ),
    }));
    adapters.push({
      types: ['BASE_RECORD'],
      search: jest.fn().mockResolvedValue([
        {
          type: 'BASE_RECORD',
          id: 'best',
          title: '研发',
          snippet: null,
          path: '/base?recordId=best',
          updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          actions: ['OPEN', 'COPY_LINK'] as const,
        },
      ]),
    });
    const service = new SearchService(adapters);

    const result = await service.search({ q: '研发', pageSize: 100 });

    expect(result.meta.total).toBe(500);
    expect(result.data[0]).toMatchObject({ type: 'BASE_RECORD', id: 'best', score: 400 });
    for (const type of types) {
      expect(result.groups.find((group) => group.type === type)?.count).toBeLessThanOrEqual(100);
    }
  });

  it('limits concurrent adapter execution', async () => {
    let active = 0;
    let peak = 0;
    const types = ['PROJECT', 'TASK', 'APPLICATION_CASE', 'DOCUMENT', 'MEETING', 'BASE_RECORD'] as const;
    const adapters: SearchAdapter[] = types.map((type) => ({
      types: [type],
      search: jest.fn().mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active -= 1;
        return [];
      }),
    }));

    await new SearchService(adapters).search({ q: '研发' });

    expect(peak).toBeLessThanOrEqual(2);
    expect(adapters.every((adapter) => (adapter.search as jest.Mock).mock.calls.length === 1)).toBe(
      true,
    );
  });
});
