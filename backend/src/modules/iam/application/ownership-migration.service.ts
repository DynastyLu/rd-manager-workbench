import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCodes } from '../../../shared/errors/error-codes';

export type OwnershipConfidence = 'EXACT' | 'UNIQUE_NAME' | 'AMBIGUOUS' | 'MISSING';

export interface OwnershipMigrationRecord {
  id: string;
  module: string;
  recordType: string;
  recordId: string;
  title: string;
  legacyOwner: string;
  confidence: OwnershipConfidence;
  suggestedUser: {
    id: string;
    username: string;
    displayName: string;
  } | null;
}

export interface OwnershipMigrationStatus {
  startedAt: string | null;
  lastAnalyzedAt: string | null;
  lastAppliedAt: string | null;
  completedAt: string | null;
  total: number;
  assigned: number;
  needsReview: number;
  isComplete: boolean;
}

interface MigrationTargetConfig {
  module: string;
  recordType: string;
  modelName: string;
  titleField: string;
  legacyField: string;
  ownerField: string;
  fallbackField?: string;
}

interface MigrationState {
  startedAt?: string;
  lastAnalyzedAt?: string;
  lastAppliedAt?: string;
  completedAt?: string;
  total?: number;
  assigned?: number;
  needsReview?: number;
  unresolvedKeys?: string[];
}

interface UserIndexEntry {
  id: string;
  username: string;
  employeeNo: string | null;
  displayName: string;
}

interface Cursor {
  targetIndex: number;
  recordId: string | null;
}

const MIGRATION_STATE_KEY = 'OWNERSHIP_MIGRATION';
const APPLY_IDEMPOTENCY_PREFIX = 'OWNERSHIP_MIGRATION_APPLY_';
const DEFAULT_BATCH_SIZE = 100;

const MIGRATION_TARGETS: MigrationTargetConfig[] = [
  {
    module: 'projects',
    recordType: 'Project',
    modelName: 'project',
    titleField: 'name',
    legacyField: 'leadName',
    ownerField: 'ownerUserId',
    fallbackField: 'participantNames',
  },
  {
    module: 'milestones',
    recordType: 'Milestone',
    modelName: 'milestone',
    titleField: 'name',
    legacyField: 'ownerName',
    ownerField: 'ownerUserId',
  },
  {
    module: 'tasks',
    recordType: 'WorkTask',
    modelName: 'workTask',
    titleField: 'title',
    legacyField: 'assigneeName',
    ownerField: 'assigneeUserId',
    fallbackField: 'collaboratorNames',
  },
  {
    module: 'risks',
    recordType: 'Risk',
    modelName: 'risk',
    titleField: 'title',
    legacyField: 'ownerName',
    ownerField: 'ownerUserId',
  },
  {
    module: 'issues',
    recordType: 'Issue',
    modelName: 'issue',
    titleField: 'title',
    legacyField: 'ownerName',
    ownerField: 'ownerUserId',
  },
  {
    module: 'meetings',
    recordType: 'MeetingAction',
    modelName: 'meetingAction',
    titleField: 'title',
    legacyField: 'ownerName',
    ownerField: 'ownerUserId',
  },
  {
    module: 'applications',
    recordType: 'ApplicationCase',
    modelName: 'applicationCase',
    titleField: 'title',
    legacyField: 'subjectName',
    ownerField: 'ownerUserId',
    fallbackField: 'collaboratorNames',
  },
  {
    module: 'operations',
    recordType: 'NonProjectRdItem',
    modelName: 'nonProjectRdItem',
    titleField: 'title',
    legacyField: 'ownerName',
    ownerField: 'ownerUserId',
  },
];

@Injectable()
export class OwnershipMigrationService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async getStatus(): Promise<OwnershipMigrationStatus> {
    const state = await this.loadState();
    return this.toStatus(state);
  }

  async analyze(cursorInput?: string, batchSizeInput?: number): Promise<{
    cursor: string | null;
    items: OwnershipMigrationRecord[];
  }> {
    const batchSize = Math.min(
      Math.max(1, batchSizeInput ?? DEFAULT_BATCH_SIZE),
      1000,
    );
    const cursor = this.parseCursor(cursorInput);
    const users = await this.loadUserIndex();
    const superAdminId = await this.findSuperAdminId();

    const result = await this.scanBatch(cursor, batchSize, users, superAdminId);

    const state = await this.loadState();
    await this.saveState({
      ...state,
      startedAt: state.startedAt ?? new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
    });

    return {
      cursor: result.nextCursor,
      items: result.items,
    };
  }

  async apply(
    idempotencyKey: string,
    actorId: string,
    actorUsername: string,
  ): Promise<{ appliedCount: number; unresolvedCount: number }> {
    const stored = await this.loadApplyResult(idempotencyKey);
    if (stored) {
      return stored;
    }

    const users = await this.loadUserIndex();
    const superAdminId = await this.findSuperAdminId();
    const allItems: OwnershipMigrationRecord[] = [];

    let cursor: string | null = null;
    do {
      const batch = await this.scanBatch(
        this.parseCursor(cursor),
        500,
        users,
        superAdminId,
      );
      allItems.push(...batch.items);
      cursor = batch.nextCursor;
    } while (cursor);

    const unresolvedKeys: string[] = [];
    let appliedCount = 0;

    for (const item of allItems) {
      const targetUserId =
        item.confidence === 'EXACT' || item.confidence === 'UNIQUE_NAME'
          ? item.suggestedUser!.id
          : superAdminId;

      const updated = await this.applyAssignment(
        item,
        targetUserId,
        actorId,
        actorUsername,
      );
      if (updated) {
        appliedCount++;
      }

      if (item.confidence === 'AMBIGUOUS' || item.confidence === 'MISSING') {
        unresolvedKeys.push(this.recordKey(item));
      }
    }

    const state = await this.loadState();
    await this.saveState({
      ...state,
      startedAt: state.startedAt ?? new Date().toISOString(),
      lastAppliedAt: new Date().toISOString(),
      total: allItems.length,
      assigned: allItems.filter(
        (i) => i.confidence === 'EXACT' || i.confidence === 'UNIQUE_NAME',
      ).length,
      needsReview: unresolvedKeys.length,
      unresolvedKeys,
    });

    const result = {
      appliedCount,
      unresolvedCount: unresolvedKeys.length,
    };
    await this.saveApplyResult(idempotencyKey, result);
    return result;
  }

  async listUnresolved(
    cursorInput?: string,
    batchSizeInput?: number,
  ): Promise<{ cursor: string | null; items: OwnershipMigrationRecord[] }> {
    const batchSize = Math.min(
      Math.max(1, batchSizeInput ?? DEFAULT_BATCH_SIZE),
      1000,
    );
    const state = await this.loadState();
    const allKeys = state.unresolvedKeys ?? [];
    const superAdminId = await this.findSuperAdminId();
    const users = await this.loadUserIndex();

    const startIndex = cursorInput ? Number(cursorInput) : 0;
    if (Number.isNaN(startIndex)) {
      return { cursor: null, items: [] };
    }

    const pageKeys = allKeys.slice(startIndex, startIndex + batchSize);
    const items: OwnershipMigrationRecord[] = [];

    for (const key of pageKeys) {
      const found = await this.findRecordByKey(key);
      if (!found) continue;
      const { record, currentOwnerUserId } = found;
      const match = this.resolveMatch(record, users, superAdminId);
      // A record is unresolved only while it is still assigned to the super admin.
      if (currentOwnerUserId !== superAdminId) continue;
      items.push(match);
    }

    const nextIndex = startIndex + pageKeys.length;
    return {
      cursor: nextIndex < allKeys.length ? String(nextIndex) : null,
      items,
    };
  }

  async bulkAssign(
    assignments: { recordType: string; recordId: string; ownerUserId: string }[],
    actorId: string,
    actorUsername: string,
  ): Promise<{ updatedCount: number }> {
    let updatedCount = 0;
    const state = await this.loadState();
    const unresolvedSet = new Set(state.unresolvedKeys ?? []);

    for (const assignment of assignments) {
      const target = MIGRATION_TARGETS.find(
        (t) => t.recordType === assignment.recordType,
      );
      if (!target) continue;

      const item: OwnershipMigrationRecord = {
        id: this.recordKeyFromParts(assignment.recordType, assignment.recordId),
        module: target.module,
        recordType: assignment.recordType,
        recordId: assignment.recordId,
        title: '',
        legacyOwner: '',
        confidence: 'AMBIGUOUS',
        suggestedUser: null,
      };

      const updated = await this.applyAssignment(
        item,
        assignment.ownerUserId,
        actorId,
        actorUsername,
        'OWNERSHIP_CORRECTED',
      );
      if (updated) {
        updatedCount++;
        unresolvedSet.delete(item.id);
      }
    }

    await this.saveState({
      ...state,
      unresolvedKeys: [...unresolvedSet],
      needsReview: unresolvedSet.size,
    });

    return { updatedCount };
  }

  async complete(): Promise<{ completed: true }> {
    const unresolved = await this.listUnresolved(undefined, 1);
    if (unresolved.items.length > 0 || unresolved.cursor !== null) {
      throw new AppError({
        code: ErrorCodes.OWNERSHIP_MIGRATION_INCOMPLETE,
        message: 'Ownership migration cannot be completed while blocking unresolved records remain',
        statusCode: 409,
        details: { unresolvedCount: unresolved.items.length },
      });
    }

    const state = await this.loadState();
    await this.saveState({
      ...state,
      completedAt: new Date().toISOString(),
    });

    return { completed: true };
  }

  private async scanBatch(
    cursor: Cursor,
    batchSize: number,
    users: Map<string, UserIndexEntry>,
    superAdminId: string,
  ): Promise<{ nextCursor: string | null; items: OwnershipMigrationRecord[] }> {
    const items: OwnershipMigrationRecord[] = [];
    let targetIndex = cursor.targetIndex;
    let recordId = cursor.recordId;

    while (targetIndex < MIGRATION_TARGETS.length && items.length < batchSize) {
      const target = MIGRATION_TARGETS[targetIndex];
      const remaining = batchSize - items.length;
      const batch = await this.fetchTargetBatch(target, recordId, remaining);

      for (const raw of batch.records) {
        const record = this.toMigrationRecord(raw, target);
        const match = this.resolveMatch(record, users, superAdminId);
        items.push(match);
      }

      if (batch.hasMore) {
        const lastId = String(batch.records[batch.records.length - 1]?.id ?? '');
        return {
          nextCursor: this.serializeCursor({ targetIndex, recordId: lastId || null }),
          items,
        };
      }

      targetIndex++;
      recordId = null;
    }

    return {
      nextCursor: null,
      items,
    };
  }

  private async fetchTargetBatch(
    target: MigrationTargetConfig,
    afterId: string | null,
    take: number,
  ): Promise<{ records: Array<Record<string, unknown>>; hasMore: boolean }> {
    const model = (this.prisma as unknown as Record<string, unknown>)[
      target.modelName
    ] as {
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    };

    if (typeof model?.findMany !== 'function') {
      return { records: [], hasMore: false };
    }

    const where: Record<string, unknown> = {
      [target.ownerField]: null,
    };

    const records = await model.findMany({
      where,
      take: take + 1,
      orderBy: { id: 'asc' as const },
      ...(afterId
        ? { skip: 1, cursor: { id: afterId } }
        : {}),
    });

    const hasMore = records.length > take;
    return {
      records: hasMore ? records.slice(0, take) : records,
      hasMore,
    };
  }

  private toMigrationRecord(
    raw: Record<string, unknown>,
    target: MigrationTargetConfig,
  ): OwnershipMigrationRecord {
    const id = String(raw.id ?? '');
    const title = String(raw[target.titleField] ?? '');
    const legacyFieldValue = raw[target.legacyField];
    const fallbackValue = target.fallbackField
      ? raw[target.fallbackField]
      : undefined;

    let legacyOwner = '';
    if (typeof legacyFieldValue === 'string' && legacyFieldValue.trim().length > 0) {
      legacyOwner = legacyFieldValue.trim();
    } else if (Array.isArray(fallbackValue) && fallbackValue.length > 0) {
      const first = fallbackValue[0];
      if (typeof first === 'string') {
        legacyOwner = first.trim();
      }
    }

    return {
      id: this.recordKeyFromParts(target.recordType, id),
      module: target.module,
      recordType: target.recordType,
      recordId: id,
      title,
      legacyOwner,
      confidence: 'MISSING',
      suggestedUser: null,
    };
  }

  private resolveMatch(
    record: OwnershipMigrationRecord,
    users: Map<string, UserIndexEntry>,
    superAdminId: string,
  ): OwnershipMigrationRecord {
    const normalized = record.legacyOwner.toLowerCase();
    const candidates = new Map<string, UserIndexEntry>();

    if (normalized.length > 0) {
      for (const user of users.values()) {
        if (user.employeeNo?.toLowerCase() === normalized) {
          candidates.set(user.id, user);
        } else if (user.username.toLowerCase() === normalized) {
          candidates.set(user.id, user);
        } else if (user.displayName.toLowerCase() === normalized) {
          candidates.set(user.id, user);
        }
      }
    }

    let confidence: OwnershipConfidence = 'MISSING';
    let matched: UserIndexEntry | null = null;

    if (candidates.size === 0) {
      confidence = 'MISSING';
    } else if (candidates.size === 1) {
      matched = candidates.values().next().value as UserIndexEntry;
      const exact =
        matched.employeeNo?.toLowerCase() === normalized ||
        matched.username.toLowerCase() === normalized;
      confidence = exact ? 'EXACT' : 'UNIQUE_NAME';
    } else {
      confidence = 'AMBIGUOUS';
    }

    const suggestedUser = matched
      ? {
          id: matched.id,
          username: matched.username,
          displayName: matched.displayName,
        }
      : {
          id: superAdminId,
          username: 'super-admin',
          displayName: '超级管理员',
        };

    return {
      ...record,
      confidence,
      suggestedUser,
    };
  }

  private async applyAssignment(
    item: OwnershipMigrationRecord,
    targetUserId: string,
    actorId: string,
    actorUsername: string,
    eventType: 'OWNERSHIP_ASSIGNED' | 'OWNERSHIP_CORRECTED' = 'OWNERSHIP_ASSIGNED',
  ): Promise<boolean> {
    const target = MIGRATION_TARGETS.find((t) => t.recordType === item.recordType);
    if (!target) return false;

    const model = (this.prisma as unknown as Record<string, unknown>)[
      target.modelName
    ] as {
      findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
      update: (args: unknown) => Promise<Record<string, unknown>>;
    };

    if (typeof model?.findUnique !== 'function' || typeof model?.update !== 'function') {
      return false;
    }

    const existing = await model.findUnique({
      where: { id: item.recordId },
      select: { [target.ownerField]: true },
    });

    if (!existing) return false;
    const currentOwnerUserId = existing[target.ownerField];
    if (currentOwnerUserId === targetUserId) {
      return false;
    }

    await model.update({
      where: { id: item.recordId },
      data: { [target.ownerField]: targetUserId },
    });

    await this.prisma.loginAudit.create({
      data: {
        userId: actorId,
        username: actorUsername,
        eventType,
        success: true,
        failureReason: `${target.recordType}:${item.recordId}:${item.legacyOwner}->${String(targetUserId)}`,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
      },
    });

    return true;
  }

  private async findRecordByKey(
    key: string,
  ): Promise<{ record: OwnershipMigrationRecord; currentOwnerUserId: string | null } | null> {
    const parts = key.split(':');
    const recordType = parts[0];
    const recordId = parts.slice(1).join(':');
    const target = MIGRATION_TARGETS.find((t) => t.recordType === recordType);
    if (!target) return null;

    const model = (this.prisma as unknown as Record<string, unknown>)[
      target.modelName
    ] as {
      findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    };

    if (typeof model?.findUnique !== 'function') return null;

    const raw = await model.findUnique({
      where: { id: recordId },
      select: { id: true, [target.titleField]: true, [target.legacyField]: true, [target.ownerField]: true, ...(target.fallbackField ? { [target.fallbackField]: true } : {}) },
    });
    if (!raw) return null;
    const currentOwnerUserId = raw[target.ownerField] as string | null;
    return { record: this.toMigrationRecord(raw, target), currentOwnerUserId };
  }

  private async loadUserIndex(): Promise<Map<string, UserIndexEntry>> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        username: true,
        employeeNo: true,
        resourceProfile: { select: { displayName: true } },
      },
    });

    return new Map(
      users.map((u) => [
        u.id,
        {
          id: u.id,
          username: u.username,
          employeeNo: u.employeeNo,
          displayName: u.resourceProfile?.displayName ?? u.username,
        },
      ]),
    );
  }

  private async findSuperAdminId(): Promise<string> {
    const superAdminRole = await this.prisma.role.findUnique({
      where: { code: 'SUPER_ADMIN' },
      select: { id: true },
    });

    if (!superAdminRole) {
      throw new AppError({
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Super admin role not found',
        statusCode: 500,
      });
    }

    const userRole = await this.prisma.userRole.findFirst({
      where: { roleId: superAdminRole.id },
      orderBy: { assignedAt: 'asc' },
      select: { userId: true },
    });

    if (!userRole) {
      throw new AppError({
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'No super admin user found',
        statusCode: 500,
      });
    }

    return userRole.userId;
  }

  private async loadState(): Promise<MigrationState> {
    const row = await this.prisma.appMetadata.findUnique({
      where: { key: MIGRATION_STATE_KEY },
    });
    if (!row) return {};
    return (row.value ?? {}) as MigrationState;
  }

  private async saveState(state: MigrationState): Promise<void> {
    await this.prisma.appMetadata.upsert({
      where: { key: MIGRATION_STATE_KEY },
      create: { key: MIGRATION_STATE_KEY, value: state as Prisma.InputJsonValue },
      update: { value: state as Prisma.InputJsonValue },
    });
  }

  private async loadApplyResult(
    idempotencyKey: string,
  ): Promise<{ appliedCount: number; unresolvedCount: number } | null> {
    const row = await this.prisma.appMetadata.findUnique({
      where: { key: `${APPLY_IDEMPOTENCY_PREFIX}${idempotencyKey}` },
    });
    if (!row) return null;
    return (row.value ?? null) as { appliedCount: number; unresolvedCount: number } | null;
  }

  private async saveApplyResult(
    idempotencyKey: string,
    result: { appliedCount: number; unresolvedCount: number },
  ): Promise<void> {
    await this.prisma.appMetadata.upsert({
      where: { key: `${APPLY_IDEMPOTENCY_PREFIX}${idempotencyKey}` },
      create: {
        key: `${APPLY_IDEMPOTENCY_PREFIX}${idempotencyKey}`,
        value: result as Prisma.InputJsonValue,
      },
      update: {
        value: result as Prisma.InputJsonValue,
      },
    });
  }

  private recordKey(item: OwnershipMigrationRecord): string {
    return this.recordKeyFromParts(item.recordType, item.recordId);
  }

  private recordKeyFromParts(recordType: string, recordId: string): string {
    return `${recordType}:${recordId}`;
  }

  private parseCursor(input?: string | null): Cursor {
    if (!input) return { targetIndex: 0, recordId: null };
    const [index, ...rest] = input.split(':');
    const targetIndex = Number(index);
    if (Number.isNaN(targetIndex)) return { targetIndex: 0, recordId: null };
    return { targetIndex, recordId: rest.join(':') || null };
  }

  private serializeCursor(cursor: Cursor): string {
    return `${cursor.targetIndex}:${cursor.recordId ?? ''}`;
  }

  private toStatus(state: MigrationState): OwnershipMigrationStatus {
    return {
      startedAt: state.startedAt ?? null,
      lastAnalyzedAt: state.lastAnalyzedAt ?? null,
      lastAppliedAt: state.lastAppliedAt ?? null,
      completedAt: state.completedAt ?? null,
      total: state.total ?? 0,
      assigned: state.assigned ?? 0,
      needsReview: state.needsReview ?? 0,
      isComplete: state.completedAt ? true : false,
    };
  }
}
