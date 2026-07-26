import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly chunking: ChunkingService,
    private readonly embedding: EmbeddingService,
  ) {}

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
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embedding.embed(texts);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: id } });

      if (chunks.length === 0) return;

      const rows = chunks.map((chunk, i) => ({
        documentId: id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: chunk.metadata as any,
      }));

      // createMany doesn't support Unsupported fields, do individual creates
      for (let i = 0; i < rows.length; i++) {
        await tx.$executeRawUnsafe(
          `INSERT INTO app.document_chunks (document_id, chunk_index, content, token_count, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::public.vector, $6)
           ON CONFLICT (document_id, chunk_index) DO UPDATE
           SET content = $3, token_count = $4, embedding = $5::public.vector, metadata = $6, updated_at = now()`,
          rows[i].documentId,
          rows[i].chunkIndex,
          rows[i].content,
          rows[i].tokenCount,
          embeddings[i] || null,
          JSON.stringify(rows[i].metadata),
        );
      }
    });
  }

  async indexAll(): Promise<{ jobId: string }> {
    const jobId = `reindex-${Date.now()}`;
    const docs = await this.prisma.contentDocument.findMany({
      where: { status: 'ACTIVE', trashedAt: null, plainText: { not: '' } },
      select: { id: true, plainText: true },
    });

    let indexed = 0;
    let failed = 0;
    const failedIds: string[] = [];

    for (let i = 0; i < docs.length; i += 10) {
      const batch = docs.slice(i, i + 10);
      await Promise.all(batch.map(async (doc) => {
        try {
          await this.indexDocument(doc.id, doc.plainText);
          indexed++;
        } catch (error) {
          this.logger.error({ documentId: doc.id, error }, 'Reindex failed');
          failed++;
          failedIds.push(doc.id);
        }
      }));
    }

    this.logger.log({ jobId, indexed, failed }, 'Reindex complete');
    return { jobId };
  }

  async getStatus() {
    const [indexedCount, totalCount, missingEmbedding] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(DISTINCT document_id) as count FROM app.document_chunks WHERE embedding IS NOT NULL`,
      ),
      this.prisma.contentDocument.count({
        where: { status: 'ACTIVE', trashedAt: null },
      }),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM app.document_chunks WHERE embedding IS NULL`,
      ),
    ]);

    return {
      indexedDocuments: Number(indexedCount[0]?.count ?? 0),
      totalDocuments: totalCount,
      missingEmbeddingChunks: Number(missingEmbedding[0]?.count ?? 0),
      complete: Number(indexedCount[0]?.count ?? 0) >= totalCount,
    };
  }
}
