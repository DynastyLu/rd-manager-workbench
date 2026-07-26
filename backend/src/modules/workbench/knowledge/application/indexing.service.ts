import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { ChunkingService } from './chunking.service';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly chunking: ChunkingService,
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

    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: id } });

      if (chunks.length === 0) return;

      for (const chunk of chunks) {
        await tx.$executeRawUnsafe(
          `INSERT INTO app.document_chunks (document_id, chunk_index, content, token_count, metadata)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (document_id, chunk_index) DO UPDATE
           SET content = $3, token_count = $4, metadata = $5, updated_at = now()`,
          id,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount,
          JSON.stringify(chunk.metadata),
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

    return {
      indexedDocuments: Number(indexedCount[0]?.count ?? 0),
      totalDocuments: totalCount,
      totalChunks: Number(totalChunks[0]?.count ?? 0),
      complete: Number(indexedCount[0]?.count ?? 0) >= totalCount,
    };
  }
}
