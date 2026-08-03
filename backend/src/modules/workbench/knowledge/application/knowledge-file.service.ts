import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { KnowledgeProcessingStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { OfficePreviewService } from './office-preview.service';

const BROWSER_NATIVE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

const OFFICE_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
]);

export interface KnowledgeFileContent {
  content: Buffer;
  fileName: string;
  mimeType: string;
  sha256: string;
}

@Injectable()
export class KnowledgeFileService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
    private readonly officePreview: OfficePreviewService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async getOriginal(documentId: string): Promise<KnowledgeFileContent> {
    const document = await this.prisma.contentDocument.findFirst({
      where: {
        id: documentId,
        status: 'ACTIVE',
        trashedAt: null,
        AND: this.dataScope.documents(this.principal(), 'document.read'),
      },
      select: {
        id: true,
        sourceKind: true,
        originalName: true,
        mimeType: true,
        sourceSha256: true,
        fileAssets: {
          where: { status: 'ACTIVE' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: {
                storageKey: true,
                originalName: true,
                mimeType: true,
                sha256: true,
              },
            },
          },
        },
      },
    });
    if (!document) {
      const exists = await this.prisma.contentDocument.count({ where: { id: documentId } });
      if (!exists) throw new NotFoundException('Knowledge document not found');
      throw new ForbiddenException('You do not have permission to access this knowledge document');
    }

    const version = document.fileAssets[0]?.versions[0];
    if (version) {
      const stored = await this.storage.read(version.storageKey);
      const actualSha256 = this.sha256(stored.content);
      if (actualSha256 !== version.sha256) {
        throw new ConflictException('知识库原文件完整性校验失败');
      }
      return {
        content: stored.content,
        fileName: version.originalName,
        mimeType: version.mimeType,
        sha256: actualSha256,
      };
    }

    const folderFile = await this.prisma.folderFile.findFirst({
      where: { documentId, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      select: { filePath: true, fileHash: true },
    });
    if (!folderFile) throw new NotFoundException('该知识条目没有可读取的原文件');

    const fileStat = await stat(folderFile.filePath);
    if (!fileStat.isFile()) throw new NotFoundException('本地知识源已不存在');
    const content = await readFile(folderFile.filePath);
    const actualSha256 = this.sha256(content);
    const expectedSha256 = document.sourceSha256 || folderFile.fileHash;
    if (expectedSha256 && actualSha256 !== expectedSha256) {
      throw new ConflictException('本地文件已变化，请重新同步后再预览');
    }
    return {
      content,
      fileName: document.originalName || folderFile.filePath.split('/').pop() || document.id,
      mimeType: document.mimeType || 'application/octet-stream',
      sha256: actualSha256,
    };
  }

  async getPreview(documentId: string): Promise<KnowledgeFileContent> {
    const original = await this.getOriginal(documentId);
    const normalizedMimeType = original.mimeType.split(';')[0].toLowerCase();
    if (BROWSER_NATIVE_MIME_TYPES.has(normalizedMimeType)) {
      await this.markPreviewReady(documentId, null, normalizedMimeType);
      return original;
    }

    const extension = original.fileName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    if (!OFFICE_EXTENSIONS.has(extension)) {
      throw new UnprocessableEntityException('此文件类型暂不支持在线预览，请下载原文件查看');
    }

    await this.prisma.contentDocument.update({
      where: { id: documentId },
      data: { previewStatus: KnowledgeProcessingStatus.PROCESSING, processingError: null },
    });
    try {
      const preview = await this.officePreview.convertToPdf({
        documentId,
        fileName: original.fileName,
        sourceSha256: original.sha256,
        content: original.content,
      });
      await this.markPreviewReady(documentId, preview.storageKey, preview.mimeType);
      return {
        content: preview.content,
        fileName: `${original.fileName}.pdf`,
        mimeType: preview.mimeType,
        sha256: this.sha256(preview.content),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview generation failed';
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          previewStatus: KnowledgeProcessingStatus.FAILED,
          processingError: message.slice(0, 1000),
        },
      });
      throw error;
    }
  }

  async getLocalOpenPath(documentId: string): Promise<{ filePath: string }> {
    // Authorize document access before exposing local filesystem path.
    const authorized = await this.prisma.contentDocument.findFirst({
      where: {
        id: documentId,
        status: 'ACTIVE',
        trashedAt: null,
        AND: this.dataScope.documents(this.principal(), 'document.read'),
      },
      select: { id: true },
    });
    if (!authorized) {
      throw new NotFoundException('该知识文件不是可在本机打开的活动目录文件');
    }

    const folderFile = await this.prisma.folderFile.findFirst({
      where: {
        documentId,
        status: 'ACTIVE',
        document: { status: 'ACTIVE', trashedAt: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: { filePath: true },
    });
    if (!folderFile) {
      throw new NotFoundException('该知识文件不是可在本机打开的活动目录文件');
    }
    const resolvedPath = await realpath(folderFile.filePath).catch(() => null);
    if (!resolvedPath) throw new NotFoundException('本地知识源已不存在');
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) throw new NotFoundException('本地知识源已不存在');
    return { filePath: resolvedPath };
  }

  private async markPreviewReady(
    documentId: string,
    storageKey: string | null,
    mimeType: string,
  ): Promise<void> {
    await this.prisma.contentDocument.update({
      where: { id: documentId },
      data: {
        previewStatus: KnowledgeProcessingStatus.READY,
        previewStorageKey: storageKey,
        previewMimeType: mimeType,
        processingError: null,
      },
    });
  }

  private sha256(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
