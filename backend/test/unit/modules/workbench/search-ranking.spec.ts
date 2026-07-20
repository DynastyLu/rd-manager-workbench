import {
  buildSearchSnippet,
  buildSearchMatches,
  compareSearchHits,
  normalizeSearchQuery,
  scoreSearchCandidate,
} from '../../../../src/modules/workbench/search/domain/search-ranking';
import { SearchHit, SearchType } from '../../../../src/modules/workbench/search/domain/search.types';

describe('search ranking', () => {
  it('normalizes surrounding and repeated whitespace while preserving the query text', () => {
    expect(normalizeSearchQuery('  研发\n 计划  ')).toBe('研发 计划');
    expect(() => normalizeSearchQuery('a')).toThrow('Search query must be between 2 and 100 characters');
    expect(() => normalizeSearchQuery('研'.repeat(101))).toThrow(
      'Search query must be between 2 and 100 characters',
    );
  });

  it.each([
    ['研发计划', '研发计划', null, 400],
    ['研发', '研发计划', null, 300],
    ['计划', '年度研发计划', null, 200],
    ['关键', '年度研发计划', '本周关键事项', 100],
    ['计划', '年度研发计划', '计划已进入评审', 310],
  ])('scores query %s against a title and snippet', (query, title, snippet, expected) => {
    expect(scoreSearchCandidate({ query, title, snippet })).toBe(expected);
  });

  it('returns Unicode code-point ranges for Chinese and emoji without generating HTML', () => {
    expect(buildSearchMatches('计划', '研发📌计划与计划')).toEqual([
      { start: 3, end: 5 },
      { start: 6, end: 8 },
    ]);
    expect(buildSearchMatches('<img', '<img src=x onerror=alert(1)>')).toEqual([
      { start: 0, end: 4 },
    ]);
  });

  it('keeps a late Unicode match inside a bounded result snippet', () => {
    const snippet = buildSearchSnippet('命中📌', [
      `${'前'.repeat(300)}命中📌${'后'.repeat(300)}`,
    ]);

    expect(snippet).toContain('命中📌');
    expect(Array.from(snippet ?? '')).toHaveLength(240);
  });

  it('sorts by score, update time, type and id deterministically', () => {
    const hit = (
      id: string,
      score: number,
      updatedAt: string,
      type: SearchType,
    ): SearchHit => ({
      type,
      id,
      title: id,
      snippet: null,
      path: `/#/${id}`,
      updatedAt,
      score,
      matches: [],
      actions: ['OPEN', 'COPY_LINK'],
    });
    const values = [
      hit('b', 100, '2026-07-01T00:00:00.000Z', 'TASK'),
      hit('c', 200, '2026-07-01T00:00:00.000Z', 'TASK'),
      hit('a', 100, '2026-07-02T00:00:00.000Z', 'TASK'),
      hit('a', 100, '2026-07-01T00:00:00.000Z', 'PROJECT'),
    ];

    expect(values.sort(compareSearchHits).map(({ type, id }) => `${type}:${id}`)).toEqual([
      'TASK:c',
      'TASK:a',
      'PROJECT:a',
      'TASK:b',
    ]);
  });
});
