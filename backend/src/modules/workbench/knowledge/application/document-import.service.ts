import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'node:child_process';
import type { UploadedContentFile } from '../../content/application/files.service';

interface ExtractedDocument {
  title: string;
  plainText: string;
  wordCount: number;
}

@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);

  /**
   * Decode filename: handles both properly-decoded UTF-8 (modern multer/busboy)
   * and latin1-mojibake (older multer or certain Content-Disposition encodings).
   *
   * Strategy: if the string already contains valid multibyte UTF-8 sequences, it's
   * already correct. Otherwise, try the latin1 → utf8 recovery.
   */
  private decodeFilename(originalname: string): string {
    // Check if the name looks like it's already valid UTF-8 with CJK characters
    // If it contains bytes 0x80-0xFF, they should form valid UTF-8 sequences
    // Simple heuristic: try decoding as latin1→utf8 and check if the result
    // "looks more Chinese" — i.e., has more CJK codepoints
    try {
      const asLatin1 = Buffer.from(originalname, 'latin1').toString('utf8');
      // Count CJK characters in both versions
      const cjkRe = /[一-鿿㐀-䶿]/g;
      const origCjk = (originalname.match(cjkRe) || []).length;
      const fixedCjk = (asLatin1.match(cjkRe) || []).length;
      // If the latin1→utf8 conversion yields more CJK chars, the name was garbled
      if (fixedCjk > origCjk) return asLatin1;
    } catch { /* fall through */ }
    return originalname;
  }

  private stripExt(name: string): string {
    return name.replace(/\.(txt|md|docx|pdf|html?|xlsx?|csv|json)$/i, '');
  }

  /**
   * Decode buffer to text with encoding detection.
   * Tries UTF-8 first, then falls back to GBK for Chinese Windows files.
   */
  private decodeText(buffer: Buffer): string {
    const utf8 = buffer.toString('utf-8');
    // Quick check: if UTF-8 decoding produced many replacement chars (�),
    // the file is likely in a different encoding (e.g., GBK on Windows)
    const replacementCount = (utf8.match(/�/g) || []).length;
    if (replacementCount > 0 && replacementCount > utf8.length * 0.01) {
      try {
        // Node.js TextDecoder supports 'gbk' in full-ICU builds
        return new TextDecoder('gbk').decode(buffer);
      } catch {
        // TextDecoder('gbk') not available; return UTF-8 as-is with a note
        const bom = buffer[0] === 0xFF && buffer[1] === 0xFE ? 'UTF-16LE' :
                    buffer[0] === 0xFE && buffer[1] === 0xFF ? 'UTF-16BE' : null;
        if (bom) {
          try { return new TextDecoder(bom).decode(buffer); } catch { /* fall through */ }
        }
        this.logger.warn('File appears to be non-UTF-8; GBK decoder unavailable. Content may have garbled characters.');
      }
    }
    return utf8;
  }

  /**
   * Extract text from PDF using pdftotext (best for Chinese PDFs) with pdf-parse fallback.
   * Returns null if all methods fail.
   */
  private async extractPdf(buffer: Buffer): Promise<string | null> {
    // Method 1: pdftotext (poppler-utils) — handles Chinese PDFs best
    try {
      const { writeFileSync, unlinkSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const { randomUUID } = await import('node:crypto');
      const tmpPath = join(tmpdir(), `kb-pdf-${randomUUID()}.pdf`);
      writeFileSync(tmpPath, buffer);
      try {
        const result = execSync(`pdftotext -layout -enc UTF-8 "${tmpPath}" -`, {
          encoding: 'utf-8', timeout: 15_000, maxBuffer: 10 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (result && result.trim().length > 0) {
          this.logger.log(`pdftotext extracted ${result.length} chars`);
          return result;
        }
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    } catch (err) {
      this.logger.warn(`pdftotext failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Method 2: pdf-parse (pdf.js based) — works for some PDFs
    try {
      const pdfParseModule = await import('pdf-parse') as any;
      const { PDFParse } = pdfParseModule;
      const parser = new PDFParse(new Uint8Array(buffer));
      await parser.load();
      const result = await parser.getText();
      const text: string = typeof result.text === 'string' ? result.text : String(result);
      if (text.trim().length > 0) {
        this.logger.log(`pdf-parse extracted ${text.length} chars`);
        return text;
      }
    } catch (err) {
      this.logger.warn(`pdf-parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return null;
  }

  async extract(file: UploadedContentFile): Promise<ExtractedDocument> {
    const buffer = file.buffer;
    const rawName = file.originalname ?? 'untitled';
    const decodedName = this.decodeFilename(rawName);
    const name = this.stripExt(decodedName);
    const mime = file.mimetype;

    // --- Plain text formats ---
    if (
      mime === 'text/plain' ||
      mime === 'text/markdown' ||
      mime === 'text/x-markdown' ||
      mime === 'text/csv' ||
      mime === 'text/html' ||
      mime === 'application/json'
    ) {
      return { title: name, plainText: this.decodeText(buffer), wordCount: buffer.length };
    }

    // --- DOCX ---
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return { title: name, plainText: String(result.value), wordCount: String(result.value).length };
    }

    // --- PDF ---
    if (mime === 'application/pdf') {
      const plainText = await this.extractPdf(buffer);
      if (plainText !== null) return { title: name, plainText, wordCount: plainText.length };
      return { title: name, plainText: `[PDF 文件: ${name}]`, wordCount: 0 };
    }

    // --- XLSX / XLS ---
    if (
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel'
    ) {
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const lines: string[] = [];
        workbook.SheetNames.forEach((sheetName: string) => {
          lines.push(`\n=== ${sheetName} ===\n`);
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          lines.push(csv);
        });
        return { title: name, plainText: lines.join('\n'), wordCount: lines.join('').length };
      } catch (err) {
        this.logger.error({ err }, 'XLSX parse failed');
        return { title: name, plainText: `[Excel 文件: ${name}]`, wordCount: 0 };
      }
    }

    // --- Fallback: try as UTF-8 text ---
    try {
      const text = buffer.toString('utf-8');
      if (text.length > 0) {
        return { title: name, plainText: text, wordCount: text.length };
      }
    } catch { /* fall through */ }

    throw new Error(`无法解析该文件格式 (${mime})，请尝试 TXT、MD、DOCX、PDF、HTML、CSV、XLSX 或 JSON`);
  }
}
