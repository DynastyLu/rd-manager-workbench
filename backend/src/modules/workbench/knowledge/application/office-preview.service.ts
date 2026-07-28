import { execFile as execFileCallback } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';

const execFile = promisify(execFileCallback);
const PDF_MIME_TYPE = 'application/pdf';

export interface OfficePreviewInput {
  documentId: string;
  fileName: string;
  sourceSha256: string;
  content: Buffer;
}

@Injectable()
export class OfficePreviewService {
  constructor(private readonly storage: StoragePort) {}

  async convertToPdf(input: OfficePreviewInput) {
    const cacheKey = `knowledge/previews/${input.documentId}/${input.sourceSha256}.pdf`;
    try {
      const cached = await this.storage.read(cacheKey);
      return { content: cached.content, mimeType: PDF_MIME_TYPE, storageKey: cacheKey };
    } catch {
      // Cache miss: generate the preview below.
    }

    const binary = await this.resolveLibreOfficeBinary();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'rd-knowledge-preview-'));
    const extension = extname(input.fileName);
    const safeBaseName = basename(input.fileName, extension).replace(/[^a-zA-Z0-9_-]+/g, '_') || 'document';
    const inputPath = join(temporaryDirectory, `${safeBaseName}${extension.toLowerCase()}`);
    const outputPath = join(temporaryDirectory, `${safeBaseName}.pdf`);

    try {
      await writeFile(inputPath, input.content);
      await execFile(binary, [
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        temporaryDirectory,
        inputPath,
      ], {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const content = await readFile(outputPath);
      await this.storage.write({ key: cacheKey, content, mimeType: PDF_MIME_TYPE });
      return { content, mimeType: PDF_MIME_TYPE, storageKey: cacheKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Office preview conversion failed';
      throw new ServiceUnavailableException(`Office 文件预览生成失败：${message}`);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async resolveLibreOfficeBinary(): Promise<string> {
    const configured = process.env.LIBREOFFICE_BIN?.trim();
    if (configured) {
      await access(configured);
      return configured;
    }

    try {
      const { stdout } = await execFile('which', ['soffice']);
      const discovered = stdout.trim();
      if (discovered) return discovered;
    } catch {
      // Check the standard macOS application location next.
    }

    const macBinary = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
    try {
      await access(macBinary);
      return macBinary;
    } catch {
      throw new ServiceUnavailableException(
        '未检测到 LibreOffice，Office 文件仍可下载，但暂时无法生成保真 PDF 预览。',
      );
    }
  }
}
