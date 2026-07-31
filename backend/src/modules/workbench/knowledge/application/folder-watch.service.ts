import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { watch, FSWatcher } from 'chokidar';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { BehaviorSubject } from 'rxjs';
import { KnowledgeProcessingStatus, KnowledgeSourceKind } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import type { AuthenticatedPrincipal } from '../../../iam/domain/principal';
import { DocumentImportService } from './document-import.service';
import { IndexingService } from './indexing.service';

const SUPPORTED_EXTS = new Set([
  '.txt',
  '.md',
  '.docx',
  '.pdf',
  '.html',
  '.htm',
  '.xlsx',
  '.xls',
  '.csv',
  '.json',
]);

interface ScannedFile {
  filePath: string;
  relativePath: string;
  fileName: string;
  ext: string;
  size: number;
  sha256: string;
  modifiedAt: Date;
}

export interface SyncProgress {
  watchId: string;
  phase: 'scanning' | 'deleting' | 'importing' | 'done' | 'error';
  total: number;
  current: number;
  scanned: number;
  currentFile: string;
  percent: number;
  result?: SyncResult;
  error?: string;
  counts: SyncCounts;
  failedFiles: SyncFailure[];
}

export interface SyncCounts {
  discovered: number;
  pending: number;
  success: number;
  updated: number;
  skipped: number;
  deleted: number;
  failed: number;
}

export interface SyncFailure {
  fileName: string;
  category: 'READ_FAILED' | 'EXTRACTION_FAILED' | 'INDEX_FAILED' | 'DELETE_FAILED' | 'UNKNOWN';
  reason: string;
}

type FailedTarget = {
  filePath: string;
  operation: 'import' | 'update' | 'delete';
};

export interface SyncResult {
  scanned: number;
  imported: number;
  updated: number;
  deleted: number;
  errors: number;
}

@Injectable()
export class FolderWatchService implements OnModuleInit {
  async onModuleInit() {
    await this.resumeAll();
  }
  private readonly logger = new Logger(FolderWatchService.name);
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly scanLocks = new Map<string, Promise<unknown>>();
  private readonly progress = new Map<string, BehaviorSubject<SyncProgress>>();
  private readonly failedTargets = new Map<string, FailedTarget[]>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly importer: DocumentImportService,
    private readonly indexing: IndexingService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  /** Get an SSE stream of sync progress for a given watch */
  getProgressStream(watchId: string): BehaviorSubject<SyncProgress> {
    return this.ensureProgress(watchId);
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
      const folderStat = await stat(params.folderPath);
      if (!folderStat.isDirectory()) throw new Error('Path is not a directory');
    } catch (err) {
      throw new Error(
        `无法访问文件夹: ${params.folderPath} — ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    }

    const watch = await this.prisma.folderWatch.create({
      data: {
        label,
        folderPath: params.folderPath,
        spaceId: params.spaceId,
        recursive,
        status: 'ACTIVE',
      },
    });

    this.ensureProgress(watch.id);
    await this.fullScan(watch.id).catch((err) => {
      this.logger.error({ watchId: watch.id, err }, 'Initial full scan failed');
      this.setError(watch.id, err instanceof Error ? err.message : 'Unknown error').catch(() => {});
    });

    this.startWatcher(watch.id, params.folderPath, recursive);
    return watch.id;
  }

  async stopWatching(id: string): Promise<void> {
    const w = this.watchers.get(id);
    if (w) {
      await w.close();
      this.watchers.delete(id);
    }
    // Clean up progress
    const progress = this.progress.get(id);
    if (progress) {
      progress.complete();
      this.progress.delete(id);
    }
    await this.prisma.folderWatch.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async rescan(id: string): Promise<{ started: true }> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id } });
    await this.prisma.folderWatch.update({
      where: { id },
      data: { status: 'ACTIVE', errorMessage: null },
    });
    if (!this.watchers.has(id)) {
      this.startWatcher(id, watch.folderPath, watch.recursive);
    }
    this.emitProgress(id, {
      phase: 'scanning',
      total: 0,
      current: 0,
      scanned: 0,
      currentFile: '正在扫描文件夹...',
      percent: 0,
      error: undefined,
      result: undefined,
      counts: this.emptyCounts(),
      failedFiles: [],
    });
    void this.fullScan(id).catch((error) => {
      this.logger.error({ watchId: id, error }, 'Manual full scan failed');
    });
    return { started: true };
  }

  async retryFailed(id: string): Promise<{ started: true; count: number }> {
    await this.prisma.folderWatch.findUniqueOrThrow({ where: { id } });
    const targets = [...(this.failedTargets.get(id) ?? [])];
    if (targets.length === 0) return { started: true, count: 0 };

    this.failedTargets.set(id, []);
    this.emitProgress(id, {
      phase: 'importing',
      total: targets.length,
      current: 0,
      currentFile: '',
      percent: 0,
      counts: {
        ...this.emptyCounts(),
        discovered: targets.length,
        pending: targets.length,
      },
      failedFiles: [],
      error: undefined,
      result: undefined,
    });
    void this.runSerialized(id, async () => {
      const result: SyncResult = {
        scanned: targets.length,
        imported: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
      };
      const counts = {
        ...this.emptyCounts(),
        discovered: targets.length,
        pending: targets.length,
      };
      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        try {
          if (target.operation === 'import') {
            await this.importFile(id, target.filePath);
            result.imported += 1;
            counts.success += 1;
          } else if (target.operation === 'update') {
            await this.updateFile(id, target.filePath);
            result.updated += 1;
            counts.updated += 1;
          } else {
            await this.onFileRemoved(id, target.filePath);
            result.deleted += 1;
            counts.deleted += 1;
          }
        } catch (error) {
          result.errors += 1;
          this.recordFailure(id, target, error);
          counts.failed += 1;
        }
        counts.pending = targets.length - index - 1;
        this.emitProgress(id, {
          phase: 'importing',
          total: targets.length,
          current: index + 1,
          currentFile: basename(target.filePath),
          percent: Math.round(((index + 1) / targets.length) * 100),
          counts: { ...counts },
          failedFiles: this.publicFailures(id),
        });
      }
      this.emitProgress(id, {
        phase: 'done',
        current: targets.length,
        currentFile: '',
        percent: 100,
        counts: { ...counts },
        failedFiles: this.publicFailures(id),
        result,
      });
    }).catch((error) =>
      this.logger.error({ watchId: id, error }, 'Failed-file retry queue failed'),
    );
    return { started: true, count: targets.length };
  }

  /** Get current progress snapshot (for polling fallback) */
  getProgress(id: string): SyncProgress | null {
    return this.progress.get(id)?.value ?? null;
  }

  async list() {
    const principal = this.requestContext.requirePrincipal();
    const documentScope = this.dataScope.documents(principal);
    const where =
      Object.keys(documentScope).length === 0
        ? undefined
        : { spaceId: { in: [...(await this.accessibleSpaceIds(principal))] } };

    return this.prisma.folderWatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        space: { select: { id: true, name: true } },
        _count: { select: { files: true } },
      },
    });
  }

  async get(id: string) {
    const principal = this.requestContext.requirePrincipal();
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({
      where: { id },
      include: {
        space: { select: { id: true, name: true } },
        files: {
          orderBy: { filePath: 'asc' },
          select: {
            id: true,
            filePath: true,
            documentId: true,
            status: true,
            fileHash: true,
            updatedAt: true,
          },
        },
      },
    });
    await this.requireAccessibleSpace(principal, watch.spaceId);
    return watch;
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

  private async accessibleSpaceIds(principal: AuthenticatedPrincipal): Promise<Set<string>> {
    const spaces = await this.prisma.knowledgeSpace.findMany({
      where: {
        archivedAt: null,
        OR: [
          { ownerUserId: principal.userId },
          { members: { some: { userId: principal.userId } } },
          { visibility: 'ORGANIZATION' },
        ],
      },
      select: { id: true },
    });
    return new Set(spaces.map((s) => s.id));
  }

  private async requireAccessibleSpace(principal: AuthenticatedPrincipal, spaceId: string): Promise<void> {
    const documentScope = this.dataScope.documents(principal);
    if (Object.keys(documentScope).length === 0) {
      return;
    }
    const accessible = await this.accessibleSpaceIds(principal);
    if (!accessible.has(spaceId)) {
      throw new NotFoundException('文件夹同步不存在');
    }
  }

  private emitProgress(watchId: string, update: Partial<SyncProgress>) {
    const subject = this.ensureProgress(watchId);
    subject.next({ ...subject.value, ...update });
  }

  private ensureProgress(watchId: string): BehaviorSubject<SyncProgress> {
    const existing = this.progress.get(watchId);
    if (existing) return existing;
    const subject = new BehaviorSubject<SyncProgress>({
      watchId,
      phase: 'done',
      total: 0,
      current: 0,
      scanned: 0,
      currentFile: '',
      percent: 100,
      counts: this.emptyCounts(),
      failedFiles: [],
    });
    this.progress.set(watchId, subject);
    return subject;
  }

  private startWatcher(watchId: string, folderPath: string, recursive: boolean): void {
    if (this.watchers.has(watchId)) return;
    const w = watch(folderPath, {
      ignored: /(^|[\/\\])\..|node_modules|\/node_modules\//,
      persistent: true,
      ignoreInitial: true,
      depth: recursive ? undefined : 0,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    w.on('add', (filePath) => {
      void this.runSerialized(watchId, () => this.onFileAdded(watchId, filePath)).catch((error) =>
        this.logger.error({ watchId, filePath, error }, 'File add sync failed'),
      );
    });
    w.on('change', (filePath) => {
      void this.runSerialized(watchId, () => this.onFileChanged(watchId, filePath)).catch((error) =>
        this.logger.error({ watchId, filePath, error }, 'File change sync failed'),
      );
    });
    w.on('unlink', (filePath) => {
      void this.runSerialized(watchId, () => this.onFileRemoved(watchId, filePath)).catch((error) =>
        this.logger.error({ watchId, filePath, error }, 'File removal sync failed'),
      );
    });
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
    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { lastSyncAt: new Date() },
    });
  }

  private async onFileChanged(watchId: string, filePath: string): Promise<void> {
    if (!this.isSupported(filePath)) return;
    this.emitProgress(watchId, { phase: 'importing', currentFile: basename(filePath) });
    await this.updateFile(watchId, filePath);
    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { lastSyncAt: new Date() },
    });
  }

  private async onFileRemoved(watchId: string, filePath: string): Promise<void> {
    const existing = await this.prisma.folderFile.findUnique({
      where: { watchId_filePath: { watchId, filePath } },
    });
    if (!existing || existing.status === 'DELETED') return;
    await this.prisma.$transaction([
      this.prisma.folderFile.update({ where: { id: existing.id }, data: { status: 'DELETED' } }),
      this.prisma.contentDocument.update({
        where: { id: existing.documentId },
        data: { status: 'TRASHED', trashedAt: new Date() },
      }),
    ]);
    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { lastSyncAt: new Date() },
    });
  }

  private fullScan(watchId: string): Promise<SyncResult> {
    return this.runSerialized(watchId, () => this.performFullScan(watchId));
  }

  private runSerialized<T>(watchId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.scanLocks.get(watchId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.scanLocks.set(watchId, next);
    const cleanup = () => {
      if (this.scanLocks.get(watchId) === next) this.scanLocks.delete(watchId);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  private async performFullScan(watchId: string): Promise<SyncResult> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id: watchId } });
    const existingFiles = await this.prisma.folderFile.findMany({
      where: { watchId, status: 'ACTIVE' },
    });
    const existingPaths = new Set(existingFiles.map((f) => f.filePath));

    await this.prisma.folderWatch.update({
      where: { id: watchId },
      data: { status: 'ACTIVE', errorMessage: null },
    });

    const result: SyncResult = {
      scanned: 0,
      imported: 0,
      updated: 0,
      deleted: 0,
      errors: 0,
    };
    const counts = this.emptyCounts();
    this.failedTargets.set(watchId, []);

    try {
      // Phase 1: scan folder
      this.emitProgress(watchId, {
        phase: 'scanning',
        total: 0,
        current: 0,
        scanned: 0,
        currentFile: '正在扫描文件夹...',
        percent: 0,
        error: undefined,
        result: undefined,
        counts: { ...counts },
        failedFiles: [],
      });
      const currentFiles = await this.scanFolder(
        watch.folderPath,
        watch.recursive,
        (fileName, scanned) => {
          result.scanned = scanned;
          counts.discovered = scanned;
          counts.pending = scanned;
          this.emitProgress(watchId, {
            phase: 'scanning',
            current: scanned,
            scanned,
            currentFile: fileName,
            percent: 0,
            counts: { ...counts },
          });
        },
      );
      const currentPaths = new Set(currentFiles.map((f) => f.filePath));

      // Phase 2: handle deletions
      const deleted = [...existingPaths].filter((p) => !currentPaths.has(p));
      if (deleted.length > 0) {
        this.emitProgress(watchId, {
          phase: 'deleting',
          total: deleted.length,
          current: 0,
          currentFile: '',
          percent: 0,
        });
        for (let i = 0; i < deleted.length; i++) {
          try {
            const ff = existingFiles.find((f) => f.filePath === deleted[i]);
            if (ff) {
              await this.prisma.$transaction([
                this.prisma.folderFile.update({
                  where: { id: ff.id },
                  data: { status: 'DELETED' },
                }),
                this.prisma.contentDocument.update({
                  where: { id: ff.documentId },
                  data: { status: 'TRASHED', trashedAt: new Date() },
                }),
              ]);
              result.deleted++;
            }
          } catch (err) {
            result.errors++;
            counts.failed++;
            this.recordFailure(
              watchId,
              { filePath: deleted[i], operation: 'delete' },
              err,
            );
            this.logger.error({ filePath: deleted[i], err }, 'Delete handling failed');
          }
          counts.deleted = result.deleted;
          this.emitProgress(watchId, {
            phase: 'deleting',
            current: i + 1,
            currentFile: basename(deleted[i]),
            percent: Math.round(((i + 1) / deleted.length) * 100),
            counts: { ...counts },
            failedFiles: this.publicFailures(watchId),
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
        if (
          pt.startsWith('[需要后端转换') ||
          pt.startsWith('[PDF 文件:') ||
          pt.startsWith('[Excel 文件:') ||
          pt.trim().length === 0
        )
          return true;
        return f.sha256 !== existing.fileHash; // changed
      });
      counts.discovered = currentFiles.length;
      counts.skipped = currentFiles.length - toProcess.length;
      counts.pending = toProcess.length;

      if (toProcess.length > 0) {
        this.emitProgress(watchId, {
          phase: 'importing',
          total: currentFiles.length,
          current: counts.skipped,
          currentFile: '',
          percent:
            currentFiles.length > 0
              ? Math.round((counts.skipped / currentFiles.length) * 100)
              : 100,
          counts: { ...counts },
          failedFiles: this.publicFailures(watchId),
        });

        for (let i = 0; i < toProcess.length; i++) {
          const file = toProcess[i];
          try {
            const existing = existingFiles.find((ef) => ef.filePath === file.filePath);
            if (!existing) {
              await this.importFile(watchId, file.filePath);
              result.imported++;
              counts.success++;
            } else {
              await this.updateFile(watchId, file.filePath);
              result.updated++;
              counts.updated++;
            }
          } catch (err) {
            result.errors++;
            counts.failed++;
            const existing = existingFiles.find((ef) => ef.filePath === file.filePath);
            this.recordFailure(
              watchId,
              { filePath: file.filePath, operation: existing ? 'update' : 'import' },
              err,
            );
            this.logger.error({ filePath: file.filePath, err }, 'Import/update failed');
          }
          counts.pending = toProcess.length - i - 1;
          const completed = counts.skipped + i + 1;
          this.emitProgress(watchId, {
            phase: 'importing',
            total: currentFiles.length,
            current: completed,
            currentFile: file.fileName,
            percent:
              currentFiles.length > 0
                ? Math.round((completed / currentFiles.length) * 100)
                : 100,
            counts: { ...counts },
            failedFiles: this.publicFailures(watchId),
          });
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

    const finalProgress = this.ensureProgress(watchId).value;
    this.emitProgress(watchId, {
      phase: 'done',
      current: finalProgress.total,
      currentFile: '',
      percent: 100,
      result,
      counts: { ...counts },
      failedFiles: this.publicFailures(watchId),
    });
    this.logger.log({ watchId, ...result }, 'Full scan complete');
    return result;
  }

  private async importFile(watchId: string, filePath: string): Promise<void> {
    const watch = await this.prisma.folderWatch.findUniqueOrThrow({ where: { id: watchId } });
    const ext = extname(filePath).toLowerCase();
    const relPath = relative(watch.folderPath, filePath);
    const tags = this.pathTags(relPath);
    const source = await this.readSourceFile(filePath);
    const mime = this.mimeFromExt(ext);
    const extracted = await this.importer.extract({
      originalname: basename(filePath),
      mimetype: mime,
      size: source.buffer.length,
      buffer: source.buffer,
    });

    const tracked = await this.prisma.folderFile.findUnique({
      where: { watchId_filePath: { watchId, filePath } },
    });
    const documentId = await this.prisma.$transaction(async (tx) => {
      if (tracked) {
        await tx.contentDocument.update({
          where: { id: tracked.documentId },
          data: {
            title: extracted.title,
            plainText: extracted.plainText,
            tags,
            spaceId: watch.spaceId,
            sourceKind: KnowledgeSourceKind.LOCAL_FILE,
            originalName: basename(filePath),
            mimeType: mime,
            fileSize: source.buffer.length,
            sourceSha256: source.sha256,
            sourceModifiedAt: source.modifiedAt,
            previewStatus: KnowledgeProcessingStatus.PENDING,
            indexStatus: KnowledgeProcessingStatus.PROCESSING,
            processingError: null,
            status: 'ACTIVE',
            trashedAt: null,
            updatedByUserId: this.principal().userId,
          },
        });
        await tx.folderFile.update({
          where: { id: tracked.id },
          data: { fileHash: source.sha256, status: 'ACTIVE' },
        });
        return tracked.documentId;
      }

      const document = await tx.contentDocument.create({
        data: {
          type: 'DOCUMENT',
          title: extracted.title,
          plainText: extracted.plainText,
          spaceId: watch.spaceId,
          tags,
          sourceKind: KnowledgeSourceKind.LOCAL_FILE,
          originalName: basename(filePath),
          mimeType: mime,
          fileSize: source.buffer.length,
          sourceSha256: source.sha256,
          sourceModifiedAt: source.modifiedAt,
          previewStatus: KnowledgeProcessingStatus.PENDING,
          indexStatus: KnowledgeProcessingStatus.PROCESSING,
          createdByUserId: this.principal().userId,
          updatedByUserId: this.principal().userId,
          ownerUserId: this.principal().userId,
        },
        select: { id: true },
      });
      await tx.folderFile.create({
        data: {
          watchId,
          filePath,
          documentId: document.id,
          fileHash: source.sha256,
          status: 'ACTIVE',
        },
      });
      return document.id;
    });

    await this.finishIndex(documentId, extracted.plainText);
  }

  private async updateFile(watchId: string, filePath: string): Promise<void> {
    const existing = await this.prisma.folderFile.findUniqueOrThrow({
      where: { watchId_filePath: { watchId, filePath } },
    });
    const ext = extname(filePath).toLowerCase();
    const source = await this.readSourceFile(filePath);
    const mime = this.mimeFromExt(ext);
    const extracted = await this.importer.extract({
      originalname: basename(filePath),
      mimetype: mime,
      size: source.buffer.length,
      buffer: source.buffer,
    });

    await this.prisma.$transaction([
      this.prisma.contentDocument.update({
        where: { id: existing.documentId },
        data: {
          title: extracted.title,
          plainText: extracted.plainText,
          sourceKind: KnowledgeSourceKind.LOCAL_FILE,
          originalName: basename(filePath),
          mimeType: mime,
          fileSize: source.buffer.length,
          sourceSha256: source.sha256,
          sourceModifiedAt: source.modifiedAt,
          previewStatus: KnowledgeProcessingStatus.PENDING,
          indexStatus: KnowledgeProcessingStatus.PROCESSING,
          processingError: null,
          status: 'ACTIVE',
          trashedAt: null,
          updatedByUserId: this.principal().userId,
        },
      }),
      this.prisma.folderFile.update({
        where: { id: existing.id },
        data: { fileHash: source.sha256, status: 'ACTIVE' },
      }),
    ]);
    await this.finishIndex(existing.documentId, extracted.plainText);
  }

  private async scanFolder(
    folderPath: string,
    recursive: boolean,
    onScanned?: (fileName: string, scanned: number) => void,
  ): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    await this.walkDir(folderPath, folderPath, recursive, results, onScanned);
    return results;
  }

  private async walkDir(
    basePath: string,
    currentPath: string,
    recursive: boolean,
    results: ScannedFile[],
    onScanned?: (fileName: string, scanned: number) => void,
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.walkDir(basePath, full, recursive, results, onScanned);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          const source = await this.readSourceFile(full);
          results.push({
            filePath: full,
            relativePath: relative(basePath, full),
            fileName: entry.name,
            ext,
            size: source.buffer.length,
            sha256: source.sha256,
            modifiedAt: source.modifiedAt,
          });
          onScanned?.(entry.name, results.length);
        }
      }
    }
  }

  private mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.json': 'application/json',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
    };
    return map[ext] || 'text/plain';
  }

  private async readSourceFile(filePath: string) {
    const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    return {
      buffer,
      modifiedAt: fileStat.mtime,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  private async finishIndex(documentId: string, plainText: string): Promise<void> {
    try {
      const indexed = await this.indexing.indexDocument(documentId, plainText);
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus:
            indexed.embedded < indexed.chunks
              ? KnowledgeProcessingStatus.PARTIAL
              : KnowledgeProcessingStatus.READY,
          indexedAt: new Date(),
          processingError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indexing failed';
      await this.prisma.contentDocument.update({
        where: { id: documentId },
        data: {
          indexStatus: KnowledgeProcessingStatus.FAILED,
          processingError: message.slice(0, 1000),
        },
      });
      throw error;
    }
  }

  private pathTags(relativePath: string): string[] {
    const parts = relativePath.replace(/\\/g, '/').split('/');
    parts.pop();
    return parts.filter(Boolean);
  }

  private isSupported(filePath: string): boolean {
    return SUPPORTED_EXTS.has(extname(filePath).toLowerCase());
  }

  private emptyCounts(): SyncCounts {
    return {
      discovered: 0,
      pending: 0,
      success: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0,
    };
  }

  private recordFailure(watchId: string, target: FailedTarget, error: unknown): void {
    const targets = this.failedTargets.get(watchId) ?? [];
    targets.push(target);
    this.failedTargets.set(watchId, targets);
    this.logger.warn(
      {
        watchId,
        fileName: basename(target.filePath),
        error: error instanceof Error ? error.message : String(error),
      },
      'Folder sync item failed',
    );
  }

  private publicFailures(watchId: string): SyncFailure[] {
    return (this.failedTargets.get(watchId) ?? []).map((target) => ({
      fileName: basename(target.filePath),
      category:
        target.operation === 'delete'
          ? 'DELETE_FAILED'
          : target.operation === 'update'
            ? 'INDEX_FAILED'
            : 'EXTRACTION_FAILED',
      reason:
        target.operation === 'delete'
          ? '无法同步删除状态'
          : target.operation === 'update'
            ? '文件更新或索引处理失败'
            : '文件读取、提取或索引处理失败',
    }));
  }

  private async setError(watchId: string, message: string): Promise<void> {
    await this.prisma.folderWatch
      .update({
        where: { id: watchId },
        data: { status: 'ERROR', errorMessage: message.slice(0, 1000) },
      })
      .catch(() => {});
  }
}
