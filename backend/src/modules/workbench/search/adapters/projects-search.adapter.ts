import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import {
  SearchAdapter,
  SearchCandidate,
  SearchType,
} from '../domain/search.types';
import { buildSearchSnippet } from '../domain/search-ranking';

const CANDIDATE_LIMIT = 100;

@Injectable()
export class ProjectsSearchAdapter implements SearchAdapter {
  readonly types = ['PROJECT'] as const;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    if (!types.includes('PROJECT')) return [];

    const where: Prisma.ProjectWhereInput = {
      AND: [
        {
          archivedAt: null,
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { researchDirection: { contains: query, mode: 'insensitive' } },
            { objective: { contains: query, mode: 'insensitive' } },
            { expectedOutcome: { contains: query, mode: 'insensitive' } },
            { leadName: { contains: query, mode: 'insensitive' } },
          ],
        },
        this.dataScope.projects(this.principal()),
      ],
    };
    const projects = await this.prisma.project.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        researchDirection: true,
        objective: true,
        expectedOutcome: true,
        leadName: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    return projects.map((project) => ({
      type: 'PROJECT',
      id: project.id,
      title: project.name,
      snippet: buildSearchSnippet(query, [
        project.code,
        project.researchDirection,
        project.objective,
        project.expectedOutcome,
        project.leadName,
      ]),
      path: `/spaces/projects/${encodeURIComponent(project.id)}/overview`,
      updatedAt: project.updatedAt,
      actions: ['OPEN', 'COPY_LINK'],
    }));
  }

}
