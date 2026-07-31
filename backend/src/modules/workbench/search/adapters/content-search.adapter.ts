import { Injectable } from '@nestjs/common';
import { ContentStatus, FileAssetStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { SearchAdapter, SearchCandidate, SearchType } from '../domain/search.types';
import { buildSearchSnippet, limitSearchCandidates } from '../domain/search-ranking';

const CANDIDATE_LIMIT = 100;

@Injectable()
export class ContentSearchAdapter implements SearchAdapter {
  readonly types = ['DOCUMENT', 'FILE'] as const;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    const documentsPromise = types.includes('DOCUMENT')
      ? this.searchDocuments(query)
      : Promise.resolve([]);
    const filesPromise = types.includes('FILE') ? this.searchFiles(query) : Promise.resolve([]);
    const [documents, files] = await Promise.all([documentsPromise, filesPromise]);
    return limitSearchCandidates(query, [...documents, ...files], CANDIDATE_LIMIT);
  }

  private async searchDocuments(query: string): Promise<SearchCandidate[]> {
    const where: Prisma.ContentDocumentWhereInput = {
      AND: [
        {
          status: ContentStatus.ACTIVE,
          trashedAt: null,
          AND: [
            { OR: [{ spaceId: null }, { space: { archivedAt: null } }] },
            { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
            { OR: [{ meetingId: null }, { meeting: { archivedAt: null } }] },
          ],
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { plainText: { contains: query, mode: 'insensitive' } },
            { tags: { has: query } },
          ],
        },
        this.dataScope.documents(this.principal()),
      ],
    };
    const documents = await this.prisma.contentDocument.findMany({
      where,
      select: {
        id: true,
        title: true,
        plainText: true,
        tags: true,
        isFavorite: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    return documents.map((document) => ({
      type: 'DOCUMENT',
      id: document.id,
      title: document.title,
      snippet: buildSearchSnippet(query, [document.plainText, document.tags.join(' · ')]),
      path: `/docs?documentId=${encodeURIComponent(document.id)}`,
      updatedAt: document.updatedAt,
      actions: ['OPEN', 'COPY_LINK', 'TOGGLE_DOCUMENT_FAVORITE'],
    }));
  }

  private async searchFiles(query: string): Promise<SearchCandidate[]> {
    const principal = this.principal();
    const where: Prisma.FileAssetWhereInput = {
      status: FileAssetStatus.ACTIVE,
      trashedAt: null,
      AND: [
        {
          OR: [
            { documentId: { not: null } },
            { projectId: { not: null } },
            { meetingId: { not: null } },
          ],
        },
        {
          OR: [
            { documentId: null },
            {
              document: {
                AND: [
                  {
                    status: ContentStatus.ACTIVE,
                    trashedAt: null,
                    AND: [
                      { OR: [{ spaceId: null }, { space: { archivedAt: null } }] },
                      { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                      { OR: [{ meetingId: null }, { meeting: { archivedAt: null } }] },
                    ],
                  },
                  this.dataScope.documents(principal),
                ],
              },
            },
          ],
        },
        {
          OR: [
            { projectId: null },
            { project: { AND: [{ archivedAt: null }, this.dataScope.projects(principal)] } },
          ],
        },
        {
          OR: [
            { meetingId: null },
            { meeting: { AND: [{ archivedAt: null }, this.dataScope.meetings(principal)] } },
          ],
        },
      ],
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { versions: { some: { originalName: { contains: query, mode: 'insensitive' } } } },
      ],
    };
    const files = await this.prisma.fileAsset.findMany({
      where,
      select: {
        id: true,
        name: true,
        documentId: true,
        projectId: true,
        meetingId: true,
        updatedAt: true,
        versions: {
          select: { originalName: true, mimeType: true, size: true },
          where: { originalName: { contains: query, mode: 'insensitive' } },
          orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    return files.flatMap((file) => {
      const version = file.versions[0];
      const path = this.fileOwnerPath(file, file.id);
      if (!path) return [];
      return [
        {
          type: 'FILE',
          id: file.id,
          title: file.name,
          snippet: buildSearchSnippet(query, [
            version?.originalName ?? null,
            version?.mimeType ?? null,
            version ? `${version.size} bytes` : null,
          ]),
          path,
          updatedAt: file.updatedAt,
          actions: ['OPEN', 'COPY_LINK'],
        },
      ];
    });
  }

  private fileOwnerPath(
    file: {
      documentId: string | null;
      projectId: string | null;
      meetingId: string | null;
    },
    fileId: string,
  ): string | null {
    const encodedFileId = encodeURIComponent(fileId);
    if (file.documentId) {
      return `/docs?documentId=${encodeURIComponent(file.documentId)}&fileId=${encodedFileId}`;
    }
    if (file.meetingId) {
      return `/calendar?meetingId=${encodeURIComponent(file.meetingId)}&fileId=${encodedFileId}`;
    }
    if (file.projectId) {
      return `/spaces/projects/${encodeURIComponent(file.projectId)}/docs?fileId=${encodedFileId}`;
    }
    return null;
  }
}
