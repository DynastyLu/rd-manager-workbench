import { HttpStatus, Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateKnowledgeSpaceDto,
  UpdateKnowledgeSpaceDto,
} from '../interface/http/dto/content.dto';

@Injectable()
export class KnowledgeSpacesService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  list() {
    return this.prisma.knowledgeSpace.findMany({
      where: { archivedAt: null },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  create(dto: CreateKnowledgeSpaceDto) {
    return this.prisma.knowledgeSpace.create({ data: dto });
  }

  async update(id: string, dto: UpdateKnowledgeSpaceDto) {
    const result = await this.prisma.knowledgeSpace.updateMany({
      where: { id, archivedAt: null },
      data: dto,
    });
    if (!result.count) throw this.notFound();
    return this.prisma.knowledgeSpace.findUniqueOrThrow({ where: { id } });
  }

  private notFound() {
    return new AppError({
      code: ErrorCodes.KNOWLEDGE_SPACE_NOT_FOUND,
      message: 'Knowledge space not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
