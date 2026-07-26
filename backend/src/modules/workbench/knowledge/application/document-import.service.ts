import { Injectable, Logger } from '@nestjs/common';
import type { UploadedContentFile } from '../../content/application/files.service';

interface ExtractedDocument {
  title: string;
  plainText: string;
  wordCount: number;
}

@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);
  private readonly supportedTypes = [
    'text/plain', 'text/markdown', 'text/x-markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
  ];

  supports(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async extract(file: UploadedContentFile): Promise<ExtractedDocument> {
    const buffer = file.buffer;
    const name = (file.originalname ?? 'untitled').replace(/\.(txt|md|docx|pdf)$/i, '');

    switch (file.mimetype) {
      case 'text/plain':
      case 'text/markdown':
      case 'text/x-markdown':
        return { title: name, plainText: buffer.toString('utf-8'), wordCount: 0 };

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const mammoth = await import('mammoth');
        const result = await (mammoth as any).extractRawText({ buffer });
        return { title: name, plainText: String(result.value), wordCount: String(result.value).length };
      }

      case 'application/pdf': {
        try {
          const pdfParse = await import('pdf-parse');
          const data: { text: string } = await (pdfParse as any).default(buffer);
          return { title: name, plainText: data.text, wordCount: data.text.length };
        } catch {
          this.logger.warn('pdf-parse not available, trying fallback');
          return { title: name, plainText: `[PDF: ${name}]`, wordCount: 0 };
        }
      }

      default:
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
  }
}
