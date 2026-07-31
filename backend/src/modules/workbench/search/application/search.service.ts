import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../../../iam/interface/http/permissions.decorator';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  buildSearchMatches,
  compareSearchHits,
  normalizeSearchQuery,
  scoreSearchCandidate,
} from '../domain/search-ranking';
import {
  GlobalSearchResult,
  SEARCH_TYPES,
  SearchAdapter,
  SearchCandidate,
  SearchHit,
  SearchPartialFailure,
  SearchType,
} from '../domain/search.types';

export const SEARCH_ADAPTERS = Symbol('SEARCH_ADAPTERS');

const SEARCH_TYPE_PERMISSIONS: Record<SearchType, string> = {
  PROJECT: PERMISSIONS.PROJECT_READ,
  TASK: PERMISSIONS.TASK_READ,
  APPLICATION_CASE: PERMISSIONS.APPLICATION_READ,
  MEETING: PERMISSIONS.MEETING_READ,
  DOCUMENT: PERMISSIONS.DOCUMENT_READ,
  FILE: PERMISSIONS.DOCUMENT_READ,
  RISK: PERMISSIONS.RISK_READ,
  ISSUE: PERMISSIONS.ISSUE_READ,
  DECISION: PERMISSIONS.DECISION_READ,
  PARTNER: PERMISSIONS.PARTNER_READ,
  COMMUNICATION: PERMISSIONS.PARTNER_READ,
  NON_PROJECT_RD: PERMISSIONS.NON_PROJECT_RD_READ,
  INTELLIGENCE_ITEM: PERMISSIONS.INTELLIGENCE_READ,
  BASE_RECORD: PERMISSIONS.BASE_READ,
  EMPLOYEE: PERMISSIONS.EMPLOYEE_READ,
  EMPLOYEE_WORK: PERMISSIONS.EMPLOYEE_READ,
};

export interface SearchQuery {
  q: string;
  types?: SearchType[];
  page?: number;
  pageSize?: number;
}

const MAX_CANDIDATES = 500;
const MAX_ADAPTER_CANDIDATES = 100;
const ADAPTER_CONCURRENCY = 2;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_ADAPTERS) private readonly adapters: SearchAdapter[],
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  async search(input: SearchQuery): Promise<GlobalSearchResult> {
    const query = this.normalizeQuery(input.q);
    const requestedTypes = input.types?.length ? [...new Set(input.types)] : [...SEARCH_TYPES];
    const principal = this.requestContext.requirePrincipal();
    const permittedTypes = requestedTypes.filter((type) =>
      principal.roleCodes.includes('SUPER_ADMIN') ||
      principal.permissions.some(({ code }) => code === SEARCH_TYPE_PERMISSIONS[type]),
    );
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const selectedAdapters = this.adapters
      .map((adapter) => ({
        adapter,
        types: adapter.types.filter((type) => permittedTypes.includes(type)),
      }))
      .filter(({ types }) => types.length > 0);

    const settled = await this.searchAdapters(selectedAdapters, query);
    const partialFailures: SearchPartialFailure[] = [];
    const hitsByAdapter: SearchHit[][] = [];
    let successfulAdapters = 0;
    for (const [index, result] of settled.entries()) {
      const selected = selectedAdapters[index];
      if (result.status === 'rejected') {
        partialFailures.push(this.failureFor(selected.types));
        continue;
      }
      try {
        const hits = result.value
          .map((candidate) => this.toHit(query, candidate))
          .filter((hit) => hit.score > 0)
          .sort(compareSearchHits)
          .slice(0, MAX_ADAPTER_CANDIDATES);
        hitsByAdapter.push(hits);
        successfulAdapters += 1;
      } catch {
        partialFailures.push(this.failureFor(selected.types));
      }
    }
    if (selectedAdapters.length > 0 && successfulAdapters === 0) throw this.partialFailure();

    const hits = hitsByAdapter.flat().sort(compareSearchHits).slice(0, MAX_CANDIDATES);

    const groups = SEARCH_TYPES.flatMap((type) => {
      const count = hits.filter((hit) => hit.type === type).length;
      return count ? [{ type, count }] : [];
    });
    const total = hits.length;
    return {
      data: hits.slice((page - 1) * pageSize, page * pageSize),
      groups,
      meta: { page, pageSize, total },
      partialFailures,
    };
  }

  private normalizeQuery(value: string): string {
    try {
      return normalizeSearchQuery(value);
    } catch {
      throw new AppError({
        code: ErrorCodes.SEARCH_QUERY_INVALID,
        message: 'Search query must be between 2 and 100 characters',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private toHit(query: string, candidate: SearchCandidate): SearchHit {
    this.assertInternalPath(candidate.path);
    const titleMatches = buildSearchMatches(query, candidate.title).map((match) => ({
      field: 'title' as const,
      ...match,
    }));
    const snippetMatches = candidate.snippet
      ? buildSearchMatches(query, candidate.snippet).map((match) => ({
          field: 'snippet' as const,
          ...match,
        }))
      : [];
    return {
      type: candidate.type,
      id: candidate.id,
      title: candidate.title,
      snippet: candidate.snippet,
      path: candidate.path,
      updatedAt: candidate.updatedAt.toISOString(),
      score: scoreSearchCandidate({ query, title: candidate.title, snippet: candidate.snippet }),
      matches: [...titleMatches, ...snippetMatches],
      actions: candidate.actions ?? ['OPEN', 'COPY_LINK'],
    };
  }

  private assertInternalPath(path: string): void {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\') ||
      /^[a-z][a-z\d+.-]*:/iu.test(path.slice(1)) ||
      /[\u0000-\u001F\u007F]/u.test(path)
    ) {
      throw new Error('Search adapter returned an unsafe path');
    }
  }

  private async searchAdapters(
    selectedAdapters: Array<{ adapter: SearchAdapter; types: SearchType[] }>,
    query: string,
  ): Promise<Array<PromiseSettledResult<SearchCandidate[]>>> {
    const results: Array<PromiseSettledResult<SearchCandidate[]>> = new Array(
      selectedAdapters.length,
    );
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < selectedAdapters.length) {
        const index = nextIndex;
        nextIndex += 1;
        const selected = selectedAdapters[index];
        try {
          const value = await selected.adapter.search(query, selected.types);
          results[index] = { status: 'fulfilled', value };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };
    const workerCount = Math.min(ADAPTER_CONCURRENCY, selectedAdapters.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  private failureFor(types: readonly SearchType[]): SearchPartialFailure {
    return {
      types: [...types],
      code: 'SEARCH_PARTIAL_FAILURE',
      message: '部分类型暂时无法搜索，请重试。',
    };
  }

  private partialFailure(): AppError {
    return new AppError({
      code: ErrorCodes.SEARCH_PARTIAL_FAILURE,
      message: 'Search is temporarily unavailable',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    });
  }
}
