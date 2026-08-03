import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ContentDocumentType, ContentStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import type { PermissionCode } from '../../../iam/domain/permission-catalog';
import {
  CreateDocumentDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
} from '../interface/http/dto/content.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface StagedStorageKey {
  sourceKey: string;
  stagedKey: string;
}

interface StorageDeletionJournal {
  version: 1;
  documentId: string;
  entries: StagedStorageKey[];
}

const DELETION_JOURNAL_PREFIX = 'trash/journals';
const DELETION_STAGING_PREFIX = 'trash/documents';
const DELETION_LOCK_NAME = 'rd-manager-workbench:document-trash';

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private deletionQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  onModuleInit(): Promise<void> {
    return this.runDeletionExclusive(() =>
      this.withDeletionLock((tx) => this.recoverPendingDeletions(tx)),
    );
  }

  async list(query: ListDocumentsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.ContentDocumentWhereInput = {
      type: query.type,
      projectId: query.projectId,
      meetingId: query.meetingId,
      spaceId: query.spaceId,
      status: query.status ?? ContentStatus.ACTIVE,
      ...(query.parentId !== undefined ? { parentId: query.parentId || null } : {}),
      ...(query.query
        ? {
            OR: [
              { title: { contains: query.query, mode: 'insensitive' } },
              { plainText: { contains: query.query, mode: 'insensitive' } },
              { tags: { has: query.query } },
            ],
          }
        : {}),
    };
    const principal = this.requestContext.requirePrincipal();
    const scope = this.dataScope.documents(principal, 'document.read');
    const scopedWhere: Prisma.ContentDocumentWhereInput = { AND: [where, scope] };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contentDocument.findMany({
        where: scopedWhere,
        orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contentDocument.count({ where: scopedWhere }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    await this.assertReadable(id);
    const document = await this.prisma.contentDocument.findFirst({
      where: { id },
      include: {
        space: true,
        fileAssets: {
          where: { status: 'ACTIVE' },
          include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!document) throw this.documentNotFound();
    return document;
  }

  /**
   * Generate an image-based HTML preview for PDF documents using pdftoppm.
   * Each page is rendered as a high-resolution PNG and embedded in HTML.
   * Returns null if the document has no PDF source file.
   */
  async getPreviewHtml(id: string): Promise<string | null | 'not-pdf'> {
    await this.assertReadable(id);
    const folderFile = await this.prisma.folderFile.findFirst({
      where: { documentId: id, status: 'ACTIVE' },
      select: { filePath: true },
    });

    if (!folderFile?.filePath) return 'not-pdf';
    if (!folderFile.filePath.toLowerCase().endsWith('.pdf')) return 'not-pdf';

    const pdfPath = folderFile.filePath;

    try {
      const { execSync } = await import('node:child_process');
      const { existsSync, mkdirSync, readFileSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const { randomUUID } = await import('node:crypto');

      if (!existsSync(pdfPath)) return null;

      // Render PDF pages as PNG images at 200 DPI
      const tmpDir = join(tmpdir(), `kb-pdf-${randomUUID()}`);
      mkdirSync(tmpDir);
      try {
        execSync(`pdftoppm -png -r 200 "${pdfPath}" "${tmpDir}/page"`, {
          timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
        });

        // Read generated images and build HTML
        const { readdirSync } = await import('node:fs');
        const files = readdirSync(tmpDir).filter((f: string) => f.endsWith('.png')).sort();
        if (files.length === 0) return null;

        const images = files.map((f: string) => {
          const buf = readFileSync(join(tmpDir, f));
          return `data:image/png;base64,${buf.toString('base64')}`;
        });

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{background:#525659;margin:0;padding:20px;display:flex;flex-direction:column;align-items:center;gap:20px}
          img{max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,.4);background:#fff}
          .page-num{color:#aaa;font-size:12px;text-align:center;margin-top:-12px}
        </style></head><body>
          ${images.map((src, i) => `<div><img src="${src}" alt="第${i + 1}页"><div class="page-num">第 ${i + 1} / ${files.length} 页</div></div>`).join('\n')}
        </body></html>`;

        return html;
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup failed */ }
      }
    } catch { /* render failed, return null */ }
    return null;
  }

  async create(dto: CreateDocumentDto) {
    const principal = this.requestContext.requirePrincipal();
    const references = await this.validateReferences(dto);
    return this.prisma.contentDocument.create({
      data: {
        type: dto.type,
        title: dto.title,
        content: (dto.content ?? {}) as Prisma.InputJsonValue,
        plainText: dto.plainText ?? '',
        tags: this.normalizeTags(dto.tags),
        isFavorite: dto.isFavorite ?? false,
        spaceId: references.spaceId,
        parentId: references.parentId,
        projectId: dto.projectId,
        meetingId: dto.meetingId,
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
        ownerUserId: principal.userId,
      },
    });
  }

  async createKnowledgePageInTransaction(tx: Prisma.TransactionClient, dto: CreateDocumentDto) {
    const principal = this.requestContext.requirePrincipal();
    const space = dto.spaceId ? await tx.knowledgeSpace.findFirst({ where: { id: dto.spaceId, archivedAt: null }, select: { id: true } }) : null;
    if (dto.spaceId && !space) throw this.referenceInvalid('Knowledge space not found');
    const project = dto.projectId ? await tx.project.findFirst({ where: { id: dto.projectId, archivedAt: null }, select: { id: true } }) : null;
    if (dto.projectId && !project) throw this.referenceInvalid('Project not found');
    return tx.contentDocument.create({ data: {
      type: ContentDocumentType.KNOWLEDGE_PAGE, title: dto.title,
      content: (dto.content ?? {}) as Prisma.InputJsonValue, plainText: dto.plainText ?? '',
      tags: this.normalizeTags(dto.tags), isFavorite: dto.isFavorite ?? false,
      spaceId: dto.spaceId, projectId: dto.projectId,
      createdByUserId: principal.userId,
      updatedByUserId: principal.userId,
      ownerUserId: principal.userId,
    } });
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const principal = this.requestContext.requirePrincipal();
    await this.assertAccessible(id, 'document.update');
    const current = await this.prisma.contentDocument.findFirst({
      where: { id, status: ContentStatus.ACTIVE },
    });
    if (!current) throw this.documentNotFound();
    const references = await this.validateReferences(
      {
        ...dto,
        spaceId: dto.spaceId !== undefined ? dto.spaceId : current.spaceId,
        parentId: dto.parentId !== undefined ? dto.parentId : current.parentId,
        projectId: dto.projectId !== undefined ? dto.projectId : current.projectId,
        meetingId: dto.meetingId !== undefined ? dto.meetingId : current.meetingId,
      },
      id,
    );
    return this.prisma.contentDocument.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content as Prisma.InputJsonValue | undefined,
        plainText: dto.plainText,
        tags: dto.tags ? this.normalizeTags(dto.tags) : undefined,
        isFavorite: dto.isFavorite,
        spaceId: references.spaceId,
        parentId: references.parentId,
        projectId: dto.projectId,
        meetingId: dto.meetingId,
        updatedByUserId: principal.userId,
      },
    });
  }

  async trash(id: string) {
    await this.assertAccessible(id, 'document.delete', [
      ContentStatus.ACTIVE,
      ContentStatus.TRASHED,
    ]);
    const result = await this.prisma.contentDocument.updateMany({
      where: { id, status: ContentStatus.ACTIVE },
      data: { status: ContentStatus.TRASHED, trashedAt: new Date() },
    });
    if (!result.count) throw this.documentNotFound();
  }

  async restore(id: string) {
    await this.assertAccessible(id, 'document.update', [
      ContentStatus.ACTIVE,
      ContentStatus.TRASHED,
    ]);
    const result = await this.prisma.contentDocument.updateMany({
      where: { id, status: ContentStatus.TRASHED },
      data: { status: ContentStatus.ACTIVE, trashedAt: null },
    });
    if (!result.count) throw this.documentNotFound();
    const principal = this.requestContext.requirePrincipal();
    const restored = await this.prisma.contentDocument.findFirst({
      where: {
        id,
        status: ContentStatus.ACTIVE,
        AND: [this.dataScope.documents(principal, 'document.update')],
      },
      include: {
        space: true,
        fileAssets: {
          where: { status: 'ACTIVE' },
          include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!restored) throw this.documentNotFound();
    return restored;
  }

  permanentDelete(id: string): Promise<void> {
    return this.runDeletionExclusive(() => this.permanentDeleteWithLock(id));
  }

  private async permanentDeleteWithLock(id: string): Promise<void> {
    await this.assertAccessible(id, 'document.delete', [
      ContentStatus.ACTIVE,
      ContentStatus.TRASHED,
    ]);
    try {
      await this.withDeletionLock(async (tx) => {
        await this.recoverPendingDeletions(tx);
        await this.permanentDeleteExclusive(tx, id);
      });
    } catch (error) {
      try {
        await this.withDeletionLock((tx) => this.recoverPendingDeletions(tx));
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'Document deletion failed and persistent storage recovery was incomplete',
        );
      }
      throw error;
    }

    try {
      await this.withDeletionLock((tx) => this.recoverPendingDeletions(tx));
    } catch {
      this.logger.warn(
        `Final storage cleanup deferred for document ${id}; persistent recovery will retry`,
      );
    }
  }

  private async assertReadable(id: string, statuses: ContentStatus[] = [ContentStatus.ACTIVE]) {
    return this.assertAccessible(id, 'document.read', statuses);
  }

  private async assertAccessible(
    id: string,
    permissionCode: PermissionCode,
    statuses: ContentStatus[] = [ContentStatus.ACTIVE],
  ) {
    const principal = this.requestContext.requirePrincipal();
    const scope = this.dataScope.documents(principal, permissionCode);
    const accessible = await this.prisma.contentDocument.findFirst({
      where: {
        id,
        status: statuses.length > 0 ? { in: statuses } : undefined,
        AND: [scope],
      },
      select: { id: true },
    });
    if (accessible) return;
    const exists = await this.prisma.contentDocument.count({ where: { id } });
    if (!exists) throw this.documentNotFound();
    throw new AppError({
      code: ErrorCodes.PERMISSION_DENIED,
      message: 'You do not have permission to modify this document',
      statusCode: HttpStatus.FORBIDDEN,
    });
  }

  private async permanentDeleteExclusive(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const document = await tx.contentDocument.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        previewStorageKey: true,
        fileAssets: {
          select: {
            id: true,
            versions: { select: { storageKey: true } },
          },
        },
      },
    });
    if (!document) throw this.documentNotFound();
    if (document.status !== ContentStatus.TRASHED) {
      throw this.permanentDeleteConflict();
    }

    const storageKeys = new Set<string>();
    for (const asset of document.fileAssets) {
      for (const version of asset.versions) storageKeys.add(version.storageKey);
    }
    if (document.previewStorageKey) storageKeys.add(document.previewStorageKey);

    const journal = this.createDeletionJournal(id, storageKeys);
    const journalKey = this.deletionJournalKey(id);
    await this.persistDeletionJournal(journal, journalKey);
    try {
      await this.stageStorageKeys(journal.entries);
      const fileAssetIds = document.fileAssets.map(({ id: fileAssetId }) => fileAssetId);
      const locked = await tx.$queryRaw<Array<{ id: string; status: ContentStatus }>>`
        SELECT id, status
        FROM "app"."content_documents"
        WHERE id = ${id}
        FOR UPDATE
      `;
      if (!locked.length) throw this.documentNotFound();
      if (locked[0].status !== ContentStatus.TRASHED) {
        throw this.permanentDeleteConflict();
      }

      for (const fileAssetId of fileAssetIds) {
        const lockedAssets = await tx.$queryRaw<
          Array<{ id: string; documentId: string | null }>
        >`
          SELECT id, document_id AS "documentId"
          FROM "app"."file_assets"
          WHERE id = ${fileAssetId}
          FOR UPDATE
        `;
        if (lockedAssets.length !== 1 || lockedAssets[0].documentId !== id) {
          throw this.permanentDeleteConflict(
            'A document file changed while permanent deletion was being prepared',
          );
        }
      }

      const current = await tx.contentDocument.findUniqueOrThrow({
        where: { id },
        select: {
          previewStorageKey: true,
          fileAssets: {
            select: {
              id: true,
              versions: { select: { storageKey: true } },
            },
          },
        },
      });
      const currentStorageKeys = new Set<string>();
      for (const asset of current.fileAssets) {
        for (const version of asset.versions) {
          currentStorageKeys.add(version.storageKey);
        }
      }
      if (current.previewStorageKey) currentStorageKeys.add(current.previewStorageKey);
      const currentFileAssetIds = current.fileAssets.map(({ id: assetId }) => assetId);
      if (
        !this.haveSameValues(storageKeys, currentStorageKeys) ||
        !this.haveSameValues(fileAssetIds, currentFileAssetIds)
      ) {
        throw this.permanentDeleteConflict(
          'Document storage changed while permanent deletion was being prepared',
        );
      }

      await tx.folderFile.deleteMany({ where: { documentId: id } });
      await tx.documentChunk.deleteMany({ where: { documentId: id } });
      await tx.documentVersion.deleteMany({ where: { documentId: id } });
      if (fileAssetIds.length) {
        await tx.fileVersion.deleteMany({
          where: { fileAssetId: { in: fileAssetIds } },
        });
        const deletedFileAssets = await tx.fileAsset.deleteMany({
          where: { id: { in: fileAssetIds }, documentId: id },
        });
        if (deletedFileAssets.count !== fileAssetIds.length) {
          throw this.permanentDeleteConflict(
            'A document file changed while permanent deletion was being committed',
          );
        }
      }
      const deleted = await tx.contentDocument.deleteMany({
        where: { id, status: ContentStatus.TRASHED },
      });
      if (!deleted.count) throw this.permanentDeleteConflict();
    } catch (error) {
      try {
        await this.recoverDeletionJournal(tx, journal, journalKey);
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'Document deletion failed and in-lock storage recovery was incomplete',
        );
      }
      throw error;
    }
  }

  async clearTrash(): Promise<{ deleted: number }> {
    await this.runDeletionExclusive(() =>
      this.withDeletionLock((tx) => this.recoverPendingDeletions(tx)),
    );
    const documents = await this.prisma.contentDocument.findMany({
      where: { status: ContentStatus.TRASHED },
      select: { id: true },
      orderBy: [{ trashedAt: 'asc' }, { id: 'asc' }],
    });
    let deleted = 0;
    for (const document of documents) {
      await this.permanentDelete(document.id);
      deleted += 1;
    }
    return { deleted };
  }

  async listVersions(id: string) {
    await this.assertAccessible(id, 'document.read');
    const document = await this.prisma.contentDocument.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!document) throw this.documentNotFound();
    return this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }],
    });
  }

  async saveVersion(id: string) {
    await this.assertAccessible(id, 'document.update');
    return this.prisma.$transaction(async (tx) => {
      const document = await this.lockActiveDocument(tx, id);
      return this.createVersion(tx, document);
    });
  }

  async restoreVersion(id: string, versionId: string) {
    await this.assertAccessible(id, 'document.update');
    return this.prisma.$transaction(async (tx) => {
      await this.lockActiveDocument(tx, id);
      const source = await tx.documentVersion.findFirst({
        where: { id: versionId, documentId: id },
      });
      if (!source) throw this.versionNotFound();
      await this.validateSnapshotReferences(tx, source, id);
      const document = await tx.contentDocument.update({
        where: { id },
        data: {
          title: source.title,
          content: source.content as Prisma.InputJsonValue,
          plainText: source.plainText,
          tags: source.tags,
          isFavorite: source.isFavorite,
          spaceId: source.spaceId,
          parentId: source.parentId,
          projectId: source.projectId,
          meetingId: source.meetingId,
        },
      });
      await this.createVersion(tx, document, source.id);
      return document;
    });
  }

  private async lockActiveDocument(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "app"."content_documents"
      WHERE id = ${id} AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (!rows.length) throw this.documentNotFound();
    return tx.contentDocument.findUniqueOrThrow({ where: { id } });
  }

  private async createVersion(
    tx: Prisma.TransactionClient,
    document: Awaited<ReturnType<Prisma.TransactionClient['contentDocument']['findUniqueOrThrow']>>,
    restoredFromVersionId?: string,
  ) {
    const latest = await tx.documentVersion.aggregate({
      where: { documentId: document.id },
      _max: { versionNumber: true },
    });
    return tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: (latest._max.versionNumber ?? 0) + 1,
        title: document.title,
        content: document.content as Prisma.InputJsonValue,
        plainText: document.plainText,
        tags: document.tags,
        isFavorite: document.isFavorite,
        spaceId: document.spaceId,
        parentId: document.parentId,
        projectId: document.projectId,
        meetingId: document.meetingId,
        restoredFromVersionId,
      },
    });
  }

  private async validateReferences(
    dto: Pick<CreateDocumentDto, 'spaceId' | 'parentId' | 'projectId' | 'meetingId'>,
    documentId?: string,
  ) {
    let spaceId = dto.spaceId ?? null;
    const parentId = dto.parentId ?? null;
    if (parentId) {
      if (parentId === documentId) throw this.parentInvalid();
      const parent = await this.prisma.contentDocument.findFirst({
        where: { id: parentId, status: ContentStatus.ACTIVE },
        select: { id: true, parentId: true, spaceId: true },
      });
      if (!parent) throw this.referenceInvalid('Parent document not found');
      if (spaceId && parent.spaceId !== spaceId) {
        throw this.parentInvalid('Parent document belongs to another knowledge space');
      }
      spaceId ??= parent.spaceId;
      await this.assertNoParentCycle(parent, documentId);
    }
    await Promise.all([
      spaceId
        ? this.assertExists('knowledgeSpace', spaceId, 'Knowledge space not found')
        : undefined,
      dto.projectId ? this.assertExists('project', dto.projectId, 'Project not found') : undefined,
      dto.meetingId ? this.assertExists('meeting', dto.meetingId, 'Meeting not found') : undefined,
    ]);
    return { spaceId, parentId };
  }

  private async assertNoParentCycle(
    parent: { id: string; parentId: string | null },
    documentId?: string,
  ) {
    if (!documentId) return;
    let cursor: { id: string; parentId: string | null } | null = parent;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor.id === documentId || visited.has(cursor.id)) throw this.parentInvalid();
      visited.add(cursor.id);
      cursor = cursor.parentId
        ? await this.prisma.contentDocument.findUnique({
            where: { id: cursor.parentId },
            select: { id: true, parentId: true },
          })
        : null;
    }
  }

  private async assertExists(
    delegate: 'knowledgeSpace' | 'project' | 'meeting',
    id: string,
    message: string,
  ) {
    const item =
      delegate === 'knowledgeSpace'
        ? await this.prisma.knowledgeSpace.findFirst({ where: { id, archivedAt: null } })
        : delegate === 'project'
          ? await this.prisma.project.findFirst({ where: { id, archivedAt: null } })
          : await this.prisma.meeting.findFirst({ where: { id, archivedAt: null } });
    if (!item) throw this.referenceInvalid(message);
  }

  private async validateSnapshotReferences(
    tx: Prisma.TransactionClient,
    source: {
      spaceId: string | null;
      parentId: string | null;
      projectId: string | null;
      meetingId: string | null;
    },
    documentId: string,
  ) {
    const [space, parent, project, meeting] = await Promise.all([
      source.spaceId ? tx.knowledgeSpace.findUnique({ where: { id: source.spaceId } }) : true,
      source.parentId ? tx.contentDocument.findUnique({ where: { id: source.parentId } }) : true,
      source.projectId ? tx.project.findUnique({ where: { id: source.projectId } }) : true,
      source.meetingId ? tx.meeting.findUnique({ where: { id: source.meetingId } }) : true,
    ]);
    if (!space || !parent || !project || !meeting) {
      throw this.referenceInvalid('A saved document association no longer exists');
    }
    if (source.parentId) {
      let cursor: { id: string; parentId: string | null } | null = parent as {
        id: string;
        parentId: string | null;
      };
      const visited = new Set<string>();
      while (cursor) {
        if (cursor.id === documentId || visited.has(cursor.id)) throw this.parentInvalid();
        visited.add(cursor.id);
        cursor = cursor.parentId
          ? await tx.contentDocument.findUnique({
              where: { id: cursor.parentId },
              select: { id: true, parentId: true },
            })
          : null;
      }
    }
  }

  private normalizeTags(tags?: string[]) {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }

  private documentNotFound() {
    return new AppError({
      code: ErrorCodes.DOCUMENT_NOT_FOUND,
      message: 'Document not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private versionNotFound() {
    return new AppError({
      code: ErrorCodes.DOCUMENT_VERSION_NOT_FOUND,
      message: 'Document version not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private runDeletionExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.deletionQueue.then(operation, operation);
    this.deletionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private withDeletionLock<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${DELETION_LOCK_NAME}))`,
        );
        return operation(tx);
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  private createDeletionJournal(
    documentId: string,
    storageKeys: Iterable<string>,
  ): StorageDeletionJournal {
    return {
      version: 1,
      documentId,
      entries: [...storageKeys]
        .sort()
        .map((sourceKey) => ({
          sourceKey,
          stagedKey: this.deletionStagingKey(documentId, sourceKey),
        })),
    };
  }

  private async persistDeletionJournal(
    journal: StorageDeletionJournal,
    journalKey: string,
  ): Promise<void> {
    const temporaryKey = `${DELETION_JOURNAL_PREFIX}/.tmp-${randomUUID()}`;
    const content = Buffer.from(JSON.stringify(journal));
    await this.storage.write({
      key: temporaryKey,
      content,
      mimeType: 'application/json',
    });
    try {
      await this.storage.rename(temporaryKey, journalKey);
    } catch (error) {
      try {
        await this.storage.delete(temporaryKey);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Document deletion journal publication failed and temporary cleanup was incomplete',
        );
      }
      throw error;
    }
  }

  private async stageStorageKeys(entries: StagedStorageKey[]): Promise<void> {
    for (const { sourceKey, stagedKey } of entries) {
      await this.storage.rename(sourceKey, stagedKey);
    }
  }

  private async recoverPendingDeletions(tx: Prisma.TransactionClient): Promise<void> {
    let storedEntries;
    try {
      storedEntries = await this.storage.walk(DELETION_JOURNAL_PREFIX);
    } catch (error) {
      if (this.isStorageNotFound(error)) return;
      throw error;
    }

    for (const storedEntry of storedEntries) {
      if (storedEntry.kind !== 'FILE') continue;
      if (storedEntry.key.startsWith(`${DELETION_JOURNAL_PREFIX}/.tmp-`)) {
        await this.storage.delete(storedEntry.key);
        continue;
      }
      if (!storedEntry.key.endsWith('.json')) continue;
      const journal = await this.readDeletionJournal(storedEntry.key);
      await this.recoverDeletionJournal(tx, journal, storedEntry.key);
    }
  }

  private async recoverDeletionJournal(
    tx: Prisma.TransactionClient,
    journal: StorageDeletionJournal,
    journalKey: string,
  ): Promise<void> {
    const document = await tx.contentDocument.findUnique({
      where: { id: journal.documentId },
      select: {
        id: true,
        previewStorageKey: true,
        fileAssets: {
          select: {
            versions: { select: { storageKey: true } },
          },
        },
      },
    });

    if (!document) {
      await this.finalizeDeletionJournal(journal, journalKey);
      return;
    }

    const authoritativeKeys = new Set<string>();
    for (const asset of document.fileAssets) {
      for (const version of asset.versions) {
        authoritativeKeys.add(version.storageKey);
      }
    }
    if (document.previewStorageKey) authoritativeKeys.add(document.previewStorageKey);
    if (!this.haveSameValues(authoritativeKeys, journal.entries.map(({ sourceKey }) => sourceKey))) {
      throw new Error('Deletion journal no longer matches authoritative document storage');
    }

    for (const { sourceKey, stagedKey } of [...journal.entries].reverse()) {
      const [sourceExists, stagedExists] = await Promise.all([
        this.storageEntryExists(sourceKey),
        this.storageEntryExists(stagedKey),
      ]);
      if (sourceExists && stagedExists) {
        throw new Error('Deletion journal recovery found both source and staged storage objects');
      }
      if (!sourceExists && !stagedExists) {
        throw new Error('Deletion journal recovery could not find source or staged storage object');
      }
      if (stagedExists) {
        await this.storage.rename(stagedKey, sourceKey);
      }
    }
    await this.storage.delete(journalKey);
  }

  private async finalizeDeletionJournal(
    journal: StorageDeletionJournal,
    journalKey: string,
  ): Promise<void> {
    const cleanup = await Promise.allSettled(
      journal.entries.map(async ({ stagedKey }) => {
        if (await this.storageEntryExists(stagedKey)) {
          await this.storage.delete(stagedKey);
        }
      }),
    );
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, 'Document staged storage cleanup failed');
    }
    await this.storage.delete(journalKey);
  }

  private async readDeletionJournal(journalKey: string): Promise<StorageDeletionJournal> {
    const stored = await this.storage.read(journalKey);
    let value: unknown;
    try {
      value = JSON.parse(stored.content.toString('utf8'));
    } catch (error) {
      throw new Error('Document deletion journal is not valid JSON', { cause: error });
    }
    if (!this.isDeletionJournal(value)) {
      throw new Error('Document deletion journal has an invalid shape');
    }
    if (this.deletionJournalKey(value.documentId) !== journalKey) {
      throw new Error('Document deletion journal key does not match its document');
    }
    return value;
  }

  private isDeletionJournal(value: unknown): value is StorageDeletionJournal {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StorageDeletionJournal>;
    if (
      candidate.version !== 1 ||
      typeof candidate.documentId !== 'string' ||
      !Array.isArray(candidate.entries)
    ) {
      return false;
    }
    const sourceKeys = new Set<string>();
    return candidate.entries.every((entry) => {
      if (
        !entry ||
        typeof entry.sourceKey !== 'string' ||
        typeof entry.stagedKey !== 'string' ||
        entry.stagedKey !== this.deletionStagingKey(candidate.documentId!, entry.sourceKey) ||
        sourceKeys.has(entry.sourceKey)
      ) {
        return false;
      }
      sourceKeys.add(entry.sourceKey);
      return true;
    });
  }

  private async storageEntryExists(storageKey: string): Promise<boolean> {
    try {
      await this.storage.stat(storageKey);
      return true;
    } catch (error) {
      if (this.isStorageNotFound(error)) return false;
      throw error;
    }
  }

  private isStorageNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    );
  }

  private deletionJournalKey(documentId: string): string {
    return `${DELETION_JOURNAL_PREFIX}/${this.sha256(documentId)}.json`;
  }

  private deletionStagingKey(documentId: string, sourceKey: string): string {
    return `${DELETION_STAGING_PREFIX}/${this.sha256(`${documentId}\0${sourceKey}`)}`;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private haveSameValues(left: Iterable<string>, right: Iterable<string>): boolean {
    const leftValues = [...left].sort();
    const rightValues = [...right].sort();
    return (
      leftValues.length === rightValues.length &&
      leftValues.every((value, index) => value === rightValues[index])
    );
  }

  private permanentDeleteConflict(
    message = 'Only trashed documents can be permanently deleted',
  ) {
    return new ConflictException(message);
  }

  private referenceInvalid(message: string) {
    return new AppError({
      code: ErrorCodes.DOCUMENT_REFERENCE_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }

  private parentInvalid(message = 'Document parent would create a cycle') {
    return new AppError({
      code: ErrorCodes.DOCUMENT_PARENT_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}
