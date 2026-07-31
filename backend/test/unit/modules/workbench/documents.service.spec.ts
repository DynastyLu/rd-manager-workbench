import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../src/infrastructure/storage/storage.port';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { DocumentsService } from '../../../../src/modules/workbench/content/application/documents.service';

const mockPrincipal = { userId: 'user-1', roleCodes: [] } as any;
const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue(mockPrincipal),
} as unknown as RequestContextService;
const mockDataScope = {
  documents: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

function buildDocumentsService(prisma: PlatformPrismaService, storage: StoragePort) {
  return new DocumentsService(prisma, storage, mockRequestContext, mockDataScope);
}

type TrashedDocument = {
  id: string;
  status: 'TRASHED';
  sourceKind: 'UPLOAD' | 'LOCAL_FILE';
  previewStorageKey: string | null;
  fileAssets: Array<{
    id: string;
    versions: Array<{ storageKey: string }>;
  }>;
  folderFiles: Array<{ filePath: string }>;
};

function deletionJournal(documentId: string, sourceKey: string) {
  const digest = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const stagedKey = `trash/documents/${digest(`${documentId}\0${sourceKey}`)}`;
  const journalKey = `trash/journals/${digest(documentId)}.json`;
  return {
    stagedKey,
    journalKey,
    content: Buffer.from(
      JSON.stringify({
        version: 1,
        documentId,
        entries: [{ sourceKey, stagedKey }],
      }),
    ),
  };
}

function createPersistentStorage(initialEntries: Array<[string, Buffer]>) {
  const entries = new Map(initialEntries);
  const missing = (key: string) =>
    Object.assign(new Error(`Missing storage entry: ${key}`), { code: 'ENOENT' });
  const storage = {
    read: jest.fn(async (key: string) => {
      const content = entries.get(key);
      if (!content) throw missing(key);
      return { content, mimeType: 'application/json' };
    }),
    write: jest.fn(async ({ key, content }: { key: string; content: Buffer }) => {
      entries.set(key, content);
      return { storageKey: key, size: content.length };
    }),
    rename: jest.fn(async (sourceKey: string, destinationKey: string) => {
      const content = entries.get(sourceKey);
      if (!content) throw missing(sourceKey);
      entries.set(destinationKey, content);
      entries.delete(sourceKey);
    }),
    delete: jest.fn(async (key: string) => {
      entries.delete(key);
    }),
    stat: jest.fn(async (key: string) => {
      const content = entries.get(key);
      if (!content) throw missing(key);
      return {
        key,
        byteSize: content.length,
        modifiedAt: new Date(0),
        kind: 'FILE' as const,
      };
    }),
    walk: jest.fn(async (prefix = '') =>
      [...entries.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, content]) => ({
          key,
          byteSize: content.length,
          modifiedAt: new Date(0),
          kind: 'FILE' as const,
        })),
    ),
  } as unknown as StoragePort;
  return { storage, entries };
}

function createTransactionClient() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'document', status: 'TRASHED' }]),
    folderFile: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentChunk: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentVersion: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    fileVersion: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    fileAsset: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve({ count: where.id.in.length }),
      ),
    },
    contentDocument: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'document',
        status: 'TRASHED',
        previewStorageKey: null,
        fileAssets: [],
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'document',
        status: 'TRASHED',
        previewStorageKey: null,
      }),
      findFirst: jest.fn().mockResolvedValue({ id: 'document' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function createService(documents: TrashedDocument[]) {
  const transactionClient = createTransactionClient();
  const deletedDocumentIds = new Set<string>();
  transactionClient.$queryRaw.mockImplementation(
    (_query: TemplateStringsArray, recordId: string) => {
      const document = documents.find((item) => item.id === recordId);
      if (document) {
        return Promise.resolve([{ id: document.id, status: document.status }]);
      }
      const assetOwner = documents.find((item) =>
        item.fileAssets.some((asset) => asset.id === recordId),
      );
      return Promise.resolve(
        assetOwner ? [{ id: recordId, documentId: assetOwner.id }] : [],
      );
    },
  );
  transactionClient.contentDocument.findUniqueOrThrow.mockImplementation(
    ({ where }: { where: { id: string } }) =>
      Promise.resolve(
        deletedDocumentIds.has(where.id)
          ? null
          : documents.find((document) => document.id === where.id) ?? null,
      ),
  );
  transactionClient.contentDocument.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) =>
      Promise.resolve(
        deletedDocumentIds.has(where.id)
          ? null
          : documents.find((document) => document.id === where.id) ?? null,
      ),
  );
  transactionClient.contentDocument.deleteMany.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      deletedDocumentIds.add(where.id);
      return { count: 1 };
    },
  );
  const prisma = {
    contentDocument: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(documents.find((document) => document.id === where.id) ?? null),
      ),
      findMany: jest.fn().mockResolvedValue(documents.map(({ id }) => ({ id }))),
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(documents.find((document) => document.id === where.id) ?? null),
      ),
    },
    $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    ),
  } as unknown as PlatformPrismaService;
  const storedFiles: Array<[string, Buffer]> = [];
  for (const document of documents) {
    for (const asset of document.fileAssets) {
      for (const version of asset.versions) {
        storedFiles.push([version.storageKey, Buffer.from(version.storageKey)]);
      }
    }
    if (document.previewStorageKey) {
      storedFiles.push([
        document.previewStorageKey,
        Buffer.from(document.previewStorageKey),
      ]);
    }
  }
  const { storage } = createPersistentStorage(storedFiles);
  const service = buildDocumentsService(prisma, storage);
  return { service, prisma, storage, transactionClient };
}

function stageRenameCalls(storage: StoragePort): Array<[string, string]> {
  return (storage.rename as jest.Mock).mock.calls.filter(
    ([, destinationKey]: [string, string]) =>
      destinationKey.startsWith('trash/documents/'),
  );
}

function stagedDeleteCalls(storage: StoragePort): string[] {
  return (storage.delete as jest.Mock).mock.calls
    .map(([key]: [string]) => key)
    .filter((key: string) => key.startsWith('trash/documents/'));
}

function createRecoveryPrisma(document: unknown): PlatformPrismaService {
  const tx = createTransactionClient();
  tx.contentDocument.findUnique.mockResolvedValue(document);
  return {
    contentDocument: {
      findFirst: jest.fn().mockResolvedValue(document),
      findUnique: jest.fn().mockResolvedValue(document),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    ),
  } as unknown as PlatformPrismaService;
}

describe('DocumentsService permanent deletion', () => {
  it('serializes recovery across two service instances while a deletion is staged', async () => {
    const document: TrashedDocument = {
      id: 'document-cross-process-lock',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-cross-process-lock',
          versions: [{ storageKey: 'knowledge/originals/cross-process-lock/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const sourceKey = document.fileAssets[0].versions[0].storageKey;
    const { storage, entries } = createPersistentStorage([
      [sourceKey, Buffer.from('cross-process bytes')],
    ]);

    let documentExists = true;
    let advisoryTail = Promise.resolve();
    const createPrisma = () => {
      const tx = createTransactionClient();
      let releaseAdvisory: (() => void) | undefined;
      tx.$executeRaw = jest.fn(async () => {
        const previous = advisoryTail;
        advisoryTail = new Promise<void>((resolve) => {
          releaseAdvisory = resolve;
        });
        await previous;
        return 1;
      });
      tx.$queryRaw.mockImplementation(
        (_query: TemplateStringsArray, recordId: string) =>
          Promise.resolve(
            recordId === document.id
              ? [{ id: document.id, status: document.status }]
              : [{ id: recordId, documentId: document.id }],
          ),
      );
      tx.contentDocument.findUnique.mockImplementation(async () =>
        documentExists ? document : null,
      );
      tx.contentDocument.findUniqueOrThrow.mockResolvedValue(document);
      tx.contentDocument.deleteMany.mockImplementation(async () => {
        documentExists = false;
        return { count: 1 };
      });
      const prisma = {
        contentDocument: {
          findUnique: jest.fn(async () => (documentExists ? document : null)),
          findFirst: jest.fn(async () => (documentExists ? document : null)),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => {
          try {
            return await callback(tx);
          } finally {
            releaseAdvisory?.();
          }
        }),
      } as unknown as PlatformPrismaService;
      return prisma;
    };

    const renameImplementation = (storage.rename as jest.Mock).getMockImplementation()!;
    let releaseStaging!: () => void;
    const stagingPaused = new Promise<void>((resolvePaused) => {
      (storage.rename as jest.Mock).mockImplementation(
        async (fromKey: string, toKey: string) => {
          await renameImplementation(fromKey, toKey);
          if (fromKey === sourceKey) {
            await new Promise<void>((resolve) => {
              releaseStaging = resolve;
              resolvePaused();
            });
          }
        },
      );
    });

    const deletingService = buildDocumentsService(createPrisma(), storage);
    const recoveringService = buildDocumentsService(createPrisma(), storage);
    const deletion = deletingService.permanentDelete(document.id);
    await stagingPaused;

    let recoverySettled = false;
    const recovery = recoveringService.onModuleInit().then(() => {
      recoverySettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const recoveryWasBlocked = !recoverySettled;

    releaseStaging();
    await Promise.all([deletion, recovery]);

    expect(recoveryWasBlocked).toBe(true);
    expect(entries.has(sourceKey)).toBe(false);
  });

  it('restores deterministic staged storage after a process crash before database commit', async () => {
    const documentId = 'document-crash-before-commit';
    const sourceKey = 'knowledge/originals/crash-before-commit/version-1';
    const journal = deletionJournal(documentId, sourceKey);
    const { storage, entries } = createPersistentStorage([
      [journal.journalKey, journal.content],
      [journal.stagedKey, Buffer.from('original bytes')],
    ]);
    const prisma = createRecoveryPrisma({
      id: documentId,
      previewStorageKey: null,
      fileAssets: [{ id: 'asset-1', versions: [{ storageKey: sourceKey }] }],
    });
    const service = buildDocumentsService(prisma, storage);

    await service.onModuleInit();

    expect(entries.get(sourceKey)).toEqual(Buffer.from('original bytes'));
    expect(entries.has(journal.stagedKey)).toBe(false);
    expect(entries.has(journal.journalKey)).toBe(false);
  });

  it('finalizes deterministic staged storage after a process crash following database commit', async () => {
    const documentId = 'document-crash-after-commit';
    const sourceKey = 'knowledge/originals/crash-after-commit/version-1';
    const journal = deletionJournal(documentId, sourceKey);
    const { storage, entries } = createPersistentStorage([
      [journal.journalKey, journal.content],
      [journal.stagedKey, Buffer.from('orphaned staged bytes')],
    ]);
    const prisma = createRecoveryPrisma(null);
    const service = buildDocumentsService(prisma, storage);

    await service.onModuleInit();

    expect(entries.has(sourceKey)).toBe(false);
    expect(entries.has(journal.stagedKey)).toBe(false);
    expect(entries.has(journal.journalKey)).toBe(false);
  });

  it('rejects permanent deletion for an active document', async () => {
    const { service, prisma, storage, transactionClient } = createService([
      {
        id: 'document-active',
        status: 'TRASHED',
        sourceKind: 'UPLOAD',
        previewStorageKey: null,
        fileAssets: [],
        folderFiles: [],
      },
    ]);
    (prisma.contentDocument.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'document-active',
      status: 'ACTIVE',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [],
      folderFiles: [],
    });
    transactionClient.contentDocument.findUnique.mockResolvedValueOnce({
      id: 'document-active',
      status: 'ACTIVE',
      previewStorageKey: null,
      fileAssets: [],
    });

    await expect(service.permanentDelete('document-active')).rejects.toMatchObject({
      status: 409,
    });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(transactionClient.contentDocument.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes authoritative upload and preview storage keys before deleting the database graph', async () => {
    const document: TrashedDocument = {
      id: 'document-upload',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: 'knowledge/previews/document-upload.pdf',
      fileAssets: [
        {
          id: 'asset-upload',
          versions: [
            { storageKey: 'knowledge/originals/document-upload/version-1' },
            { storageKey: 'knowledge/originals/document-upload/version-2' },
          ],
        },
      ],
      folderFiles: [],
    };
    const { service, prisma, storage, transactionClient } = createService([document]);

    await service.permanentDelete(document.id);

    const stageCalls = stageRenameCalls(storage);
    expect(stageCalls).toHaveLength(3);
    expect(storage.rename).toHaveBeenCalledWith(
      'knowledge/originals/document-upload/version-1',
      expect.stringMatching(/^trash\/documents\//),
    );
    expect(storage.rename).toHaveBeenCalledWith(
      'knowledge/originals/document-upload/version-2',
      expect.stringMatching(/^trash\/documents\//),
    );
    expect(storage.rename).toHaveBeenCalledWith(
      'knowledge/previews/document-upload.pdf',
      expect.stringMatching(/^trash\/documents\//),
    );
    const stagedKeys = stageCalls.map(([, stagedKey]) => stagedKey);
    expect(stagedDeleteCalls(storage)).toEqual(stagedKeys);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transactionClient.fileVersion.deleteMany).toHaveBeenCalledWith({
      where: { fileAssetId: { in: ['asset-upload'] } },
    });
    expect(transactionClient.fileAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['asset-upload'] }, documentId: document.id },
    });
    expect(transactionClient.documentVersion.deleteMany).toHaveBeenCalledWith({
      where: { documentId: document.id },
    });
    expect(transactionClient.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: document.id },
    });
    expect(transactionClient.folderFile.deleteMany).toHaveBeenCalledWith({
      where: { documentId: document.id },
    });
    expect(transactionClient.contentDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: document.id, status: 'TRASHED' },
    });
  });

  it('retains a local-folder original while deleting its system preview cache and mapping', async () => {
    const originalPath = '/Users/example/研发资料/方案.docx';
    const document: TrashedDocument = {
      id: 'document-local',
      status: 'TRASHED',
      sourceKind: 'LOCAL_FILE',
      previewStorageKey: 'knowledge/previews/document-local.pdf',
      fileAssets: [],
      folderFiles: [{ filePath: originalPath }],
    };
    const { service, storage, transactionClient } = createService([document]);

    await service.permanentDelete(document.id);

    expect(storage.rename).toHaveBeenCalledWith(
      'knowledge/previews/document-local.pdf',
      expect.stringMatching(/^trash\/documents\//),
    );
    expect(storage.rename).not.toHaveBeenCalledWith(originalPath, expect.any(String));
    const [[, stagedKey]] = stageRenameCalls(storage);
    expect(stagedDeleteCalls(storage)).toEqual([stagedKey]);
    expect(storage.delete).not.toHaveBeenCalledWith(originalPath);
    expect(transactionClient.folderFile.deleteMany).toHaveBeenCalledWith({
      where: { documentId: document.id },
    });
  });

  it('does not report deletion or mutate the database when storage cleanup fails', async () => {
    const document: TrashedDocument = {
      id: 'document-failed-cleanup',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-failed-cleanup',
          versions: [{ storageKey: 'knowledge/originals/document-failed-cleanup/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const { service, storage, transactionClient } = createService([document]);
    const renameImplementation = (storage.rename as jest.Mock).getMockImplementation()!;
    (storage.rename as jest.Mock)
      .mockImplementationOnce(renameImplementation)
      .mockRejectedValueOnce(new Error('storage offline'));

    await expect(service.permanentDelete(document.id)).rejects.toThrow('storage offline');
    expect(transactionClient.contentDocument.deleteMany).not.toHaveBeenCalled();
    expect(stagedDeleteCalls(storage)).toEqual([]);
  });

  it('restores already staged keys when staging a later key fails', async () => {
    const document: TrashedDocument = {
      id: 'document-partial-staging',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-partial-staging',
          versions: [
            { storageKey: 'knowledge/originals/document-partial-staging/version-1' },
            { storageKey: 'knowledge/originals/document-partial-staging/version-2' },
          ],
        },
      ],
      folderFiles: [],
    };
    const { service, storage, transactionClient } = createService([document]);
    const renameImplementation = (storage.rename as jest.Mock).getMockImplementation()!;
    (storage.rename as jest.Mock)
      .mockImplementationOnce(renameImplementation)
      .mockImplementationOnce(renameImplementation)
      .mockRejectedValueOnce(new Error('second rename failed'))
      .mockImplementationOnce(renameImplementation);

    await expect(service.permanentDelete(document.id)).rejects.toThrow('second rename failed');

    const [[, firstStagedKey]] = stageRenameCalls(storage);
    expect(storage.rename).toHaveBeenCalledWith(
      firstStagedKey,
      'knowledge/originals/document-partial-staging/version-1',
    );
    expect(transactionClient.contentDocument.deleteMany).not.toHaveBeenCalled();
    expect(stagedDeleteCalls(storage)).toEqual([]);
  });

  it('restores all staged keys when the database transaction fails', async () => {
    const document: TrashedDocument = {
      id: 'document-db-failure',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: 'knowledge/previews/document-db-failure.pdf',
      fileAssets: [
        {
          id: 'asset-db-failure',
          versions: [{ storageKey: 'knowledge/originals/document-db-failure/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const { service, storage, transactionClient } = createService([document]);
    transactionClient.documentChunk.deleteMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.permanentDelete(document.id)).rejects.toThrow('database unavailable');

    const stageCalls = stageRenameCalls(storage);
    expect(storage.rename).toHaveBeenCalledWith(stageCalls[1][1], stageCalls[1][0]);
    expect(storage.rename).toHaveBeenCalledWith(stageCalls[0][1], stageCalls[0][0]);
    expect(stagedDeleteCalls(storage)).toEqual([]);
  });

  it('restores staged storage when the document is concurrently restored', async () => {
    const document: TrashedDocument = {
      id: 'document-concurrent-restore',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-concurrent-restore',
          versions: [{ storageKey: 'knowledge/originals/concurrent-restore/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const { service, storage, transactionClient } = createService([document]);
    transactionClient.$queryRaw.mockResolvedValueOnce([
      { id: document.id, status: 'ACTIVE' },
    ]);

    await expect(service.permanentDelete(document.id)).rejects.toMatchObject({
      status: 409,
    });

    const [[sourceKey, stagedKey]] = stageRenameCalls(storage);
    expect(storage.rename).toHaveBeenCalledWith(stagedKey, sourceKey);
    expect(transactionClient.contentDocument.deleteMany).not.toHaveBeenCalled();
    expect(stagedDeleteCalls(storage)).toEqual([]);
  });

  it('restores staged storage when a file asset is concurrently relinked', async () => {
    const document: TrashedDocument = {
      id: 'document-concurrent-relink',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-concurrent-relink',
          versions: [{ storageKey: 'knowledge/originals/concurrent-relink/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const { service, storage, transactionClient } = createService([document]);
    transactionClient.contentDocument.findUniqueOrThrow.mockResolvedValueOnce({
      previewStorageKey: null,
      fileAssets: [],
    });

    await expect(service.permanentDelete(document.id)).rejects.toMatchObject({
      status: 409,
    });

    const [[sourceKey, stagedKey]] = stageRenameCalls(storage);
    expect(storage.rename).toHaveBeenCalledWith(stagedKey, sourceKey);
    expect(transactionClient.fileVersion.deleteMany).not.toHaveBeenCalled();
    expect(transactionClient.fileAsset.deleteMany).not.toHaveBeenCalled();
    expect(stagedDeleteCalls(storage)).toEqual([]);
  });

  it('reports post-commit staged cleanup failures diagnostically without returning a false retryable failure', async () => {
    const document: TrashedDocument = {
      id: 'document-finalize-failure',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-finalize-failure',
          versions: [{ storageKey: 'knowledge/originals/finalize-failure/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, storage, transactionClient } = createService([document]);
    (storage.delete as jest.Mock).mockRejectedValueOnce(
      new Error('/private/storage/trash/documents/staged-key could not be deleted'),
    );

    await expect(service.permanentDelete(document.id)).resolves.toBeUndefined();

    expect(transactionClient.contentDocument.deleteMany).toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('persistent recovery will retry'),
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('/private/storage');

    await service.onModuleInit();
    expect(stagedDeleteCalls(storage)).toHaveLength(2);

    warning.mockRestore();
  });

  it('rolls back when every locked document file asset was not deleted', async () => {
    const document: TrashedDocument = {
      id: 'document-asset-delete-race',
      status: 'TRASHED',
      sourceKind: 'UPLOAD',
      previewStorageKey: null,
      fileAssets: [
        {
          id: 'asset-delete-race',
          versions: [{ storageKey: 'knowledge/originals/asset-delete-race/version-1' }],
        },
      ],
      folderFiles: [],
    };
    const { service, storage, transactionClient } = createService([document]);
    transactionClient.fileAsset.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.permanentDelete(document.id)).rejects.toMatchObject({
      status: 409,
    });

    const [[sourceKey, stagedKey]] = stageRenameCalls(storage);
    expect(storage.rename).toHaveBeenCalledWith(stagedKey, sourceKey);
    expect(transactionClient.contentDocument.deleteMany).not.toHaveBeenCalled();
    expect(stagedDeleteCalls(storage)).toEqual([]);
  });

  it('clears every trashed document and returns the deleted count', async () => {
    const documents: TrashedDocument[] = [
      {
        id: 'document-one',
        status: 'TRASHED',
        sourceKind: 'UPLOAD',
        previewStorageKey: null,
        fileAssets: [],
        folderFiles: [],
      },
      {
        id: 'document-two',
        status: 'TRASHED',
        sourceKind: 'LOCAL_FILE',
        previewStorageKey: null,
        fileAssets: [],
        folderFiles: [{ filePath: '/Users/example/source-two.txt' }],
      },
    ];
    const { service, prisma } = createService(documents);

    await expect(service.clearTrash()).resolves.toEqual({ deleted: 2 });
    expect(prisma.contentDocument.findMany).toHaveBeenCalledWith({
      where: { status: 'TRASHED' },
      select: { id: true },
      orderBy: [{ trashedAt: 'asc' }, { id: 'asc' }],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it('recovers pending journals before clearing an already empty trash', async () => {
    const documentId = 'document-empty-trash-recovery';
    const sourceKey = 'knowledge/originals/empty-trash-recovery/version-1';
    const journal = deletionJournal(documentId, sourceKey);
    const { storage, entries } = createPersistentStorage([
      [journal.journalKey, journal.content],
      [journal.stagedKey, Buffer.from('pending finalized bytes')],
    ]);
    const prisma = {
      contentDocument: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (client: ReturnType<typeof createTransactionClient>) => unknown) => {
        const tx = createTransactionClient();
        tx.contentDocument.findUnique.mockResolvedValue(null);
        return callback(tx);
      }),
    } as unknown as PlatformPrismaService;
    const service = buildDocumentsService(prisma, storage);

    await expect(service.clearTrash()).resolves.toEqual({ deleted: 0 });

    expect(entries.has(journal.stagedKey)).toBe(false);
    expect(entries.has(journal.journalKey)).toBe(false);
  });
});
