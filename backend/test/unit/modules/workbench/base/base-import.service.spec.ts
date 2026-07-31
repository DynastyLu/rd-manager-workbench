import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RequestContextService } from '../../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../../src/modules/iam/application/data-scope.service';
import { BaseImportService } from '../../../../../src/modules/workbench/base/import/base-import.service';

const mockPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'tester',
  sessionId: 'session-1',
  roleCodes: ['EMPLOYEE'],
  permissions: [],
  permissionVersion: 1,
  mustChangePassword: false,
};
const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue(mockPrincipal),
} as unknown as RequestContextService;
const mockDataScope = {
  baseTables: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

const createService = (
  prisma: unknown,
  storage: unknown,
  parser: unknown,
  converter: unknown = {} as never,
  relationSync: unknown = {} as never,
) =>
  new BaseImportService(
    prisma as never,
    mockRequestContext,
    mockDataScope,
    storage as never,
    parser as never,
    converter as never,
    relationSync as never,
  );

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
    const service = createService(prisma, storage, parser, {} as never, {} as never);
    const result = await service.upload('table', { originalname: '../危险.csv', mimetype: 'text/csv', size: 10, buffer: Buffer.from('标题\n') });
    expect(result.session.originalName).toBe('危险.csv');
    expect(result.session).not.toHaveProperty('sourceStorageKey');
    expect(storage.write).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringMatching(/^imports\/.+\/source\.csv$/) }));
  });

  it('rejects uploads to preset tables', async () => {
    const prisma = { dataTable: { findFirst: jest.fn().mockResolvedValue({ id: 'table', source: 'PROJECTS' }) } };
    const service = createService(prisma, {} as never, {} as never, {} as never, {} as never);
    await expect(service.upload('table', { originalname: 'a.csv', mimetype: 'text/csv', size: 1, buffer: Buffer.from('a') })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a claimed session failed when source parsing cannot start', async () => {
    const mapping = [{ sourceColumn: '标题', targetFieldId: 'title' }];
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ sheet: 'CSV', mapping }))
      .digest('hex');
    const prisma = {
      dataTable: { findFirst: jest.fn().mockResolvedValue({ id: 'table', source: 'CUSTOM' }) },
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
    const service = createService(prisma, storage, {} as never, {} as never, {} as never);
    await expect(service.commit('session')).rejects.toThrow('disk unavailable');
    expect(prisma.dataImportSession.update).toHaveBeenCalledWith({
      where: { id: 'session' }, data: { status: 'FAILED' },
    });
  });
});
