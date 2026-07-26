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
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const headingMatch = paragraph.match(/^(#{1,6})\s+(.+)$/m);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        headingPath = [...headingPath.slice(0, level - 1), title];
      }

      const joined = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

      if (estimateTokens(joined) <= options.chunkSize) {
        currentChunk = joined;
      } else {
        if (currentChunk) {
          chunks.push({
            chunkIndex: chunkIndex++,
            content: currentChunk,
            tokenCount: estimateTokens(currentChunk),
            metadata: { ...baseMetadata, headingPath: [...headingPath] },
          });
        }

        if (estimateTokens(paragraph) > options.chunkSize) {
          const sentences = paragraph.split(/(?<=[。！？.!?])\s*/);
          let sentenceChunk = '';
          for (const sentence of sentences) {
            const candidate = sentenceChunk ? `${sentenceChunk}${sentence}` : sentence;
            if (estimateTokens(candidate) <= options.chunkSize) {
              sentenceChunk = candidate;
            } else {
              if (sentenceChunk) {
                chunks.push({
                  chunkIndex: chunkIndex++,
                  content: sentenceChunk,
                  tokenCount: estimateTokens(sentenceChunk),
                  metadata: { ...baseMetadata, headingPath: [...headingPath] },
                });
              }
              sentenceChunk = sentence;
            }
          }
          currentChunk = sentenceChunk || '';
        } else {
          currentChunk = paragraph;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: currentChunk,
        tokenCount: estimateTokens(currentChunk),
        metadata: { ...baseMetadata, headingPath: [...headingPath] },
      });
    }

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
