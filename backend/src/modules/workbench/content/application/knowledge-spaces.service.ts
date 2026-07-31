import { HttpStatus, Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateKnowledgeSpaceDto,
  UpdateKnowledgeSpaceDto,
} from '../interface/http/dto/content.dto';

@Injectable()
export class KnowledgeSpacesService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  list() {
    const principal = this.requestContext.requirePrincipal();
    const scope = this.dataScope.knowledgeSpaces(principal);
    return this.prisma.knowledgeSpace.findMany({
      where: { archivedAt: null, ...scope },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  create(dto: CreateKnowledgeSpaceDto) {
    const principal = this.requestContext.requirePrincipal();
    return this.prisma.knowledgeSpace.create({
      data: {
        ...dto,
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
        ownerUserId: principal.userId,
      },
    });
  }

  async update(id: string, dto: UpdateKnowledgeSpaceDto) {
    const principal = this.requestContext.requirePrincipal();
    await this.assertAccessible(id);
    const result = await this.prisma.knowledgeSpace.updateMany({
      where: { id, archivedAt: null },
      data: {
        ...dto,
        updatedByUserId: principal.userId,
      },
    });
    if (!result.count) throw this.notFound();
    return this.prisma.knowledgeSpace.findUniqueOrThrow({ where: { id } });
  }

  private async assertAccessible(id: string) {
    const principal = this.requestContext.requirePrincipal();
    const scope = this.dataScope.knowledgeSpaces(principal);
    const accessible = await this.prisma.knowledgeSpace.findFirst({
      where: { id, archivedAt: null, ...scope },
      select: { id: true },
    });
    if (accessible) return;
    const exists = await this.prisma.knowledgeSpace.count({ where: { id } });
    if (!exists) throw this.notFound();
    throw new AppError({
      code: ErrorCodes.PERMISSION_DENIED,
      message: 'You do not have permission to access this knowledge space',
      statusCode: HttpStatus.FORBIDDEN,
    });
  }

  private notFound() {
    return new AppError({
      code: ErrorCodes.KNOWLEDGE_SPACE_NOT_FOUND,
      message: 'Knowledge space not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
