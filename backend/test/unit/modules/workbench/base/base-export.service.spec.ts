import { PassThrough } from 'node:stream';
import { RequestContextService } from '../../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../../src/modules/iam/application/data-scope.service';
import { BaseExportService } from '../../../../../src/modules/workbench/base/export/base-export.service';

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

const createService = (prisma: unknown, base: unknown) =>
  new BaseExportService(prisma as never, mockRequestContext, mockDataScope, base as never);

describe('BaseExportService', () => {
  it('exports every page with BOM, safe cells and view-visible fields', async () => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    const prisma = {
      dataTable: { findFirst: jest.fn().mockResolvedValue({ id: 'table', name: '测试/表', fields: [
        { id: 'title', key: 'title', name: '标题', type: 'TEXT', sequence: 0, archivedAt: null },
        { id: 'date', key: 'date', name: '日期', type: 'DATETIME', sequence: 1, archivedAt: null },
        { id: 'hidden', key: 'hidden', name: '隐藏', type: 'TEXT', sequence: 2, archivedAt: null },
      ] }) },
      dataView: { findFirst: jest.fn().mockResolvedValue({ id: 'view', tableId: 'table', name: '当前', config: { hiddenFieldIds: ['hidden'] } }) },
    };
    const base = { listRecords: jest
      .fn()
      .mockResolvedValueOnce({ data: [{ id: '1', values: { title: '=cmd', date: '2026-07-20T08:30:00.000Z', hidden: 'x' } }], meta: { page: 1, pageSize: 500, total: 501 } })
      .mockImplementationOnce(async () => {
        expect(Buffer.concat(chunks).toString('utf8')).toContain("'=cmd");
        return { data: [{ id: '2', values: { title: '第二条', hidden: 'y' } }], meta: { page: 2, pageSize: 500, total: 2 } };
      }) };
    const service = createService(prisma, base);
    const result = await service.create('table', { format: 'csv', scope: 'view', viewId: 'view' });
    await result.writeTo(output);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('第二条');
    expect(csv).not.toContain('2026-07-20T08:30:00.000Z');
    expect(csv).not.toContain('隐藏');
    expect(result.fileName).not.toContain('/');
  });

  it('streams a complete XLSX archive', async () => {
    const prisma = {
      dataTable: { findFirst: jest.fn().mockResolvedValue({ id: 'table', name: '测试表', fields: [
        { id: 'title', key: 'title', name: '标题', type: 'TEXT', sequence: 0, archivedAt: null },
      ] }) },
    };
    const base = { listRecords: jest.fn().mockResolvedValue({
      data: [{ id: '1', values: { title: '演示' } }], meta: { page: 1, pageSize: 500, total: 1 },
    }) };
    const service = createService(prisma, base);
    const result = await service.create('table', { format: 'xlsx', scope: 'all' });
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    await result.writeTo(output);
    const archive = Buffer.concat(chunks);
    expect(archive.subarray(0, 2).toString()).toBe('PK');
    expect(archive.length).toBeGreaterThan(1000);
  });
});
