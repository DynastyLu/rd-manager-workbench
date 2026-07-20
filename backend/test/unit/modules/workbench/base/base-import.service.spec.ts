import { BadRequestException } from '@nestjs/common';
import { BaseImportService } from '../../../../../src/modules/workbench/base/import/base-import.service';
import { createHash } from 'node:crypto';

describe('BaseImportService', () => {
  it('uploads only into custom tables and never exposes storage keys', async () => {
    const prisma = {
      dataTable: { findFirst: jest.fn().mockResolvedValue({ id: 'table', source: 'CUSTOM' }) },
      dataImportSession: {
        create: jest.fn().mockImplementation(({ data }) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
      },
    };
    const storage = { write: jest.fn(), delete: jest.fn() };
    const parser = { parse: jest.fn().mockResolvedValue({ sheetNames: ['CSV'], selectedSheet: 'CSV', columns: ['标题'], inferredTypes: { 标题: 'TEXT' }, rows: [] }) };
    const service = new BaseImportService(prisma as never, storage as never, parser as never, {} as never, {} as never);
    const result = await service.upload('table', { originalname: '../危险.csv', mimetype: 'text/csv', size: 10, buffer: Buffer.from('标题\n') });
    expect(result.session.originalName).toBe('危险.csv');
    expect(result.session).not.toHaveProperty('sourceStorageKey');
    expect(storage.write).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringMatching(/^imports\/.+\/source\.csv$/) }));
  });

  it('rejects uploads to preset tables', async () => {
    const prisma = { dataTable: { findFirst: jest.fn().mockResolvedValue({ id: 'table', source: 'PROJECTS' }) } };
    const service = new BaseImportService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.upload('table', { originalname: 'a.csv', mimetype: 'text/csv', size: 1, buffer: Buffer.from('a') })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a claimed session failed when source parsing cannot start', async () => {
    const mapping = [{ sourceColumn: '标题', targetFieldId: 'title' }];
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ sheet: 'CSV', mapping }))
      .digest('hex');
    const prisma = {
      dataImportSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session', tableId: 'table', originalName: 'a.csv', selectedSheet: 'CSV',
          status: 'PREVIEWED', mapping, previewFingerprint: fingerprint,
          sourceStorageKey: 'imports/session/source.csv', errorStorageKey: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const storage = { read: jest.fn().mockRejectedValue(new Error('disk unavailable')) };
    const service = new BaseImportService(prisma as never, storage as never, {} as never, {} as never, {} as never);
    await expect(service.commit('session')).rejects.toThrow('disk unavailable');
    expect(prisma.dataImportSession.update).toHaveBeenCalledWith({
      where: { id: 'session' }, data: { status: 'FAILED' },
    });
  });
});
