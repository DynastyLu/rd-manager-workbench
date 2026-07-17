import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { GeneratedFileEntity } from '../domain/generated-file.entity';
import {
  CreateGeneratedFileInput,
  GeneratedFileRepository,
} from '../domain/generated-file.repository';

type PrismaGeneratedFileRecord = {
  id: string;
  jobId: string;
  kind: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
};

@Injectable()
export class PrismaGeneratedFileRepository extends GeneratedFileRepository {
  constructor(private readonly prisma: PlatformPrismaService) {
    super();
  }

  async create(input: CreateGeneratedFileInput): Promise<GeneratedFileEntity> {
    const file = await this.prisma.generatedFile.create({
      data: input,
    });
    return this.toEntity(file);
  }

  async findById(id: string): Promise<GeneratedFileEntity | null> {
    const file = await this.prisma.generatedFile.findUnique({ where: { id } });
    return file ? this.toEntity(file) : null;
  }

  private toEntity(file: PrismaGeneratedFileRecord): GeneratedFileEntity {
    return {
      id: file.id,
      jobId: file.jobId,
      kind: file.kind,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      storageKey: file.storageKey,
      createdAt: file.createdAt,
    };
  }
}
