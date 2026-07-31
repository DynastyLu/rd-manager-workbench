import { createHash } from 'node:crypto';
import { PlatformPrismaService } from '../../../../../src/infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../../src/infrastructure/storage/storage.port';
import { KnowledgeFileService } from '../../../../../src/modules/workbench/knowledge/application/knowledge-file.service';
import { OfficePreviewService } from '../../../../../src/modules/workbench/knowledge/application/office-preview.service';

describe('KnowledgeFileService', () => {
  const requestContext = {
    requirePrincipal: jest.fn().mockReturnValue({ userId: 'user-1', roleCodes: [] }),
  };
  const dataScope = {
    documents: jest.fn().mockReturnValue({}),
  };

  it('reads and verifies an uploaded original file', async () => {
    const content = Buffer.from('original bytes');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const prisma = {
      contentDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'document-1',
          sourceKind: 'UPLOAD',
          originalName: '方案.pdf',
          mimeType: 'application/pdf',
          sourceSha256: sha256,
          fileAssets: [{
            versions: [{
              storageKey: 'knowledge/originals/document-1/version-1',
              originalName: '方案.pdf',
              mimeType: 'application/pdf',
              sha256,
            }],
          }],
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PlatformPrismaService;
    const storage = {
      read: jest.fn().mockResolvedValue({ content, mimeType: 'application/pdf' }),
    } as unknown as StoragePort;
    const officePreview = {} as OfficePreviewService;
    const service = new KnowledgeFileService(prisma, storage, officePreview, requestContext as never, dataScope as never);

    await expect(service.getOriginal('document-1')).resolves.toMatchObject({
      content,
      fileName: '方案.pdf',
      mimeType: 'application/pdf',
      sha256,
    });
  });

  it('returns the original bytes as preview for browser-native file formats', async () => {
    const content = Buffer.from('%PDF');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const prisma = {
      contentDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'document-1',
          sourceKind: 'UPLOAD',
          originalName: '方案.pdf',
          mimeType: 'application/pdf',
          sourceSha256: sha256,
          fileAssets: [{ versions: [{
            storageKey: 'source-key',
            originalName: '方案.pdf',
            mimeType: 'application/pdf',
            sha256,
          }] }],
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PlatformPrismaService;
    const storage = {
      read: jest.fn().mockResolvedValue({ content, mimeType: 'application/pdf' }),
    } as unknown as StoragePort;
    const officePreview = {
      convertToPdf: jest.fn(),
    } as unknown as OfficePreviewService;
    const service = new KnowledgeFileService(prisma, storage, officePreview, requestContext as never, dataScope as never);

    const preview = await service.getPreview('document-1');

    expect(preview).toMatchObject({ content, mimeType: 'application/pdf' });
    expect(officePreview.convertToPdf).not.toHaveBeenCalled();
  });
});
