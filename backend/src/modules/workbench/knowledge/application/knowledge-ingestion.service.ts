import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { KnowledgeProcessingStatus, KnowledgeSourceKind } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import type { UploadedContentFile } from '../../content/application/files.service';
import { DocumentImportService } from './document-import.service';
import { IndexingService } from './indexing.service';

const DEFAULT_MIME_TYPE = 'application/octet-stream';

@Injectable()
export class KnowledgeIngestionService {
  private readonly logger = new Logger(KnowledgeIngestionService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
    private readonly importer: DocumentImportService,
    private readonly indexing: IndexingService,
  ) {}

  async upload(file: UploadedContentFile | undefined, spaceId?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('File is required');

    const documentId = randomUUID();
    const assetId = randomUUID();
    const versionId = randomUUID();
    const originalName = this.normalizeFileName(file.originalname);
    const mimeType = file.mimetype || DEFAULT_MIME_TYPE;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `knowledge/originals/${documentId}/${versionId}`;

    await this.storage.write({ key: storageKey, content: file.buffer, mimeType });

    try {
      const document = await this.prisma.$transaction((tx) =>
        tx.contentDocument.create({
          data: {
            id: documentId,
            type: 'DOCUMENT',
            title: this.titleFromFileName(originalName),
            plainText: '',
            sourceKind: KnowledgeSourceKind.UPLOAD,
            originalName,
            mimeType,
            fileSize: file.buffer.length,
            sourceSha256: sha256,
            previewStatus: KnowledgeProcessingStatus.PENDING,
            indexStatus: KnowledgeProcessingStatus.PENDING,
            spaceId: spaceId || null,
            fileAssets: {
              create: {
                id: assetId,
                name: originalName,
                versions: {
                  create: {
                    id: versionId,
                    versionNumber: 1,
                    storageKey,
                    originalName,
                    mimeType,
                    size: file.buffer.length,
                    sha256,
                  },
                },
              },
            },
          },
          select: {
            id: true,
            title: true,
            originalName: true,
            mimeType: true,
            fileSize: true,
            sourceSha256: true,
            sourceKind: true,
            previewStatus: true,
            indexStatus: true,
          },
        }),
      );

      setImmediate(() => {
        void this.extractAndIndex(document.id, file).catch((error: unknown) => {
          this.logger.error({ documentId: document.id, error }, 'Knowledge extraction failed');
        });
      });

      return {
        documentId: document.id,
        title: document.title,
        originalName: document.originalName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        sha256: document.sourceSha256,
        sourceKind: document.sourceKind,
        processing: {
          preview: document.previewStatus,
          index: document.indexStatus,
        },
      };
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  private async extractAndIndex(documentId: string, file: UploadedContentFile): Promise<void> {
    await this.prisma.contentDocument.update({
      where: { id: documentId },
      data: {
        indexStatus: KnowledgeProcessingStatus.PROCESSING,
        processingError: null,
      },
    });

    try {
      const extracted = await this.importer.extract(file);
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          title: extracted.title || this.titleFromFileName(file.originalname),
          plainText: extracted.plainText,
        },
      });
      const indexed = await this.indexing.indexDocument(documentId, extracted.plainText);
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus: indexed && indexed.embedded < indexed.chunks
            ? KnowledgeProcessingStatus.PARTIAL
            : KnowledgeProcessingStatus.READY,
          indexedAt: new Date(),
          processingError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document extraction failed';
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus: KnowledgeProcessingStatus.FAILED,
          processingError: message.slice(0, 1000),
        },
      });
      throw error;
    }
  }

  private normalizeFileName(value: string): string {
    const alreadyUnicode = Array.from(value).some((character) => character.charCodeAt(0) > 255);
    const decoded = alreadyUnicode ? value : Buffer.from(value, 'latin1').toString('utf8');
    const candidate = decoded.includes('\uFFFD') ? value : decoded;
    const normalized = candidate.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim();
    return normalized || '未命名文件';
  }

  private titleFromFileName(value: string): string {
    const name = this.normalizeFileName(value);
    const withoutExtension = name.replace(/\.[^.]+$/, '').trim();
    return withoutExtension || name;
  }
}
