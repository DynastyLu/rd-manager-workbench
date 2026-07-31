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
export class ApplicationsSearchAdapter implements SearchAdapter {
  readonly types = ['APPLICATION_CASE'] as const;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    if (!types.includes('APPLICATION_CASE')) return [];

    const where: Prisma.ApplicationCaseWhereInput = {
      AND: [
        {
          archivedAt: null,
          project: { archivedAt: null },
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { title: { contains: query, mode: 'insensitive' } },
            { subjectName: { contains: query, mode: 'insensitive' } },
            { organization: { contains: query, mode: 'insensitive' } },
            { region: { contains: query, mode: 'insensitive' } },
            { batch: { contains: query, mode: 'insensitive' } },
          ],
        },
        { project: this.dataScope.projects(this.principal()) },
      ],
    };
    const applicationCases = await this.prisma.applicationCase.findMany({
      where,
      select: {
        id: true,
        code: true,
        title: true,
        subjectName: true,
        organization: true,
        region: true,
        batch: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    return applicationCases.map((applicationCase) => ({
      type: 'APPLICATION_CASE',
      id: applicationCase.id,
      title: applicationCase.title,
      snippet: buildSearchSnippet(query, [
        applicationCase.code,
        applicationCase.subjectName,
        applicationCase.organization,
        applicationCase.region,
        applicationCase.batch,
      ]),
      path: `/library/applications?caseId=${encodeURIComponent(applicationCase.id)}`,
      updatedAt: applicationCase.updatedAt,
      actions: ['OPEN', 'COPY_LINK'],
    }));
  }

}
