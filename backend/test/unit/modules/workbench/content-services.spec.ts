import { createHash } from 'node:crypto';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { DocumentsService } from '../../../../src/modules/workbench/content/application/documents.service';
import { FilesService } from '../../../../src/modules/workbench/content/application/files.service';

const mockPrincipal = { userId: 'user-1', roleCodes: [] } as any;
const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue(mockPrincipal),
} as unknown as RequestContextService;
const mockDataScope = {
  documents: jest.fn().mockReturnValue({}),
  projects: jest.fn().mockReturnValue({}),
  meetings: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

describe('content service guards', () => {
  it('rejects version history for a missing document', async () => {
    const prisma = {
      contentDocument: { findUnique: jest.fn().mockResolvedValue(null) },
      documentVersion: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PlatformPrismaService;
    const service = new DocumentsService(prisma, {} as StoragePort, mockRequestContext, mockDataScope);

    await expect(service.listVersions('missing-document')).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('rejects a download when local bytes no longer match the persisted SHA-256', async () => {
    const expected = Buffer.from('expected-content');
    const prisma = {
      fileAsset: {
        findFirst: jest.fn().mockResolvedValue({ id: 'file-1', status: 'ACTIVE' }),
        count: jest.fn().mockResolvedValue(1),
      },
      fileVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'version-1',
          fileAssetId: 'file-1',
          storageKey: 'files/file-1/version-1',
          sha256: createHash('sha256').update(expected).digest('hex'),
        }),
      },
    } as unknown as PlatformPrismaService;
    const storage = {
      read: jest.fn().mockResolvedValue({
        content: Buffer.from('corrupted-content'),
        mimeType: 'application/octet-stream',
      }),
    } as unknown as StoragePort;
    const service = new FilesService(prisma, storage, mockRequestContext, mockDataScope);

    await expect(service.download('file-1')).rejects.toMatchObject({
      code: 'FILE_INTEGRITY_FAILED',
      statusCode: 409,
    });
  });
});
