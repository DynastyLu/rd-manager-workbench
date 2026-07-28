import { BadRequestException } from '@nestjs/common';
import { KnowledgeScopeType, Prisma } from '@prisma/client';

export type KnowledgeScope =
  | { type: 'ALL' }
  | { type: 'PROJECT'; projectId: string }
  | { type: 'SPACE'; spaceId: string }
  | { type: 'FOLDER'; folderWatchId: string }
  | { type: 'DOCUMENTS'; documentIds: string[] }
  | { type: 'RECENT' };

type PersistedScope = {
  scopeType: KnowledgeScopeType;
  scopeValue: Prisma.JsonValue | null;
};

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} 不能为空`);
  }
  return value.trim();
}

export function normalizeKnowledgeScope(scope: KnowledgeScope): KnowledgeScope {
  switch (scope.type) {
    case 'PROJECT':
      return { type: scope.type, projectId: requireIdentifier(scope.projectId, 'projectId') };
    case 'SPACE':
      return { type: scope.type, spaceId: requireIdentifier(scope.spaceId, 'spaceId') };
    case 'FOLDER':
      return {
        type: scope.type,
        folderWatchId: requireIdentifier(scope.folderWatchId, 'folderWatchId'),
      };
    case 'DOCUMENTS': {
      const documentIds = [
        ...new Set(
          (scope.documentIds ?? [])
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];
      if (documentIds.length === 0) {
        throw new BadRequestException('指定文档范围至少需要选择一个文档');
      }
      if (documentIds.length > 100) {
        throw new BadRequestException('指定文档范围最多支持 100 个文档');
      }
      return { type: scope.type, documentIds };
    }
    case 'ALL':
    case 'RECENT':
      return { type: scope.type };
    default:
      throw new BadRequestException('不支持的知识检索范围');
  }
}

export function serializeKnowledgeScope(scope: KnowledgeScope): {
  scopeType: KnowledgeScopeType;
  scopeValue: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  const normalized = normalizeKnowledgeScope(scope);
  const { type, ...value } = normalized;
  return {
    scopeType: type,
    scopeValue: Object.keys(value).length > 0 ? (value as Prisma.InputJsonValue) : Prisma.DbNull,
  };
}

export function deserializeKnowledgeScope(persisted: PersistedScope): KnowledgeScope {
  const value =
    persisted.scopeValue && typeof persisted.scopeValue === 'object' && !Array.isArray(persisted.scopeValue)
      ? (persisted.scopeValue as Record<string, unknown>)
      : {};

  switch (persisted.scopeType) {
    case 'PROJECT':
      return normalizeKnowledgeScope({ type: 'PROJECT', projectId: String(value.projectId ?? '') });
    case 'SPACE':
      return normalizeKnowledgeScope({ type: 'SPACE', spaceId: String(value.spaceId ?? '') });
    case 'FOLDER':
      return normalizeKnowledgeScope({
        type: 'FOLDER',
        folderWatchId: String(value.folderWatchId ?? ''),
      });
    case 'DOCUMENTS':
      return normalizeKnowledgeScope({
        type: 'DOCUMENTS',
        documentIds: Array.isArray(value.documentIds) ? value.documentIds.map(String) : [],
      });
    case 'RECENT':
      return { type: 'RECENT' };
    case 'ALL':
    default:
      return { type: 'ALL' };
  }
}

export function buildKnowledgeScopeSql(scope: KnowledgeScope): Prisma.Sql {
  const normalized = normalizeKnowledgeScope(scope);
  switch (normalized.type) {
    case 'PROJECT':
      return Prisma.sql`AND cd.project_id = ${normalized.projectId}`;
    case 'SPACE':
      return Prisma.sql`AND cd.space_id = ${normalized.spaceId}`;
    case 'FOLDER':
      return Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM app.folder_files ff
          WHERE ff.document_id = cd.id
            AND ff.watch_id = ${normalized.folderWatchId}
            AND ff.status = 'ACTIVE'
        )
      `;
    case 'DOCUMENTS':
      return Prisma.sql`AND cd.id IN (${Prisma.join(normalized.documentIds)})`;
    case 'RECENT':
      return Prisma.sql`AND cd.updated_at >= NOW() - INTERVAL '30 days'`;
    case 'ALL':
    default:
      return Prisma.empty;
  }
}
