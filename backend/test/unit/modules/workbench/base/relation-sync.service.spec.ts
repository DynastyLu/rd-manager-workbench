import {
  RelationSyncService,
  stableSortedUniqueIds,
} from '../../../../../src/modules/workbench/base/relation-sync.service';

describe('stableSortedUniqueIds', () => {
  it('returns deterministic lexical order without duplicates or input mutation', () => {
    const ids = ['record-z', 'record-a', 'record-m', 'record-a', 'record-z'];
    const snapshot = [...ids];

    expect(stableSortedUniqueIds(ids)).toEqual(['record-a', 'record-m', 'record-z']);
    expect(ids).toEqual(snapshot);
  });

  it('orders table ids with the same deterministic rule used by record locks', () => {
    expect(stableSortedUniqueIds(['table-b', 'table-a', 'table-b'])).toEqual([
      'table-a',
      'table-b',
    ]);
  });

  it('acquires table advisory locks in sorted unique key order', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const service = new RelationSyncService();

    await service.lockTableConfigs({ $executeRaw: executeRaw } as never, [
      'table-b',
      'table-a',
      'table-b',
    ]);

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.calls.map(([query]) => query.values[0])).toEqual([
      'rd-manager-workbench:data-field-config:table-a',
      'rd-manager-workbench:data-field-config:table-b',
    ]);
  });
});
