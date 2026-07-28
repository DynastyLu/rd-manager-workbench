import { execFile as execFileCallback } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';

const execFile = promisify(execFileCallback);
const PDF_MIME_TYPE = 'application/pdf';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chineseFontConfig(userHomeDirectory: string): string {
  const userFonts = escapeXml(join(userHomeDirectory, 'Library', 'Fonts'));
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/System/Library/Fonts</dir>
  <dir>/Library/Fonts</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir>${userFonts}</dir>
  <alias><family>等线</family><prefer><family>Hiragino Sans GB</family><family>Heiti SC</family></prefer></alias>
  <alias><family>DengXian</family><prefer><family>Hiragino Sans GB</family><family>Heiti SC</family></prefer></alias>
  <alias><family>宋体</family><prefer><family>Songti SC</family><family>Arial Unicode MS</family></prefer></alias>
  <alias><family>SimSun</family><prefer><family>Songti SC</family><family>Arial Unicode MS</family></prefer></alias>
  <alias><family>微软雅黑</family><prefer><family>Hiragino Sans GB</family><family>Heiti SC</family></prefer></alias>
  <alias><family>Microsoft YaHei</family><prefer><family>Hiragino Sans GB</family><family>Heiti SC</family></prefer></alias>
</fontconfig>`;
}

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
    const cacheKey = `knowledge/previews/v2/${input.documentId}/${input.sourceSha256}.pdf`;
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
    const fontConfigPath = join(temporaryDirectory, 'fonts.conf');
    const profilePath = join(temporaryDirectory, 'libreoffice-profile');

    try {
      await writeFile(inputPath, input.content);
      await writeFile(fontConfigPath, chineseFontConfig(homedir()), 'utf8');
      await execFile(binary, [
        '--headless',
        `-env:UserInstallation=${pathToFileURL(profilePath).href}`,
        '--convert-to',
        'pdf',
        '--outdir',
        temporaryDirectory,
        inputPath,
      ], {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          FONTCONFIG_FILE: fontConfigPath,
        },
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
      try {
        await access(configured);
        return configured;
      } catch {
        throw new ServiceUnavailableException(
          `LIBREOFFICE_BIN 指向的程序不存在或不可访问：${configured}`,
        );
      }
    }

    try {
      const { stdout } = await execFile('which', ['soffice']);
      const discovered = stdout.trim();
      if (discovered) return discovered;
    } catch {
      // Check the standard macOS application location next.
    }

    const candidates = [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/opt/homebrew/bin/soffice',
      '/usr/local/bin/soffice',
      join(
        homedir(),
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/MacOS/soffice',
      ),
    ];
    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Try the next supported installation location.
      }
    }

    throw new ServiceUnavailableException(
      '未检测到 LibreOffice，Office 文件仍可下载，但暂时无法生成保真 PDF 预览。请安装 LibreOffice，或通过 LIBREOFFICE_BIN 配置 soffice 路径。',
    );
  }
}
