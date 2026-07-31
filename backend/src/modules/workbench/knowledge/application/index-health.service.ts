import { Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeProcessingStatus, KnowledgeSourceKind } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { DocumentImportService } from './document-import.service';
import { IndexingService } from './indexing.service';
import { KnowledgeFileService } from './knowledge-file.service';

export type IndexHealthCategory =
  | 'EXTRACTION_MISSING'
  | 'CHUNKS_MISSING'
  | 'EMBEDDINGS_MISSING'
  | 'FILE_MISSING'
  | 'UNSUPPORTED_FORMAT';

const IGNORE_MARKER = '[INDEX_HEALTH_IGNORED]';
const SUPPORTED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

type HealthDocument = {
  id: string;
  title: string;
  originalName: string | null;
  mimeType: string | null;
  sourceKind: KnowledgeSourceKind;
  plainText: string;
  previewStatus: KnowledgeProcessingStatus;
  indexStatus: KnowledgeProcessingStatus;
  processingError: string | null;
  _count: { chunks: number };
};

export interface IndexHealthItem {
  documentId: string;
  title: string;
  fileName: string;
  category: IndexHealthCategory;
  reason: string;
}

@Injectable()
export class IndexHealthService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly files: KnowledgeFileService,
    private readonly importer: DocumentImportService,
    private readonly indexing: IndexingService,
    private readonly audit: AuditLogService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async list(category?: IndexHealthCategory) {
    const principal = this.principal();
    const documentScope = this.dataScope.documents(principal);
    const [documents, missingEmbeddings] = await Promise.all([
      this.prisma.contentDocument.findMany({
        where: { status: 'ACTIVE', trashedAt: null, AND: documentScope },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          originalName: true,
          mimeType: true,
          sourceKind: true,
          plainText: true,
          previewStatus: true,
          indexStatus: true,
          processingError: true,
          _count: { select: { chunks: true } },
        },
      }),
      this.prisma.$queryRawUnsafe<Array<{ documentId: string }>>(
        `SELECT DISTINCT document_id AS "documentId"
         FROM app.document_chunks
         WHERE embedding IS NULL`,
      ),
    ]);
    const embeddingIds = new Set(missingEmbeddings.map((row) => row.documentId));
    const ignored = documents.filter((document) => document.processingError === IGNORE_MARKER);
    const items = documents
      .filter((document) => document.processingError !== IGNORE_MARKER)
      .map((document) => this.toHealthItem(document as HealthDocument, embeddingIds))
      .filter((item): item is IndexHealthItem => item !== null)
      .filter((item) => !category || item.category === category);
    return {
      items,
      counts: items.reduce<Partial<Record<IndexHealthCategory, number>>>((counts, item) => {
        counts[item.category] = (counts[item.category] ?? 0) + 1;
        return counts;
      }, {}),
      excludedDocumentCount: items.length + ignored.length,
      ignoredDocumentCount: ignored.length,
    };
  }

  async retryOne(documentId: string): Promise<{ documentId: string; status: 'READY' | 'PARTIAL' }> {
    try {
      const document = await this.prisma.contentDocument.findFirst({
        where: {
          id: documentId,
          status: 'ACTIVE',
          trashedAt: null,
          AND: this.dataScope.documents(this.principal()),
        },
        select: { id: true, title: true, originalName: true, mimeType: true },
      });
      if (!document) throw new NotFoundException('知识文档不存在');
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus: KnowledgeProcessingStatus.PROCESSING,
          processingError: null,
        },
      });
      const original = await this.files.getOriginal(documentId);
      const extracted = await this.importer.extract({
        originalname: original.fileName,
        mimetype: original.mimeType,
        size: original.content.length,
        buffer: original.content,
      });
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          title: extracted.title || document.title,
          plainText: extracted.plainText,
        },
      });
      const indexed = await this.indexing.indexDocument(documentId, extracted.plainText);
      const status =
        indexed.embedded < indexed.chunks
          ? KnowledgeProcessingStatus.PARTIAL
          : KnowledgeProcessingStatus.READY;
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus: status,
          indexedAt: new Date(),
          processingError: null,
        },
      });
      await this.record('KNOWLEDGE_INDEX_RETRY', documentId, 'SUCCEEDED', status);
      return { documentId, status };
    } catch (error) {
      await this.prisma.contentDocument
        .update({
          where: { id: documentId },
          data: {
            indexStatus: KnowledgeProcessingStatus.FAILED,
            processingError: '索引修复失败',
          },
        })
        .catch(() => undefined);
      await this.record('KNOWLEDGE_INDEX_RETRY', documentId, 'FAILED', 'FAILED');
      throw error;
    }
  }

  async retryAll(category?: IndexHealthCategory) {
    const health = await this.list(category);
    let succeeded = 0;
    let failed = 0;
    for (const item of health.items) {
      try {
        await this.retryOne(item.documentId);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    return { total: health.items.length, succeeded, failed };
  }

  async ignore(documentId: string): Promise<void> {
    try {
      const document = await this.prisma.contentDocument.findFirst({
        where: {
          id: documentId,
          status: 'ACTIVE',
          trashedAt: null,
          AND: this.dataScope.documents(this.principal()),
        },
        select: { id: true },
      });
      if (!document) throw new NotFoundException('知识文档不存在');
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus: KnowledgeProcessingStatus.MISSING,
          processingError: IGNORE_MARKER,
        },
      });
      await this.record('KNOWLEDGE_INDEX_IGNORE', documentId, 'SUCCEEDED', 'IGNORED');
    } catch (error) {
      await this.record('KNOWLEDGE_INDEX_IGNORE', documentId, 'FAILED', 'FAILED');
      throw error;
    }
  }

  private toHealthItem(
    document: HealthDocument,
    missingEmbeddings: Set<string>,
  ): IndexHealthItem | null {
    const base = {
      documentId: document.id,
      title: document.title,
      fileName: document.originalName || document.title,
    };
    if (
      document.previewStatus === KnowledgeProcessingStatus.MISSING ||
      document.indexStatus === KnowledgeProcessingStatus.MISSING
    ) {
      return { ...base, category: 'FILE_MISSING', reason: '知识源文件已不存在或不可读取' };
    }
    const mimeType = document.mimeType?.split(';')[0]?.toLowerCase();
    if (
      document.sourceKind !== KnowledgeSourceKind.LEGACY &&
      mimeType &&
      !SUPPORTED_MIME_TYPES.has(mimeType)
    ) {
      return { ...base, category: 'UNSUPPORTED_FORMAT', reason: '当前文件格式不支持提取' };
    }
    if (
      !document.plainText.trim() ||
      document.previewStatus === KnowledgeProcessingStatus.FAILED
    ) {
      return { ...base, category: 'EXTRACTION_MISSING', reason: '文件内容尚未成功提取' };
    }
    if (
      document._count.chunks === 0 ||
      new Set<KnowledgeProcessingStatus>([
        KnowledgeProcessingStatus.PENDING,
        KnowledgeProcessingStatus.PROCESSING,
        KnowledgeProcessingStatus.FAILED,
      ]).has(document.indexStatus)
    ) {
      return { ...base, category: 'CHUNKS_MISSING', reason: '提取内容尚未完成切分与索引' };
    }
    if (
      document.indexStatus === KnowledgeProcessingStatus.PARTIAL ||
      missingEmbeddings.has(document.id)
    ) {
      return { ...base, category: 'EMBEDDINGS_MISSING', reason: '文本块尚未全部向量化' };
    }
    return null;
  }

  private record(
    action: string,
    documentId: string,
    outcome: 'SUCCEEDED' | 'FAILED',
    status: string,
  ) {
    return this.audit.record({
      action,
      entityType: 'knowledge_document',
      entityId: documentId,
      outcome,
      changedFields: ['indexStatus', 'processingError'],
      metadata: { objectType: 'knowledge_index', status },
    });
  }
}
