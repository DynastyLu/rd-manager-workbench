import { EmployeeWorkStatus } from '@prisma/client';
import { AuthorizationService } from '../../../../src/modules/iam/application/authorization.service';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import {
  buildProjectProgressDraftContent,
  ProjectProgressDraftService,
} from '../../../../src/modules/workbench/employees/application/project-progress-draft.service';

const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue({
    userId: 'user-1',
    employeeId: 'employee-1',
    username: 'tester',
    sessionId: 'session-1',
    roleCodes: ['EMPLOYEE'],
    permissions: [],
    permissionVersion: 1,
    mustChangePassword: false,
  }),
} as unknown as RequestContextService;

const mockAuthorization = {
  hasPermission: jest.fn().mockReturnValue(false),
} as unknown as AuthorizationService;

describe('buildProjectProgressDraftContent', () => {
  it('groups weekly completion, next plans, blockers, risks, and hours deterministically', () => {
    const content = buildProjectProgressDraftContent({
      projectId: 'project-1',
      workItems: [
        {
          id: 'work-2',
          employeeId: 'employee-2',
          employeeName: '赵六',
          title: '联调接口',
          summaryText: null,
          status: EmployeeWorkStatus.BLOCKED,
          riskText: '接口仍不稳定',
          plannedHours: 8,
          actualHours: 10,
        },
        {
          id: 'work-1',
          employeeId: 'employee-1',
          employeeName: '李四',
          title: '完成权限模型',
          summaryText: '核心模型已合入',
          status: EmployeeWorkStatus.COMPLETED,
          riskText: null,
          plannedHours: 16,
          actualHours: 14,
        },
        {
          id: 'work-3',
          employeeId: 'employee-1',
          employeeName: '李四',
          title: '性能基线',
          summaryText: '完成第一轮压测',
          status: EmployeeWorkStatus.AT_RISK,
          riskText: '吞吐未达目标',
          plannedHours: null,
          actualHours: null,
        },
      ],
      weekPlans: [
        {
          id: 'plan-2',
          employeeId: 'employee-2',
          employeeName: '赵六',
          title: '完成联调',
          planText: '关闭剩余接口问题',
          plannedHours: 12,
        },
        {
          id: 'plan-1',
          employeeId: 'employee-1',
          employeeName: '李四',
          title: '补齐性能报告',
          planText: null,
          plannedHours: 6,
        },
      ],
      unlinkedRows: [
        { id: 'row-9', rowNumber: 9, employeeName: '王五', title: '未关联事项' },
      ],
    });

    expect(content).toEqual({
      completed: [
        {
          sourceId: 'work-1',
          employeeId: 'employee-1',
          employeeName: '李四',
          text: '核心模型已合入',
        },
      ],
      nextPlans: [
        {
          sourceId: 'plan-1',
          employeeId: 'employee-1',
          employeeName: '李四',
          text: '补齐性能报告',
          plannedHours: 6,
        },
        {
          sourceId: 'plan-2',
          employeeId: 'employee-2',
          employeeName: '赵六',
          text: '关闭剩余接口问题',
          plannedHours: 12,
        },
      ],
      blockers: [
        {
          sourceId: 'work-2',
          employeeId: 'employee-2',
          employeeName: '赵六',
          text: '接口仍不稳定',
        },
      ],
      risks: [
        {
          sourceId: 'work-3',
          employeeId: 'employee-1',
          employeeName: '李四',
          text: '吞吐未达目标',
        },
      ],
      hours: { planned: 24, actual: 24, nextPlanned: 18, missingCount: 1 },
      unlinkedRows: [
        { sourceId: 'row-9', rowNumber: 9, employeeName: '王五', title: '未关联事项' },
      ],
    });
  });
});

describe('ProjectProgressDraftService', () => {
  it('returns the existing draft when the same source fingerprint is regenerated', async () => {
    const existing = {
      id: 'draft-1',
      projectId: 'project-1',
      contentFingerprint: 'same-fingerprint',
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      projectProgressDraft: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new ProjectProgressDraftService(prisma, mockRequestContext, mockAuthorization);

    await expect(
      service.storeGeneratedDraft({
        projectId: 'project-1',
        projectName: '研发平台',
        periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
        periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
        sourceBatchId: 'batch-2',
        sourceVersion: 2,
        contentFingerprint: 'same-fingerprint',
        content: {
          completed: [],
          nextPlans: [],
          blockers: [],
          risks: [],
          hours: { planned: 0, actual: 0, nextPlanned: 0, missingCount: 0 },
          unlinkedRows: [],
        },
      }),
    ).resolves.toEqual({ draft: existing, alreadyExists: true });
    expect(transaction.projectProgressDraft.create).not.toHaveBeenCalled();
  });

  it('invalidates pending drafts from superseded batches before storing a restored version', async () => {
    const created = { id: 'draft-restored', sourceBatchId: 'batch-restored' };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      projectProgressDraft: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new ProjectProgressDraftService(prisma, mockRequestContext, mockAuthorization);

    await service.storeGeneratedDraft({
      projectId: 'project-1',
      projectName: '研发平台',
      periodStartAt: new Date('2026-07-20T00:00:00.000Z'),
      periodEndAt: new Date('2026-07-26T00:00:00.000Z'),
      sourceBatchId: 'batch-restored',
      sourceVersion: 3,
      replacesBatchIds: ['batch-2', 'batch-original'],
      contentFingerprint: 'restored-fingerprint',
      content: {
        completed: [],
        nextPlans: [],
        blockers: [],
        risks: [],
        hours: { planned: 0, actual: 0, nextPlanned: 0, missingCount: 0 },
        unlinkedRows: [],
      },
    });

    expect(transaction.projectProgressDraft.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        sourceBatchId: { in: ['batch-2', 'batch-original'] },
        status: 'PENDING',
      },
      data: {
        status: 'INVALIDATED',
        invalidatedAt: expect.any(Date),
        invalidationReason: 'SOURCE_VERSION_REPLACED',
      },
    });
  });
});
