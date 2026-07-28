import { Prisma } from '@prisma/client';
import {
  buildKnowledgeScopeSql,
  normalizeKnowledgeScope,
} from '../../../../../src/modules/workbench/knowledge/domain/knowledge-scope';

function inspect(sql: Prisma.Sql) {
  return {
    text: sql.strings.join('?').replace(/\s+/g, ' ').trim(),
    values: sql.values,
  };
}

describe('knowledge scope', () => {
  it.each([
    [{ type: 'ALL' as const }, '', []],
    [{ type: 'PROJECT' as const, projectId: 'p1' }, 'cd.project_id = ?', ['p1']],
    [{ type: 'SPACE' as const, spaceId: 's1' }, 'cd.space_id = ?', ['s1']],
    [
      { type: 'FOLDER' as const, folderWatchId: 'f1' },
      'ff.watch_id = ?',
      ['f1'],
    ],
    [
      { type: 'DOCUMENTS' as const, documentIds: ['d1', 'd1', 'd2'] },
      'cd.id IN (?,?)',
      ['d1', 'd2'],
    ],
    [{ type: 'RECENT' as const }, "INTERVAL '30 days'", []],
  ])('builds a bound filter for %o', (scope, expectedText, expectedValues) => {
    const query = inspect(buildKnowledgeScopeSql(normalizeKnowledgeScope(scope)));
    expect(query.text).toContain(expectedText);
    expect(query.values).toEqual(expectedValues);
  });
});
