import { Injectable } from '@nestjs/common';
import { estimateTokens, splitByParagraphs } from '../domain/chunking';
import { DEFAULT_CHUNKING, DocumentChunkInput } from '../domain/knowledge.types';

@Injectable()
export class ChunkingService {
  chunk(
    text: string,
    options = DEFAULT_CHUNKING,
    baseMetadata: Record<string, unknown> = {},
  ): Omit<DocumentChunkInput, 'documentId'>[] {
    const paragraphs = splitByParagraphs(text);
    const chunks: Omit<DocumentChunkInput, 'documentId'>[] = [];
    let currentChunk = '';
    let headingPath: string[] = [];
    let currentSheetName: string | undefined;
    let currentMetadata: Record<string, unknown> = { ...baseMetadata, headingPath: [] };
    let chunkIndex = 0;

    const metadataForCurrentLocation = (): Record<string, unknown> => ({
      ...baseMetadata,
      headingPath: [...headingPath],
      ...(currentSheetName
        ? {
            sheetName: currentSheetName,
            locationLabel: `工作表：${currentSheetName}`,
          }
        : headingPath.length > 0
          ? { locationLabel: headingPath.join(' / ') }
          : {}),
    });

    const pushChunk = (content: string, metadata: Record<string, unknown>) => {
      if (!content.trim()) return;
      chunks.push({
        chunkIndex: chunkIndex++,
        content,
        tokenCount: estimateTokens(content),
        metadata,
      });
    };

    for (const paragraph of paragraphs) {
      const sheetMatch = paragraph.match(/^===\s*(.+?)\s*===\s*(?:\r?\n|$)/);
      if (sheetMatch && currentChunk) {
        pushChunk(currentChunk, currentMetadata);
        currentChunk = '';
      }
      if (sheetMatch) {
        currentSheetName = sheetMatch[1].trim();
        headingPath = [];
      }

      const headingMatch = paragraph.match(/^(#{1,6})\s+(.+)$/m);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        headingPath = [...headingPath.slice(0, level - 1), title];
      }
      const paragraphMetadata = metadataForCurrentLocation();

      const joined = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

      if (estimateTokens(joined) <= options.chunkSize) {
        if (!currentChunk) currentMetadata = paragraphMetadata;
        currentChunk = joined;
      } else {
        pushChunk(currentChunk, currentMetadata);

        if (estimateTokens(paragraph) > options.chunkSize) {
          const sentences = paragraph.split(/(?<=[。！？.!?])\s*/);
          let sentenceChunk = '';
          for (const sentence of sentences) {
            const candidate = sentenceChunk ? `${sentenceChunk}${sentence}` : sentence;
            if (estimateTokens(candidate) <= options.chunkSize) {
              sentenceChunk = candidate;
            } else {
              pushChunk(sentenceChunk, paragraphMetadata);
              sentenceChunk = sentence;
            }
          }
          currentChunk = sentenceChunk || '';
          currentMetadata = paragraphMetadata;
        } else {
          currentChunk = paragraph;
          currentMetadata = paragraphMetadata;
        }
      }
    }

    pushChunk(currentChunk, currentMetadata);

    // Apply overlap
    if (options.chunkOverlap > 0 && chunks.length > 1) {
      for (let i = 1; i < chunks.length; i++) {
        const prev = chunks[i - 1].content;
        const overlapLen = Math.floor(options.chunkOverlap * 2);
        const overlapText = prev.slice(-overlapLen);
        chunks[i].content = overlapText + '\n\n' + chunks[i].content;
        chunks[i].tokenCount = estimateTokens(chunks[i].content);
      }
    }

    return chunks;
  }
}
