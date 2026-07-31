import { createHash } from 'node:crypto';
import { PlatformPrismaService } from '../../../../../src/infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../../src/infrastructure/context/request-context.service';
import { StoragePort } from '../../../../../src/infrastructure/storage/storage.port';
import { DocumentImportService } from '../../../../../src/modules/workbench/knowledge/application/document-import.service';
import { IndexingService } from '../../../../../src/modules/workbench/knowledge/application/indexing.service';
import { KnowledgeIngestionService } from '../../../../../src/modules/workbench/knowledge/application/knowledge-ingestion.service';

const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue({
    userId: 'user-1',
    employeeId: 'employee-1',
    username: 'tester',
    sessionId: 'session-1',
    roleCodes: ['EMPLOYEE'],
    permissions: [],
    permissionVersion: 1,
    mustChangePassword: false,
  }),
} as unknown as RequestContextService;

describe('KnowledgeIngestionService', () => {
  it('persists the original upload and returns metadata without exposing extracted full text', async () => {
    const content = Buffer.from('研发文档原始内容');
    const created = {
      id: 'document-1',
      title: '研发计划',
      originalName: '研发计划.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: content.length,
      sourceSha256: createHash('sha256').update(content).digest('hex'),
      sourceKind: 'UPLOAD',
      previewStatus: 'PENDING',
      indexStatus: 'PENDING',
    };
    const tx = {
      contentDocument: {
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      contentDocument: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PlatformPrismaService;
    const storage = {
      write: jest.fn().mockResolvedValue({
        storageKey: 'knowledge/originals/document-1/version-1',
        size: content.length,
      }),
      delete: jest.fn(),
    } as unknown as StoragePort;
    const importer = {
      extract: jest.fn().mockResolvedValue({
        title: '研发计划',
        plainText: '这里是完整抽取文本，不应出现在上传响应中',
        wordCount: 18,
      }),
    } as unknown as DocumentImportService;
    const indexing = {
      indexDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as IndexingService;
    const service = new KnowledgeIngestionService(prisma, storage, importer, indexing, mockRequestContext);

    const response = await service.upload({
      originalname: '研发计划.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: content.length,
      buffer: content,
    });

    expect(storage.write).toHaveBeenCalledWith(expect.objectContaining({ content }));
    expect(tx.contentDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceKind: 'UPLOAD',
        originalName: '研发计划.docx',
        sourceSha256: created.sourceSha256,
        fileAssets: {
          create: expect.objectContaining({
            versions: {
              create: expect.objectContaining({
                originalName: '研发计划.docx',
                sha256: created.sourceSha256,
              }),
            },
          }),
        },
      }),
      select: expect.any(Object),
    });
    expect(response).toMatchObject({
      documentId: 'document-1',
      originalName: '研发计划.docx',
      processing: {
        preview: 'PENDING',
        index: 'PENDING',
      },
    });
    expect(response).not.toHaveProperty('plainText');
    expect(response).not.toHaveProperty('plainTextPreview');
  });
});
