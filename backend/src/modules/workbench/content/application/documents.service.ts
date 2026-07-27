import { HttpStatus, Injectable } from '@nestjs/common';
import { ContentDocumentType, ContentStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateDocumentDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
} from '../interface/http/dto/content.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListDocumentsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.ContentDocumentWhereInput = {
      type: query.type,
      projectId: query.projectId,
      meetingId: query.meetingId,
      spaceId: query.spaceId,
      status: query.status ?? ContentStatus.ACTIVE,
      ...(query.parentId !== undefined ? { parentId: query.parentId || null } : {}),
      ...(query.query
        ? {
            OR: [
              { title: { contains: query.query, mode: 'insensitive' } },
              { plainText: { contains: query.query, mode: 'insensitive' } },
              { tags: { has: query.query } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contentDocument.findMany({
        where,
        orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contentDocument.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const document = await this.prisma.contentDocument.findUnique({
      where: { id },
      include: {
        space: true,
        fileAssets: {
          where: { status: 'ACTIVE' },
          include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!document) throw this.documentNotFound();
    return document;
  }

  /**
   * Generate an image-based HTML preview for PDF documents using pdftoppm.
   * Each page is rendered as a high-resolution PNG and embedded in HTML.
   * Returns null if the document has no PDF source file.
   */
  async getPreviewHtml(id: string): Promise<string | null> {
    // 1. Find PDF source: folder_files first, then fileAssets
    let pdfPath: string | null = null;

    const folderFile = await this.prisma.folderFile.findFirst({
      where: { documentId: id, status: 'ACTIVE' },
      select: { filePath: true },
    });
    if (folderFile?.filePath?.toLowerCase().endsWith('.pdf')) {
      pdfPath = folderFile.filePath;
    }

    if (!pdfPath) return null;

    try {
      const { execSync } = await import('node:child_process');
      const { existsSync, mkdirSync, readFileSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const { randomUUID } = await import('node:crypto');

      if (!existsSync(pdfPath)) return null;

      // Render PDF pages as PNG images at 200 DPI
      const tmpDir = join(tmpdir(), `kb-pdf-${randomUUID()}`);
      mkdirSync(tmpDir);
      try {
        execSync(`pdftoppm -png -r 200 "${pdfPath}" "${tmpDir}/page"`, {
          timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
        });

        // Read generated images and build HTML
        const { readdirSync } = await import('node:fs');
        const files = readdirSync(tmpDir).filter((f: string) => f.endsWith('.png')).sort();
        if (files.length === 0) return null;

        const images = files.map((f: string) => {
          const buf = readFileSync(join(tmpDir, f));
          return `data:image/png;base64,${buf.toString('base64')}`;
        });

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{background:#525659;margin:0;padding:20px;display:flex;flex-direction:column;align-items:center;gap:20px}
          img{max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,.4);background:#fff}
          .page-num{color:#aaa;font-size:12px;text-align:center;margin-top:-12px}
        </style></head><body>
          ${images.map((src, i) => `<div><img src="${src}" alt="第${i + 1}页"><div class="page-num">第 ${i + 1} / ${files.length} 页</div></div>`).join('\n')}
        </body></html>`;

        return html;
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup failed */ }
      }
    } catch { /* render failed, return null */ }
    return null;
  }

  async create(dto: CreateDocumentDto) {
    const references = await this.validateReferences(dto);
    return this.prisma.contentDocument.create({
      data: {
        type: dto.type,
        title: dto.title,
        content: (dto.content ?? {}) as Prisma.InputJsonValue,
        plainText: dto.plainText ?? '',
        tags: this.normalizeTags(dto.tags),
        isFavorite: dto.isFavorite ?? false,
        spaceId: references.spaceId,
        parentId: references.parentId,
        projectId: dto.projectId,
        meetingId: dto.meetingId,
      },
    });
  }

  async createKnowledgePageInTransaction(tx: Prisma.TransactionClient, dto: CreateDocumentDto) {
    const space = dto.spaceId ? await tx.knowledgeSpace.findFirst({ where: { id: dto.spaceId, archivedAt: null }, select: { id: true } }) : null;
    if (dto.spaceId && !space) throw this.referenceInvalid('Knowledge space not found');
    const project = dto.projectId ? await tx.project.findFirst({ where: { id: dto.projectId, archivedAt: null }, select: { id: true } }) : null;
    if (dto.projectId && !project) throw this.referenceInvalid('Project not found');
    return tx.contentDocument.create({ data: {
      type: ContentDocumentType.KNOWLEDGE_PAGE, title: dto.title,
      content: (dto.content ?? {}) as Prisma.InputJsonValue, plainText: dto.plainText ?? '',
      tags: this.normalizeTags(dto.tags), isFavorite: dto.isFavorite ?? false,
      spaceId: dto.spaceId, projectId: dto.projectId,
    } });
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const current = await this.prisma.contentDocument.findFirst({
      where: { id, status: ContentStatus.ACTIVE },
    });
    if (!current) throw this.documentNotFound();
    const references = await this.validateReferences(
      {
        ...dto,
        spaceId: dto.spaceId !== undefined ? dto.spaceId : current.spaceId,
        parentId: dto.parentId !== undefined ? dto.parentId : current.parentId,
        projectId: dto.projectId !== undefined ? dto.projectId : current.projectId,
        meetingId: dto.meetingId !== undefined ? dto.meetingId : current.meetingId,
      },
      id,
    );
    return this.prisma.contentDocument.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content as Prisma.InputJsonValue | undefined,
        plainText: dto.plainText,
        tags: dto.tags ? this.normalizeTags(dto.tags) : undefined,
        isFavorite: dto.isFavorite,
        spaceId: references.spaceId,
        parentId: references.parentId,
        projectId: dto.projectId,
        meetingId: dto.meetingId,
      },
    });
  }

  async trash(id: string) {
    const result = await this.prisma.contentDocument.updateMany({
      where: { id, status: ContentStatus.ACTIVE },
      data: { status: ContentStatus.TRASHED, trashedAt: new Date() },
    });
    if (!result.count) throw this.documentNotFound();
  }

  async restore(id: string) {
    const result = await this.prisma.contentDocument.updateMany({
      where: { id, status: ContentStatus.TRASHED },
      data: { status: ContentStatus.ACTIVE, trashedAt: null },
    });
    if (!result.count) throw this.documentNotFound();
    return this.get(id);
  }

  async listVersions(id: string) {
    const document = await this.prisma.contentDocument.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!document) throw this.documentNotFound();
    return this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }],
    });
  }

  saveVersion(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const document = await this.lockActiveDocument(tx, id);
      return this.createVersion(tx, document);
    });
  }

  restoreVersion(id: string, versionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockActiveDocument(tx, id);
      const source = await tx.documentVersion.findFirst({
        where: { id: versionId, documentId: id },
      });
      if (!source) throw this.versionNotFound();
      await this.validateSnapshotReferences(tx, source, id);
      const document = await tx.contentDocument.update({
        where: { id },
        data: {
          title: source.title,
          content: source.content as Prisma.InputJsonValue,
          plainText: source.plainText,
          tags: source.tags,
          isFavorite: source.isFavorite,
          spaceId: source.spaceId,
          parentId: source.parentId,
          projectId: source.projectId,
          meetingId: source.meetingId,
        },
      });
      await this.createVersion(tx, document, source.id);
      return document;
    });
  }

  private async lockActiveDocument(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "app"."content_documents"
      WHERE id = ${id} AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (!rows.length) throw this.documentNotFound();
    return tx.contentDocument.findUniqueOrThrow({ where: { id } });
  }

  private async createVersion(
    tx: Prisma.TransactionClient,
    document: Awaited<ReturnType<Prisma.TransactionClient['contentDocument']['findUniqueOrThrow']>>,
    restoredFromVersionId?: string,
  ) {
    const latest = await tx.documentVersion.aggregate({
      where: { documentId: document.id },
      _max: { versionNumber: true },
    });
    return tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: (latest._max.versionNumber ?? 0) + 1,
        title: document.title,
        content: document.content as Prisma.InputJsonValue,
        plainText: document.plainText,
        tags: document.tags,
        isFavorite: document.isFavorite,
        spaceId: document.spaceId,
        parentId: document.parentId,
        projectId: document.projectId,
        meetingId: document.meetingId,
        restoredFromVersionId,
      },
    });
  }

  private async validateReferences(
    dto: Pick<CreateDocumentDto, 'spaceId' | 'parentId' | 'projectId' | 'meetingId'>,
    documentId?: string,
  ) {
    let spaceId = dto.spaceId ?? null;
    const parentId = dto.parentId ?? null;
    if (parentId) {
      if (parentId === documentId) throw this.parentInvalid();
      const parent = await this.prisma.contentDocument.findFirst({
        where: { id: parentId, status: ContentStatus.ACTIVE },
        select: { id: true, parentId: true, spaceId: true },
      });
      if (!parent) throw this.referenceInvalid('Parent document not found');
      if (spaceId && parent.spaceId !== spaceId) {
        throw this.parentInvalid('Parent document belongs to another knowledge space');
      }
      spaceId ??= parent.spaceId;
      await this.assertNoParentCycle(parent, documentId);
    }
    await Promise.all([
      spaceId
        ? this.assertExists('knowledgeSpace', spaceId, 'Knowledge space not found')
        : undefined,
      dto.projectId ? this.assertExists('project', dto.projectId, 'Project not found') : undefined,
      dto.meetingId ? this.assertExists('meeting', dto.meetingId, 'Meeting not found') : undefined,
    ]);
    return { spaceId, parentId };
  }

  private async assertNoParentCycle(
    parent: { id: string; parentId: string | null },
    documentId?: string,
  ) {
    if (!documentId) return;
    let cursor: { id: string; parentId: string | null } | null = parent;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor.id === documentId || visited.has(cursor.id)) throw this.parentInvalid();
      visited.add(cursor.id);
      cursor = cursor.parentId
        ? await this.prisma.contentDocument.findUnique({
            where: { id: cursor.parentId },
            select: { id: true, parentId: true },
          })
        : null;
    }
  }

  private async assertExists(
    delegate: 'knowledgeSpace' | 'project' | 'meeting',
    id: string,
    message: string,
  ) {
    const item =
      delegate === 'knowledgeSpace'
        ? await this.prisma.knowledgeSpace.findFirst({ where: { id, archivedAt: null } })
        : delegate === 'project'
          ? await this.prisma.project.findFirst({ where: { id, archivedAt: null } })
          : await this.prisma.meeting.findFirst({ where: { id, archivedAt: null } });
    if (!item) throw this.referenceInvalid(message);
  }

  private async validateSnapshotReferences(
    tx: Prisma.TransactionClient,
    source: {
      spaceId: string | null;
      parentId: string | null;
      projectId: string | null;
      meetingId: string | null;
    },
    documentId: string,
  ) {
    const [space, parent, project, meeting] = await Promise.all([
      source.spaceId ? tx.knowledgeSpace.findUnique({ where: { id: source.spaceId } }) : true,
      source.parentId ? tx.contentDocument.findUnique({ where: { id: source.parentId } }) : true,
      source.projectId ? tx.project.findUnique({ where: { id: source.projectId } }) : true,
      source.meetingId ? tx.meeting.findUnique({ where: { id: source.meetingId } }) : true,
    ]);
    if (!space || !parent || !project || !meeting) {
      throw this.referenceInvalid('A saved document association no longer exists');
    }
    if (source.parentId) {
      let cursor: { id: string; parentId: string | null } | null = parent as {
        id: string;
        parentId: string | null;
      };
      const visited = new Set<string>();
      while (cursor) {
        if (cursor.id === documentId || visited.has(cursor.id)) throw this.parentInvalid();
        visited.add(cursor.id);
        cursor = cursor.parentId
          ? await tx.contentDocument.findUnique({
              where: { id: cursor.parentId },
              select: { id: true, parentId: true },
            })
          : null;
      }
    }
  }

  private normalizeTags(tags?: string[]) {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }

  private documentNotFound() {
    return new AppError({
      code: ErrorCodes.DOCUMENT_NOT_FOUND,
      message: 'Document not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private versionNotFound() {
    return new AppError({
      code: ErrorCodes.DOCUMENT_VERSION_NOT_FOUND,
      message: 'Document version not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private referenceInvalid(message: string) {
    return new AppError({
      code: ErrorCodes.DOCUMENT_REFERENCE_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }

  private parentInvalid(message = 'Document parent would create a cycle') {
    return new AppError({
      code: ErrorCodes.DOCUMENT_PARENT_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}
