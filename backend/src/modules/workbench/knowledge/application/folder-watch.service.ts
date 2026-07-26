import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { watch, FSWatcher } from 'chokidar';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { DocumentsService } from '../../content/application/documents.service';
import { IndexingService } from './indexing.service';

const SUPPORTED_EXTS = new Set([
  '.txt', '.md', '.docx', '.pdf', '.html', '.htm', '.xlsx', '.xls', '.csv', '.json',
]);

interface ScannedFile {
  filePath: string;
  relativePath: string;
  fileName: string;
  ext: string;
  size: number;
}

@Injectable()
export class FolderWatchService implements OnModuleInit {
  async onModuleInit() {
    // Resume active folder watches on app startup
    await this.resumeAll();
  }
  private readonly logger = new Logger(FolderWatchService.name);
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly scanLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly documents: DocumentsService,
    private readonly indexing: IndexingService,
  ) {}

  /** Start watching a folder: full scan + chokidar watch */
  async startWatching(params: {
    folderPath: string;
    label?: string;
    spaceId: string;
    recursive?: boolean;
  }): Promise<string> {
    const label = params.label || basename(params.folderPath);
    const recursive = params.recursive ?? true;

    // Verify folder exists
    try {
      const folderStat = statSync(params.folderPath);
      if (!folderStat.isDirectory()) throw new Error('Path is not a directory');
    } catch (err) {
      throw new Error(`无法访问文件夹: ${params.folderPath} — ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    // Create DB record
    const watch = await this.prisma.folderWatch.create({
      data: {
        label,
        folderPath: params.folderPath,
        spaceId: params.spaceId,
        recursive,
        status: 'ACTIVE',
      },
    });

    // Full scan (async, non-blocking)
    void this.fullScan(watch.id).catch((err) => {
      this.logger.error({ watchId: watch.id, err }, 'Initial full scan failed');
      this.setError(watch.id, err instanceof Error ? err.message : 'Unknown error').catch(() => {});
    });

    // Set up watcher
    this.startWatcher(watch.id, params.folderPath, recursive);

    return watch.id;
  }

  /** Stop watching a folder */
  async stopWatching(id: string): Promise<void> {
    const w = this.watchers.get(id);
    if (w) {
      await w.close();
      this.watchers.delete(id);
    }
    await this.prisma.folderWatch.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  /** Force a full rescan of an active watch */
  async rescan(id: string): Promise<{ imported: number; updated: number; deleted: number; errors: number }> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id } });
    if (watch.status !== 'ACTIVE') {
      throw new Error('只能重新扫描活跃的监听');
    }
    // Queue the scan (serialize per watch)
    const promise = this.fullScan(id);
    this.scanLocks.set(id, promise);
    const result = await promise;
    this.scanLocks.delete(id);
    return result;
  }

  /** List all watched folders */
  async list() {
    return this.prisma.folderWatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        space: { select: { id: true, name: true } },
        _count: { select: { files: true } },
      },
    });
  }

  /** Get a single watch */
  async get(id: string) {
    return this.prisma.folderWatch.findUniqueOrThrow({
      where: { id },
      include: {
        space: { select: { id: true, name: true } },
        files: { orderBy: { filePath: 'asc' }, select: { id: true, filePath: true, documentId: true, status: true, fileHash: true, updatedAt: true } },
      },
    });
  }

  /** Resume all active watches on app startup */
  async resumeAll(): Promise<void> {
    const active = await this.prisma.folderWatch.findMany({ where: { status: 'ACTIVE' } });
    for (const w of active) {
      try {
        this.startWatcher(w.id, w.folderPath, w.recursive);
        void this.fullScan(w.id).catch((err) => {
          this.logger.error({ watchId: w.id, err }, 'Resume full scan failed');
          this.setError(w.id, err instanceof Error ? err.message : 'Unknown error').catch(() => {});
        });
        this.logger.log({ watchId: w.id, folderPath: w.folderPath }, 'Resumed folder watch');
      } catch (err) {
        this.logger.error({ watchId: w.id, err }, 'Failed to resume watch');
      }
    }
  }

  // ── private ──

  private startWatcher(watchId: string, folderPath: string, recursive: boolean): void {
    const w = watch(folderPath, {
      ignored: /(^|[\/\\])\..|node_modules|\/node_modules\//,
      persistent: true,
      ignoreInitial: true,
      depth: recursive ? undefined : 0,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    w.on('add', (filePath) => this.onFileAdded(watchId, filePath));
    w.on('change', (filePath) => this.onFileChanged(watchId, filePath));
    w.on('unlink', (filePath) => this.onFileRemoved(watchId, filePath));
    w.on('error', (err) => {
      this.logger.error({ watchId, err }, 'FSWatcher error');
      this.setError(watchId, err instanceof Error ? err.message : String(err)).catch(() => {});
    });

    this.watchers.set(watchId, w);
  }

  private async onFileAdded(watchId: string, filePath: string): Promise<void> {
    if (!this.isSupported(filePath)) return;
    await this.importFile(watchId, filePath);
    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { lastSyncAt: new Date() } });
  }

  private async onFileChanged(watchId: string, filePath: string): Promise<void> {
    if (!this.isSupported(filePath)) return;
    await this.updateFile(watchId, filePath);
    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { lastSyncAt: new Date() } });
  }

  private async onFileRemoved(watchId: string, filePath: string): Promise<void> {
    const existing = await this.prisma.folderFile.findUnique({
      where: { watchId_filePath: { watchId, filePath } },
    });
    if (!existing || existing.status === 'DELETED') return;
    // Mark as deleted and trash the document
    await this.prisma.$transaction([
      this.prisma.folderFile.update({ where: { id: existing.id }, data: { status: 'DELETED' } }),
      this.prisma.contentDocument.update({ where: { id: existing.documentId }, data: { status: 'TRASHED', trashedAt: new Date() } }),
    ]);
    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { lastSyncAt: new Date() } });
  }

  private async fullScan(watchId: string): Promise<{ imported: number; updated: number; deleted: number; errors: number }> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id: watchId } });
    const existingFiles = await this.prisma.folderFile.findMany({ where: { watchId, status: 'ACTIVE' } });
    const existingPaths = new Set(existingFiles.map((f) => f.filePath));

    // Update status
    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { status: 'ACTIVE', errorMessage: null } });

    const result = { imported: 0, updated: 0, deleted: 0, errors: 0 };

    try {
      // Scan for current files
      const currentFiles = this.scanFolder(watch.folderPath, watch.recursive);
      const currentPaths = new Set(currentFiles.map((f) => f.filePath));

      // Detect deletions
      const deleted = [...existingPaths].filter((p) => !currentPaths.has(p));
      for (const filePath of deleted) {
        try {
          const ff = existingFiles.find((f) => f.filePath === filePath);
          if (ff) {
            await this.prisma.$transaction([
              this.prisma.folderFile.update({ where: { id: ff.id }, data: { status: 'DELETED' } }),
              this.prisma.contentDocument.update({ where: { id: ff.documentId }, data: { status: 'TRASHED', trashedAt: new Date() } }),
            ]);
            result.deleted++;
          }
        } catch (err) {
          result.errors++;
          this.logger.error({ filePath, err }, 'Delete handling failed during scan');
        }
      }

      // Import or update
      for (const file of currentFiles) {
        try {
          const existing = existingFiles.find((f) => f.filePath === file.filePath);
          if (!existing) {
            await this.importFile(watchId, file.filePath);
            result.imported++;
          } else {
            const hash = this.hashFile(file.filePath);
            if (hash && hash !== existing.fileHash) {
              await this.updateFile(watchId, file.filePath);
              result.updated++;
            }
          }
        } catch (err) {
          result.errors++;
          this.logger.error({ filePath: file.filePath, err }, 'Import/update failed during scan');
        }
      }
    } catch (err) {
      this.logger.error({ watchId, err }, 'Full scan error');
      await this.setError(watchId, err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }

    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { lastSyncAt: new Date(), errorMessage: null },
    });

    this.logger.log({ watchId, ...result }, 'Full scan complete');
    return result;
  }

  private async importFile(watchId: string, filePath: string): Promise<void> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id: watchId } });
    const hash = this.hashFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const fileName = basename(filePath, ext);
    const relPath = relative(watch.folderPath, filePath);
    const tags = this.pathTags(relPath);

    // Extract text
    const buffer = readFileSync(filePath);
    const mime = this.mimeFromExt(ext);
    const plainText = this.extractText(filePath, buffer, mime);

    // Create document
    const doc = await this.documents.create({
      type: 'DOCUMENT',
      title: fileName,
      plainText,
      spaceId: watch.spaceId,
      tags,
    });

    // Track mapping
    await this.prisma.folderFile.create({
      data: { watchId, filePath, documentId: doc.id, fileHash: hash, status: 'ACTIVE' },
    });

    // Index (async, non-blocking)
    void this.indexing.indexDocument(doc.id, plainText).catch((err) => {
      this.logger.error({ documentId: doc.id, filePath, err }, 'Indexing failed for imported file');
    });
  }

  private async updateFile(watchId: string, filePath: string): Promise<void> {
    const existing = await this.prisma.folderFile.findUniqueOrThrow({
      where: { watchId_filePath: { watchId, filePath } },
    });
    if (existing.status === 'DELETED') return;

    const hash = this.hashFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const buffer = readFileSync(filePath);
    const mime = this.mimeFromExt(ext);
    const plainText = this.extractText(filePath, buffer, mime);

    // Update document
    const doc = await this.documents.update(existing.documentId, { plainText });
    await this.prisma.folderFile.update({
      where: { id: existing.id },
      data: { fileHash: hash },
    });

    // Re-index
    void this.indexing.indexDocument(doc.id, plainText).catch((err) => {
      this.logger.error({ documentId: doc.id, err }, 'Re-indexing failed for updated file');
    });
  }

  private scanFolder(folderPath: string, recursive: boolean): ScannedFile[] {
    const results: ScannedFile[] = [];
    this.walkDir(folderPath, folderPath, recursive, results);
    return results;
  }

  private walkDir(basePath: string, currentPath: string, recursive: boolean, results: ScannedFile[]): void {
    const { readdirSync } = require('node:fs');
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = `${currentPath}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.walkDir(basePath, full, recursive, results);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          const stat = statSync(full);
          results.push({
            filePath: full,
            relativePath: relative(basePath, full),
            fileName: entry.name,
            ext,
            size: stat.size,
          });
        }
      }
    }
  }

  private extractText(filePath: string, buffer: Buffer, mime: string): string {
    // Plain text formats
    if (['text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json'].includes(mime)) {
      const utf8 = buffer.toString('utf-8');
      const replacementCount = (utf8.match(/�/g) || []).length;
      if (replacementCount > 0 && replacementCount > utf8.length * 0.01) {
        try { return new TextDecoder('gbk').decode(buffer); } catch { /* fall through */ }
      }
      return utf8;
    }

    // DOCX
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Can't use async import in sync context, store placeholder and re-index async
      return `[需要后端转换: ${basename(filePath)}]\n文件大小: ${buffer.length} bytes`;
    }

    // PDF
    if (mime === 'application/pdf') {
      return `[需要后端转换: ${basename(filePath)}]\n文件大小: ${buffer.length} bytes`;
    }

    // XLSX/XLS
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mime === 'application/vnd.ms-excel') {
      return `[需要后端转换: ${basename(filePath)}]\n文件大小: ${buffer.length} bytes`;
    }

    // Fallback
    const text = buffer.toString('utf-8');
    return text.length > 0 ? text : `[二进制文件: ${basename(filePath)}]`;
  }

  private mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
      '.html': 'text/html', '.htm': 'text/html', '.json': 'application/json',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
    };
    return map[ext] || 'text/plain';
  }

  private hashFile(filePath: string): string | null {
    try {
      const buf = readFileSync(filePath);
      return createHash('sha256').update(buf).digest('hex');
    } catch {
      return null;
    }
  }

  private pathTags(relativePath: string): string[] {
    const parts = relativePath.replace(/\\/g, '/').split('/');
    // Remove the filename from the last segment
    parts.pop();
    return parts.filter(Boolean);
  }

  private isSupported(filePath: string): boolean {
    return SUPPORTED_EXTS.has(extname(filePath).toLowerCase());
  }

  private async setError(watchId: string, message: string): Promise<void> {
    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { status: 'ERROR', errorMessage: message.slice(0, 1000) },
    }).catch(() => {});
  }
}
