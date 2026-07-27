import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { watch, FSWatcher } from 'chokidar';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { Subject } from 'rxjs';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { DocumentsService } from '../../content/application/documents.service';
import { DocumentImportService } from './document-import.service';
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

export interface SyncProgress {
  watchId: string;
  phase: 'scanning' | 'deleting' | 'importing' | 'done' | 'error';
  total: number;
  current: number;
  currentFile: string;
  percent: number;
  result?: { imported: number; updated: number; deleted: number; errors: number };
  error?: string;
}

@Injectable()
export class FolderWatchService implements OnModuleInit {
  async onModuleInit() {
    await this.resumeAll();
  }
  private readonly logger = new Logger(FolderWatchService.name);
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly scanLocks = new Map<string, Promise<unknown>>();
  private readonly progress = new Map<string, { subject: Subject<SyncProgress>; data: SyncProgress }>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly documents: DocumentsService,
    private readonly importer: DocumentImportService,
    private readonly indexing: IndexingService,
  ) {}

  /** Get an SSE stream of sync progress for a given watch */
  getProgressStream(watchId: string): Subject<SyncProgress> {
    let entry = this.progress.get(watchId);
    if (!entry) {
      entry = {
        subject: new Subject<SyncProgress>(),
        data: { watchId, phase: 'done', total: 0, current: 0, currentFile: '', percent: 100 },
      };
      this.progress.set(watchId, entry);
    }
    return entry.subject;
  }

  /** Start watching a folder: full scan + chokidar watch */
  async startWatching(params: {
    folderPath: string;
    label?: string;
    spaceId: string;
    recursive?: boolean;
  }): Promise<string> {
    const label = params.label || basename(params.folderPath);
    const recursive = params.recursive ?? true;

    try {
      const folderStat = statSync(params.folderPath);
      if (!folderStat.isDirectory()) throw new Error('Path is not a directory');
    } catch (err) {
      throw new Error(`无法访问文件夹: ${params.folderPath} — ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    const watch = await this.prisma.folderWatch.create({
      data: { label, folderPath: params.folderPath, spaceId: params.spaceId, recursive, status: 'ACTIVE' },
    });

    void this.fullScan(watch.id).catch((err) => {
      this.logger.error({ watchId: watch.id, err }, 'Initial full scan failed');
      this.setError(watch.id, err instanceof Error ? err.message : 'Unknown error').catch(() => {});
    });

    this.startWatcher(watch.id, params.folderPath, recursive);
    return watch.id;
  }

  async stopWatching(id: string): Promise<void> {
    const w = this.watchers.get(id);
    if (w) { await w.close(); this.watchers.delete(id); }
    // Clean up progress
    const entry = this.progress.get(id);
    if (entry) { entry.subject.complete(); this.progress.delete(id); }
    await this.prisma.folderWatch.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async rescan(id: string): Promise<{ imported: number; updated: number; deleted: number; errors: number }> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id } });
    if (watch.status !== 'ACTIVE') throw new Error('只能重新扫描活跃的监听');
    return this.fullScan(id);
  }

  /** Get current progress snapshot (for polling fallback) */
  getProgress(id: string): SyncProgress | null {
    return this.progress.get(id)?.data ?? null;
  }

  async list() {
    return this.prisma.folderWatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        space: { select: { id: true, name: true } },
        _count: { select: { files: true } },
      },
    });
  }

  async get(id: string) {
    return this.prisma.folderWatch.findUniqueOrThrow({
      where: { id },
      include: {
        space: { select: { id: true, name: true } },
        files: { orderBy: { filePath: 'asc' }, select: { id: true, filePath: true, documentId: true, status: true, fileHash: true, updatedAt: true } },
      },
    });
  }

  async resumeAll(): Promise<void> {
    const active = await this.prisma.folderWatch.findMany({ where: { status: 'ACTIVE' } });
    for (const w of active) {
      try {
        this.startWatcher(w.id, w.folderPath, w.recursive);
        this.logger.log({ watchId: w.id, folderPath: w.folderPath }, 'Resumed folder watch');
      } catch (err) {
        this.logger.error({ watchId: w.id, err }, 'Failed to resume watch');
      }
    }
  }

  // ── private ──

  private emitProgress(watchId: string, update: Partial<SyncProgress>) {
    const entry = this.progress.get(watchId);
    if (!entry) return;
    entry.data = { ...entry.data, ...update };
    entry.subject.next(entry.data);
    if (entry.data.phase === 'done' || entry.data.phase === 'error') {
      // Keep the subject alive for a bit so late subscribers get the final state,
      // then complete after 30s
      setTimeout(() => { entry.subject.complete(); this.progress.delete(watchId); }, 30_000);
    }
  }

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
    this.emitProgress(watchId, { phase: 'importing', currentFile: basename(filePath) });
    await this.importFile(watchId, filePath);
    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { lastSyncAt: new Date() } });
  }

  private async onFileChanged(watchId: string, filePath: string): Promise<void> {
    if (!this.isSupported(filePath)) return;
    this.emitProgress(watchId, { phase: 'importing', currentFile: basename(filePath) });
    await this.updateFile(watchId, filePath);
    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { lastSyncAt: new Date() } });
  }

  private async onFileRemoved(watchId: string, filePath: string): Promise<void> {
    const existing = await this.prisma.folderFile.findUnique({
      where: { watchId_filePath: { watchId, filePath } },
    });
    if (!existing || existing.status === 'DELETED') return;
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

    await this.prisma.folderWatch.update({ where: { id: watchId }, data: { status: 'ACTIVE', errorMessage: null } });

    const result = { imported: 0, updated: 0, deleted: 0, errors: 0 };

    try {
      // Phase 1: scan folder
      this.emitProgress(watchId, { phase: 'scanning', total: 0, current: 0, currentFile: '正在扫描文件夹...', percent: 0 });
      const currentFiles = this.scanFolder(watch.folderPath, watch.recursive);
      const currentPaths = new Set(currentFiles.map((f) => f.filePath));

      // Phase 2: handle deletions
      const deleted = [...existingPaths].filter((p) => !currentPaths.has(p));
      if (deleted.length > 0) {
        this.emitProgress(watchId, { phase: 'deleting', total: deleted.length, current: 0, currentFile: '', percent: 0 });
        for (let i = 0; i < deleted.length; i++) {
          try {
            const ff = existingFiles.find((f) => f.filePath === deleted[i]);
            if (ff) {
              await this.prisma.$transaction([
                this.prisma.folderFile.update({ where: { id: ff.id }, data: { status: 'DELETED' } }),
                this.prisma.contentDocument.update({ where: { id: ff.documentId }, data: { status: 'TRASHED', trashedAt: new Date() } }),
              ]);
              result.deleted++;
            }
          } catch (err) {
            result.errors++;
            this.logger.error({ filePath: deleted[i], err }, 'Delete handling failed');
          }
          this.emitProgress(watchId, {
            phase: 'deleting', current: i + 1, currentFile: basename(deleted[i]),
            percent: Math.round(((i + 1) / deleted.length) * 100),
          });
        }
      }

      // Phase 3: import or update files
      // Pre-load document plainText for all existing files to detect placeholder content
      const docTexts = new Map<string, string>();
      const existingWithDoc = existingFiles.filter((f) => f.status === 'ACTIVE');
      if (existingWithDoc.length > 0) {
        const docs = await this.prisma.contentDocument.findMany({
          where: { id: { in: existingWithDoc.map((f) => f.documentId) } },
          select: { id: true, plainText: true },
        });
        for (const d of docs) docTexts.set(d.id, d.plainText);
      }

      const toProcess = currentFiles.filter((f) => {
        const existing = existingFiles.find((ef) => ef.filePath === f.filePath);
        if (!existing) return true; // new file
        // Force re-extraction if document has placeholder content (failed previous extraction)
        const pt = docTexts.get(existing.documentId) || '';
        if (pt.startsWith('[需要后端转换') || pt.startsWith('[PDF 文件:') || pt.startsWith('[Excel 文件:') || pt.trim().length === 0) return true;
        const hash = this.hashFile(f.filePath);
        return hash && hash !== existing.fileHash; // changed
      });

      if (toProcess.length > 0) {
        this.emitProgress(watchId, { phase: 'importing', total: toProcess.length, current: 0, currentFile: '', percent: 0 });

        for (let i = 0; i < toProcess.length; i++) {
          const file = toProcess[i];
          try {
            const existing = existingFiles.find((ef) => ef.filePath === file.filePath);
            this.emitProgress(watchId, {
              phase: 'importing', current: i + 1, currentFile: file.fileName,
              percent: Math.round(((i + 1) / toProcess.length) * 100),
            });

            if (!existing) {
              await this.importFile(watchId, file.filePath);
              result.imported++;
            } else {
              await this.updateFile(watchId, file.filePath);
              result.updated++;
            }
          } catch (err) {
            result.errors++;
            this.logger.error({ filePath: file.filePath, err }, 'Import/update failed');
          }
        }
      }
    } catch (err) {
      this.logger.error({ watchId, err }, 'Full scan error');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.emitProgress(watchId, { phase: 'error', error: msg, result });
      await this.setError(watchId, msg);
      throw err;
    }

    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { lastSyncAt: new Date(), errorMessage: null },
    });

    this.emitProgress(watchId, { phase: 'done', current: result.imported + result.updated, percent: 100, result });
    this.logger.log({ watchId, ...result }, 'Full scan complete');
    return result;
  }

  private async importFile(watchId: string, filePath: string): Promise<void> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id: watchId } });
    const hash = this.hashFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const relPath = relative(watch.folderPath, filePath);
    const tags = this.pathTags(relPath);

    // Read file and extract text using DocumentImportService (handles all formats including DOCX/PDF/XLSX)
    const buffer = readFileSync(filePath);
    const mime = this.mimeFromExt(ext);
    const extracted = await this.importer.extract({
      originalname: basename(filePath),
      mimetype: mime,
      size: buffer.length,
      buffer,
    });

    const doc = await this.documents.create({
      type: 'DOCUMENT',
      title: extracted.title,
      plainText: extracted.plainText,
      spaceId: watch.spaceId,
      tags,
    });

    await this.prisma.folderFile.create({
      data: { watchId, filePath, documentId: doc.id, fileHash: hash, status: 'ACTIVE' },
    });

    void this.indexing.indexDocument(doc.id, extracted.plainText).catch((err) => {
      this.logger.error({ documentId: doc.id, filePath, err }, 'Indexing failed');
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
    const extracted = await this.importer.extract({
      originalname: basename(filePath),
      mimetype: mime,
      size: buffer.length,
      buffer,
    });

    await this.documents.update(existing.documentId, { plainText: extracted.plainText });
    await this.prisma.folderFile.update({ where: { id: existing.id }, data: { fileHash: hash } });

    void this.indexing.indexDocument(existing.documentId, extracted.plainText).catch((err) => {
      this.logger.error({ documentId: existing.documentId, err }, 'Re-indexing failed');
    });
  }

  private scanFolder(folderPath: string, recursive: boolean): ScannedFile[] {
    const results: ScannedFile[] = [];
    this.walkDir(folderPath, folderPath, recursive, results);
    return results;
  }

  private walkDir(basePath: string, currentPath: string, recursive: boolean, results: ScannedFile[]): void {
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
          const fileStat = statSync(full);
          results.push({ filePath: full, relativePath: relative(basePath, full), fileName: entry.name, ext, size: fileStat.size });
        }
      }
    }
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
    } catch { return null; }
  }

  private pathTags(relativePath: string): string[] {
    const parts = relativePath.replace(/\\/g, '/').split('/');
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
