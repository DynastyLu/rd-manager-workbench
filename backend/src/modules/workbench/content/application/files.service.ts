import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { FileAssetStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CreateFileDto, ListFilesQueryDto, UpdateFileDto } from '../interface/http/dto/files.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface UploadedContentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
  ) {}

  async list(query: ListFilesQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.FileAssetWhereInput = {
      documentId: query.documentId,
      projectId: query.projectId,
      meetingId: query.meetingId,
      partnerId: query.partnerId,
      nonProjectRdItemId: query.nonProjectRdItemId,
      nonProjectRdOutcomeId: query.nonProjectRdOutcomeId,
      status: query.status ?? FileAssetStatus.ACTIVE,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.fileAsset.findMany({
        where,
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async create(file: UploadedContentFile | undefined, dto: CreateFileDto) {
    const upload = this.requireUpload(file);
    const references = await this.validateReferences(dto);
    const assetId = randomUUID();
    const versionId = randomUUID();
    const storageKey = this.storageKey(assetId, versionId);
    const originalName = this.normalizeOriginalName(upload.originalname);
    await this.storage.write({
      key: storageKey,
      content: upload.buffer,
      mimeType: upload.mimetype || 'application/octet-stream',
    });
    try {
      await this.prisma.fileAsset.create({
        data: {
          id: assetId,
          name: dto.name || originalName,
          ...references,
          versions: {
            create: {
              id: versionId,
              versionNumber: 1,
              storageKey,
              originalName,
              mimeType: upload.mimetype || 'application/octet-stream',
              size: upload.buffer.length,
              sha256: this.sha256(upload.buffer),
            },
          },
        },
      });
      return this.getAsset(assetId);
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async addVersion(id: string, file: UploadedContentFile | undefined) {
    const upload = this.requireUpload(file);
    await this.requireActiveAsset(id);
    const versionId = randomUUID();
    const storageKey = this.storageKey(id, versionId);
    const originalName = this.normalizeOriginalName(upload.originalname);
    await this.storage.write({
      key: storageKey,
      content: upload.buffer,
      mimeType: upload.mimetype || 'application/octet-stream',
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "app"."file_assets"
          WHERE id = ${id} AND status = 'ACTIVE'
          FOR UPDATE
        `;
        if (!rows.length) throw this.fileNotFound();
        const latest = await tx.fileVersion.aggregate({
          where: { fileAssetId: id },
          _max: { versionNumber: true },
        });
        return tx.fileVersion.create({
          data: {
            id: versionId,
            fileAssetId: id,
            versionNumber: (latest._max.versionNumber ?? 0) + 1,
            storageKey,
            originalName,
            mimeType: upload.mimetype || 'application/octet-stream',
            size: upload.buffer.length,
            sha256: this.sha256(upload.buffer),
          },
        });
      });
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(id: string, versionId?: string) {
    await this.requireActiveAsset(id);
    const version = versionId
      ? await this.prisma.fileVersion.findFirst({ where: { id: versionId, fileAssetId: id } })
      : await this.prisma.fileVersion.findFirst({
          where: { fileAssetId: id },
          orderBy: { versionNumber: 'desc' },
        });
    if (!version) throw this.versionNotFound();
    const stored = await this.storage.read(version.storageKey);
    if (this.sha256(stored.content) !== version.sha256) {
      throw new AppError({
        code: ErrorCodes.FILE_INTEGRITY_FAILED,
        message: 'Stored file content failed SHA-256 verification',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    return { version, content: stored.content };
  }

  async update(id: string, dto: UpdateFileDto) {
    const asset = await this.requireActiveAsset(id);
    const references = await this.validateReferences({
      documentId: dto.documentId !== undefined ? dto.documentId : asset.documentId,
      projectId: dto.projectId !== undefined ? dto.projectId : asset.projectId,
      meetingId: dto.meetingId !== undefined ? dto.meetingId : asset.meetingId,
      partnerId: dto.partnerId !== undefined ? dto.partnerId : asset.partnerId,
      nonProjectRdItemId: dto.nonProjectRdItemId !== undefined
        ? dto.nonProjectRdItemId
        : asset.nonProjectRdItemId,
      nonProjectRdOutcomeId: dto.nonProjectRdOutcomeId !== undefined
        ? dto.nonProjectRdOutcomeId
        : asset.nonProjectRdOutcomeId,
    });
    await this.prisma.fileAsset.update({
      where: { id },
      data: { name: dto.name, ...references },
    });
    return this.getAsset(id);
  }

  async trash(id: string) {
    const result = await this.prisma.fileAsset.updateMany({
      where: { id, status: FileAssetStatus.ACTIVE },
      data: { status: FileAssetStatus.TRASHED, trashedAt: new Date() },
    });
    if (!result.count) throw this.fileNotFound();
  }

  async restore(id: string) {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id, status: FileAssetStatus.TRASHED },
    });
    if (!asset) throw this.fileNotFound();
    await this.validateReferences(asset);
    await this.prisma.fileAsset.update({
      where: { id },
      data: { status: FileAssetStatus.ACTIVE, trashedAt: null },
    });
    return this.getAsset(id);
  }

  private getAsset(id: string) {
    return this.prisma.fileAsset.findUniqueOrThrow({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }

  private async requireActiveAsset(id: string) {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id, status: FileAssetStatus.ACTIVE },
    });
    if (!asset) throw this.fileNotFound();
    return asset;
  }

  private requireUpload(file?: UploadedContentFile) {
    if (!file?.buffer) {
      throw new AppError({
        code: ErrorCodes.FILE_UPLOAD_REQUIRED,
        message: 'A file upload is required',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    return file;
  }

  private async validateReferences(dto: {
    documentId?: string | null;
    projectId?: string | null;
    meetingId?: string | null;
    partnerId?: string | null;
    nonProjectRdItemId?: string | null;
    nonProjectRdOutcomeId?: string | null;
  }) {
    const references = {
      documentId: dto.documentId || null,
      projectId: dto.projectId || null,
      meetingId: dto.meetingId || null,
      partnerId: dto.partnerId || null,
      nonProjectRdItemId: dto.nonProjectRdItemId || null,
      nonProjectRdOutcomeId: dto.nonProjectRdOutcomeId || null,
    };
    if (
      !references.documentId &&
      !references.projectId &&
      !references.meetingId &&
      !references.partnerId
      && !references.nonProjectRdItemId
      && !references.nonProjectRdOutcomeId
    ) {
      throw this.referenceInvalid('A supported owning-object association is required');
    }
    const ownerCount = Object.values(references).filter(Boolean).length;
    if (ownerCount !== 1) {
      throw this.referenceInvalid('A file must be associated with exactly one owning object');
    }
    const [document, project, meeting, partner, nonProjectRdItem, nonProjectRdOutcome] = await Promise.all([
      references.documentId
        ? this.prisma.contentDocument.findFirst({
            where: { id: references.documentId, status: 'ACTIVE' },
          })
        : true,
      references.projectId
        ? this.prisma.project.findFirst({
            where: { id: references.projectId, archivedAt: null },
          })
        : true,
      references.meetingId
        ? this.prisma.meeting.findFirst({
            where: { id: references.meetingId, archivedAt: null },
          })
        : true,
      references.partnerId
        ? this.prisma.partner.findFirst({
            where: { id: references.partnerId, archivedAt: null },
          })
        : true,
      references.nonProjectRdItemId
        ? this.prisma.nonProjectRdItem.findFirst({
            where: { id: references.nonProjectRdItemId, archivedAt: null },
          })
        : true,
      references.nonProjectRdOutcomeId
        ? this.prisma.nonProjectRdOutcome.findFirst({
            where: {
              id: references.nonProjectRdOutcomeId,
              item: { archivedAt: null },
            },
          })
        : true,
    ]);
    if (!document || !project || !meeting || !partner || !nonProjectRdItem || !nonProjectRdOutcome) {
      throw this.referenceInvalid('A file association does not exist or is inactive');
    }
    return references;
  }

  private normalizeOriginalName(name: string) {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return (decoded.includes('\uFFFD') ? name : decoded).trim().slice(0, 500) || 'unnamed-file';
  }

  private storageKey(assetId: string, versionId: string) {
    return `files/${assetId}/${versionId}`;
  }

  private sha256(content: Buffer) {
    return createHash('sha256').update(content).digest('hex');
  }

  private fileNotFound() {
    return new AppError({
      code: ErrorCodes.FILE_NOT_FOUND,
      message: 'File asset not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private versionNotFound() {
    return new AppError({
      code: ErrorCodes.FILE_VERSION_NOT_FOUND,
      message: 'File version not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private referenceInvalid(message: string) {
    return new AppError({
      code: ErrorCodes.FILE_REFERENCE_INVALID,
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}
