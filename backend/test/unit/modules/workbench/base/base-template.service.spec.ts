import { BaseTemplateService } from '../../../../../src/modules/workbench/base/templates/base-template.service';

describe('BaseTemplateService', () => {
  it('returns summaries and calculates collision-free names in one transaction', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      dataWorkspace: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace' }) },
      dataTable: {
        findMany: jest.fn().mockResolvedValue([{ name: '风险台账' }, { name: '风险台账 2' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'projects-table' }),
        create: jest.fn().mockResolvedValue({ id: 'created', name: '风险台账 3', records: [], fields: [], views: [] }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BaseTemplateService(prisma as never);
    expect(service.list()).toHaveLength(5);
    const created = await service.instantiate('workspace', 'risk-register', {});
    expect(created).toMatchObject({ id: 'created', name: '风险台账 3' });
    expect(tx.dataTable.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ source: 'CUSTOM', presetKey: null }),
    }));
  });
});
