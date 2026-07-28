import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KnowledgeIndexJobStatus, KnowledgeProcessingStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class IndexingService implements OnModuleInit {
  private readonly logger = new Logger(IndexingService.name);
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly chunking: ChunkingService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.knowledgeIndexJob.updateMany({
      where: { status: KnowledgeIndexJobStatus.RUNNING },
      data: {
        status: KnowledgeIndexJobStatus.INTERRUPTED,
        finishedAt: new Date(),
      },
    });
  }

  schedule(documentId: string): void {
    this.pending.add(documentId);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 1000);
    }
  }

  private async flush() {
    const batch = [...this.pending];
    this.pending.clear();
    this.timer = null;
    for (const id of batch) {
      try {
        const doc = await this.prisma.contentDocument.findUnique({
          where: { id },
          select: { plainText: true },
        });
        if (doc?.plainText) {
          await this.indexDocument(id, doc.plainText);
        }
      } catch (error) {
        this.logger.error({ documentId: id, error }, 'Indexing failed');
      }
    }
  }

  async indexDocument(id: string, plainText: string) {
    const chunks = this.chunking.chunk(plainText, undefined, { documentId: id });
    const vectors = await this.embeddings.embed(chunks.map((chunk) => chunk.content));

    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: id } });

      if (chunks.length === 0) return;

      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const vector = vectors[index] ? `[${vectors[index]!.join(',')}]` : null;
        const pageNumber = typeof chunk.metadata.pageNumber === 'number'
          ? chunk.metadata.pageNumber
          : null;
        const sheetName = typeof chunk.metadata.sheetName === 'string'
          ? chunk.metadata.sheetName
          : null;
        const locationLabel = typeof chunk.metadata.locationLabel === 'string'
          ? chunk.metadata.locationLabel
          : null;
        await tx.$executeRawUnsafe(
          `INSERT INTO app.document_chunks (
             document_id, chunk_index, content, token_count, metadata, embedding,
             page_number, sheet_name, location_label
           )
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::public.vector, $7, $8, $9)
           ON CONFLICT (document_id, chunk_index) DO UPDATE
           SET content = $3, token_count = $4, metadata = $5::jsonb,
               embedding = $6::public.vector, page_number = $7,
               sheet_name = $8, location_label = $9, updated_at = now()`,
          id,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount,
          JSON.stringify(chunk.metadata),
          vector,
          pageNumber,
          sheetName,
          locationLabel,
        );
      }
    });

    return {
      chunks: chunks.length,
      embedded: vectors.filter((vector) => vector !== null).length,
    };
  }

  async indexAll(): Promise<{ jobId: string }> {
    const active = await this.prisma.knowledgeIndexJob.findFirst({
      where: {
        status: { in: [KnowledgeIndexJobStatus.QUEUED, KnowledgeIndexJobStatus.RUNNING] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (active) return { jobId: active.id };

    const docs = await this.prisma.contentDocument.findMany({
      where: { status: 'ACTIVE', trashedAt: null, plainText: { not: '' } },
      select: { id: true, plainText: true },
    });
    const job = await this.prisma.knowledgeIndexJob.create({
      data: {
        status: KnowledgeIndexJobStatus.QUEUED,
        totalFiles: docs.length,
      },
      select: { id: true },
    });

    setImmediate(() => {
      void this.runIndexJob(job.id, docs).catch((error: unknown) => {
        this.logger.error({ jobId: job.id, error }, 'Reindex job failed');
      });
    });
    return { jobId: job.id };
  }

  private async runIndexJob(
    jobId: string,
    docs: Array<{ id: string; plainText: string }>,
  ): Promise<void> {
    await this.prisma.knowledgeIndexJob.update({
      where: { id: jobId },
      data: { status: KnowledgeIndexJobStatus.RUNNING, startedAt: new Date() },
    });

    let processed = 0;
    let failed = 0;
    const errors: Array<{ documentId: string; message: string }> = [];

    for (const doc of docs) {
      try {
        const result = await this.indexDocument(doc.id, doc.plainText);
        await this.prisma.contentDocument.update({
          where: { id: doc.id },
          data: {
            indexStatus: result.embedded < result.chunks
              ? KnowledgeProcessingStatus.PARTIAL
              : KnowledgeProcessingStatus.READY,
            indexedAt: new Date(),
          },
        });
      } catch (error) {
        failed += 1;
        errors.push({
          documentId: doc.id,
          message: error instanceof Error ? error.message : 'Indexing failed',
        });
        await this.prisma.contentDocument.update({
          where: { id: doc.id },
          data: { indexStatus: KnowledgeProcessingStatus.FAILED },
        }).catch(() => undefined);
      }
      processed += 1;
      await this.prisma.knowledgeIndexJob.update({
        where: { id: jobId },
        data: {
          processedFiles: processed,
          failedFiles: failed,
          currentFile: doc.id,
          errors,
        },
      });
    }

    const status = failed === 0
      ? KnowledgeIndexJobStatus.SUCCEEDED
      : failed === docs.length
        ? KnowledgeIndexJobStatus.FAILED
        : KnowledgeIndexJobStatus.PARTIAL;
    await this.prisma.knowledgeIndexJob.update({
      where: { id: jobId },
      data: {
        status,
        processedFiles: processed,
        failedFiles: failed,
        currentFile: null,
        errors,
        finishedAt: new Date(),
      },
    });
    this.logger.log({ jobId, processed, failed }, 'Reindex complete');
  }

  async getStatus() {
    const [indexedCount, totalCount, totalChunks] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(DISTINCT document_id) as count FROM app.document_chunks`,
      ),
      this.prisma.contentDocument.count({
        where: { status: 'ACTIVE', trashedAt: null },
      }),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM app.document_chunks`,
      ),
    ]);

    const latestJob = await this.prisma.knowledgeIndexJob.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    return {
      indexedDocuments: Number(indexedCount[0]?.count ?? 0),
      totalDocuments: totalCount,
      totalChunks: Number(totalChunks[0]?.count ?? 0),
      complete: Number(indexedCount[0]?.count ?? 0) >= totalCount,
      latestJob,
    };
  }
}
