import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { buildSearchSnippet, limitSearchCandidates } from '../domain/search-ranking';
import { SearchAdapter, SearchCandidate, SearchType } from '../domain/search.types';

const LIMIT = 100;

@Injectable()
export class OperationsSearchAdapter implements SearchAdapter {
  readonly types = ['NON_PROJECT_RD'] as const satisfies readonly SearchType[];

  constructor(private readonly prisma: PlatformPrismaService) {}

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    if (!types.includes('NON_PROJECT_RD')) return [];
    const contains = { contains: query, mode: 'insensitive' as const };
    const items = await this.prisma.nonProjectRdItem.findMany({
      where: {
        archivedAt: null,
        OR: [
          { code: contains },
          { title: contains },
          { objective: contains },
          { expectedOutcome: contains },
          { ownerName: contains },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: LIMIT,
    });
    return limitSearchCandidates(
      query,
      items.map((item) => ({
        type: 'NON_PROJECT_RD' as const,
        id: item.id,
        title: item.title,
        snippet: buildSearchSnippet(query, [
          item.code,
          item.objective,
          item.expectedOutcome,
          item.ownerName,
        ]),
        path: `/library/operations?tab=non-project-rd&recordId=${encodeURIComponent(item.id)}`,
        updatedAt: item.updatedAt,
        actions: ['OPEN', 'COPY_LINK'] as const,
      })),
      LIMIT,
    );
  }
}
