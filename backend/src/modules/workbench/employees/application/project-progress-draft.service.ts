import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
  ProgressReportSourceType,
  ProjectProgressDraftStatus,
  RiskImpact,
  RiskLevel,
  RiskLikelihood,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { AuthorizationService } from '../../../../modules/iam/application/authorization.service';
import { PERMISSIONS } from '../../../../modules/iam/domain/permission-catalog';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ActivityService } from '../../activity/application/activity.service';
import { AuditLogService } from '../../governance/application/audit-log.service';

interface DraftSourceLine {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  summaryText?: string | null;
  status: EmployeeWorkStatus;
  riskText?: string | null;
  plannedHours: number | null;
  actualHours: number | null;
}

interface DraftPlanLine {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  planText?: string | null;
  plannedHours: number | null;
}

interface DraftUnlinkedLine {
  id: string;
  rowNumber: number;
  employeeName: string | null;
  title: string;
}

interface DraftContentLine {
  sourceId: string;
  employeeId: string;
  employeeName: string;
  text: string;
}

interface DraftPlanContentLine extends DraftContentLine {
  plannedHours: number | null;
}

export interface ProjectProgressDraftContent {
  completed: DraftContentLine[];
  nextPlans: DraftPlanContentLine[];
  blockers: DraftContentLine[];
  risks: DraftContentLine[];
  hours: {
    planned: number;
    actual: number;
    nextPlanned: number;
    missingCount: number;
  };
  unlinkedRows: Array<{
    sourceId: string;
    rowNumber: number;
    employeeName: string | null;
    title: string;
  }>;
}

export interface GeneratedProjectProgressDraft {
  projectId: string;
  projectName: string;
  periodStartAt: Date;
  periodEndAt: Date;
  sourceBatchId: string;
  sourceVersion: number;
  replacesBatchIds?: string[];
  contentFingerprint: string;
  content: ProjectProgressDraftContent;
}

export interface AdoptProjectProgressDraftInput {
  createRisks?: boolean;
  createTasks?: boolean;
}

function numeric(value: Prisma.Decimal | number | null): number | null {
  return value === null ? null : Number(value);
}

function lineOrder(
  left: { employeeName: string; sourceId: string },
  right: { employeeName: string; sourceId: string },
) {
  return (
    left.employeeName.localeCompare(right.employeeName, 'zh-CN') ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

function contentLine(
  item: DraftSourceLine,
  text: string,
): DraftContentLine {
  return {
    sourceId: item.id,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    text,
  };
}

export function buildProjectProgressDraftContent(input: {
  projectId: string;
  workItems: DraftSourceLine[];
  weekPlans: DraftPlanLine[];
  unlinkedRows: DraftUnlinkedLine[];
}): ProjectProgressDraftContent {
  const completed = input.workItems
    .filter((item) => item.status === EmployeeWorkStatus.COMPLETED)
    .map((item) => contentLine(item, item.summaryText?.trim() || item.title))
    .sort(lineOrder);
  const blockers = input.workItems
    .filter((item) => item.status === EmployeeWorkStatus.BLOCKED)
    .map((item) => contentLine(item, item.riskText?.trim() || item.summaryText?.trim() || item.title))
    .sort(lineOrder);
  const risks = input.workItems
    .filter(
      (item) =>
        item.status === EmployeeWorkStatus.AT_RISK ||
        (Boolean(item.riskText?.trim()) && item.status !== EmployeeWorkStatus.BLOCKED),
    )
    .map((item) => contentLine(item, item.riskText?.trim() || item.summaryText?.trim() || item.title))
    .sort(lineOrder);
  const nextPlans = input.weekPlans
    .map((item) => ({
      sourceId: item.id,
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      text: item.planText?.trim() || item.title,
      plannedHours: item.plannedHours,
    }))
    .sort(lineOrder);
  const sum = (values: Array<number | null>) =>
    Number(
      values
        .reduce<number>((total, value) => total + (value ?? 0), 0)
        .toFixed(2),
    );
  return {
    completed,
    nextPlans,
    blockers,
    risks,
    hours: {
      planned: sum(input.workItems.map((item) => item.plannedHours)),
      actual: sum(input.workItems.map((item) => item.actualHours)),
      nextPlanned: sum(input.weekPlans.map((item) => item.plannedHours)),
      missingCount: input.workItems.filter(
        (item) => item.plannedHours === null || item.actualHours === null,
      ).length,
    },
    unlinkedRows: input.unlinkedRows
      .map((row) => ({
        sourceId: row.id,
        rowNumber: row.rowNumber,
        employeeName: row.employeeName,
        title: row.title,
      }))
      .sort((left, right) => left.rowNumber - right.rowNumber || left.sourceId.localeCompare(right.sourceId)),
  };
}

@Injectable()
export class ProjectProgressDraftService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly authorization: AuthorizationService,
    @Optional() private readonly activities?: ActivityService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  async generateForBatch(sourceBatchId: string) {
    const batch = await this.prisma.employeeWorkImportBatch.findUnique({
      where: { id: sourceBatchId },
    });
    if (!batch) throw this.notFound('Employee work import batch not found');
    if (
      batch.status !== EmployeeWorkImportStatus.COMPLETED ||
      batch.version === null
    ) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_STATE_INVALID,
        message: 'Only a completed employee work import can generate project progress drafts',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    const [workItems, weekPlans, unlinkedRows] = await Promise.all([
      this.prisma.employeeWorkItem.findMany({
        where: { importBatchId: sourceBatchId, projectId: { not: null }, archivedAt: null },
        include: {
          employee: { select: { displayName: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: [{ projectId: 'asc' }, { employeeId: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.employeeWeekPlanItem.findMany({
        where: { importBatchId: sourceBatchId, projectId: { not: null }, archivedAt: null },
        include: {
          employee: { select: { displayName: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: [{ projectId: 'asc' }, { employeeId: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.employeeWorkImportRow.findMany({
        where: {
          batchId: sourceBatchId,
          resolvedProjectId: null,
        },
        include: { resolvedEmployee: { select: { displayName: true } } },
        orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const projectIds = [...new Set(
      [...workItems, ...weekPlans]
        .map((item) => item.projectId)
        .filter((id): id is string => Boolean(id)),
    )].sort();
    const unlinked = unlinkedRows.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      employeeName: row.resolvedEmployee?.displayName ?? null,
      title: this.normalizedRowTitle(row.normalizedValues),
    }));
    const stored: Array<
      Awaited<ReturnType<ProjectProgressDraftService['storeGeneratedDraft']>>
    > = [];
    for (const projectId of projectIds) {
      const projectName =
        workItems.find((item) => item.projectId === projectId)?.project?.name ??
        weekPlans.find((item) => item.projectId === projectId)?.project?.name ??
        projectId;
      const content = buildProjectProgressDraftContent({
        projectId,
        workItems: workItems
          .filter((item) => item.projectId === projectId)
          .map((item) => ({
            id: item.id,
            employeeId: item.employeeId,
            employeeName: item.employee.displayName,
            title: item.title,
            summaryText: item.summaryText,
            status: item.status,
            riskText: item.riskText,
            plannedHours: numeric(item.plannedHours),
            actualHours: numeric(item.actualHours),
          })),
        weekPlans: weekPlans
          .filter((item) => item.projectId === projectId)
          .map((item) => ({
            id: item.id,
            employeeId: item.employeeId,
            employeeName: item.employee.displayName,
            title: item.title,
            planText: item.planText,
            plannedHours: null,
          })),
        unlinkedRows: unlinked,
      });
      const contentFingerprint = this.fingerprint({
        sourceBatchId,
        sourceVersion: batch.version,
        projectId,
        content,
      });
      stored.push(
        await this.storeGeneratedDraft({
          projectId,
          projectName,
          periodStartAt: batch.periodStartAt,
          periodEndAt: batch.periodEndAt,
          sourceBatchId,
          sourceVersion: batch.version,
          replacesBatchIds: [batch.supersedesBatchId, batch.restoredFromBatchId].filter(
            (id): id is string => Boolean(id),
          ),
          contentFingerprint,
          content,
        }),
      );
    }
    return stored;
  }

  storeGeneratedDraft(input: GeneratedProjectProgressDraft) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`project-progress-draft:${input.projectId}:${input.sourceBatchId}`}))`,
      );
      const existing = await tx.projectProgressDraft.findFirst({
        where: {
          projectId: input.projectId,
          sourceBatchId: input.sourceBatchId,
          contentFingerprint: input.contentFingerprint,
        },
      });
      if (existing) return { draft: existing, alreadyExists: true };
      if (input.replacesBatchIds?.length) {
        await tx.projectProgressDraft.updateMany({
          where: {
            projectId: input.projectId,
            sourceBatchId: { in: input.replacesBatchIds },
            status: ProjectProgressDraftStatus.PENDING,
          },
          data: {
            status: ProjectProgressDraftStatus.INVALIDATED,
            invalidatedAt: new Date(),
            invalidationReason: 'SOURCE_VERSION_REPLACED',
          },
        });
      }
      const text = this.renderDraftText(input.projectName, input.periodStartAt, input.periodEndAt, input.content);
      const draft = await tx.projectProgressDraft.create({
        data: {
          projectId: input.projectId,
          sourceBatchId: input.sourceBatchId,
          sourceVersion: input.sourceVersion,
          periodStartAt: input.periodStartAt,
          periodEndAt: input.periodEndAt,
          contentFingerprint: input.contentFingerprint,
          content: input.content as unknown as Prisma.InputJsonObject,
          ...text,
          unlinkedRowCount: input.content.unlinkedRows.length,
        },
      });
      await this.activities?.append(
        {
          actorKind: 'AUTOMATION',
          objectType: 'PROJECT_PROGRESS_DRAFT',
          objectId: draft.id,
          projectId: input.projectId,
          action: 'GENERATED',
          summary: `已按员工周报生成 ${input.projectName} 项目进展草稿`,
          sourcePath: `/employee-work-imports/${encodeURIComponent(input.sourceBatchId)}`,
        },
        tx,
      );
      return { draft, alreadyExists: false };
    });
  }

  list(input: {
    projectId?: string;
    sourceBatchId?: string;
    status?: ProjectProgressDraftStatus;
  }) {
    return this.prisma.projectProgressDraft.findMany({
      where: {
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.sourceBatchId ? { sourceBatchId: input.sourceBatchId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        sourceBatch: {
          select: {
            id: true,
            version: true,
            periodStartAt: true,
            periodEndAt: true,
            restoredFromBatchId: true,
          },
        },
      },
      orderBy: [{ periodStartAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async adopt(id: string, input: AdoptProjectProgressDraftInput = {}) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`project-progress-draft-adopt:${id}`}))`,
      );
      const draft = await tx.projectProgressDraft.findUnique({ where: { id } });
      if (!draft) throw this.notFound('Project progress draft not found');
      if (draft.status === ProjectProgressDraftStatus.ADOPTED && draft.adoptedReportId) {
        return {
          draft,
          report: await tx.progressReport.findUnique({ where: { id: draft.adoptedReportId } }),
          alreadyAdopted: true,
        };
      }
      if (draft.status !== ProjectProgressDraftStatus.PENDING) {
        throw new AppError({
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Project progress draft cannot be adopted from ${draft.status}`,
          statusCode: HttpStatus.CONFLICT,
        });
      }
      await this.assertCanPublish(draft.projectId);
      const content = draft.content as unknown as ProjectProgressDraftContent;
      const report = await tx.progressReport.create({
        data: {
          projectId: draft.projectId,
          reportedAt: draft.periodEndAt,
          summary: draft.summary,
          completionPercent: 0,
          sourceType: ProgressReportSourceType.EMPLOYEE_WEEKLY_DRAFT,
          completedResults: draft.completedResults,
          nextSteps: draft.nextSteps,
          blockers: [draft.blockers, draft.riskSummary].filter(Boolean).join('\n') || null,
          changeSnapshot: {
            draftId: draft.id,
            sourceBatchId: draft.sourceBatchId,
            sourceVersion: draft.sourceVersion,
            contentFingerprint: draft.contentFingerprint,
          },
        },
      });
      if (input.createRisks) {
        for (const risk of content.risks) {
          await tx.risk.create({
            data: {
              projectId: draft.projectId,
              title: risk.text,
              description: `来自 ${risk.employeeName} 的员工周报`,
              likelihood: RiskLikelihood.MEDIUM,
              impact: RiskImpact.MEDIUM,
              level: RiskLevel.MEDIUM,
              ownerName: risk.employeeName,
            },
          });
        }
      }
      if (input.createTasks) {
        for (const plan of content.nextPlans) {
          await tx.workTask.create({
            data: {
              projectId: draft.projectId,
              title: plan.text,
              assigneeName: plan.employeeName,
              sourceType: 'PROJECT_PROGRESS_DRAFT',
              sourceId: draft.id,
            },
          });
        }
      }
      const adopted = await tx.projectProgressDraft.update({
        where: { id },
        data: {
          status: ProjectProgressDraftStatus.ADOPTED,
          adoptedReportId: report.id,
          adoptedAt: new Date(),
        },
      });
      const principal = this.requestContext.requirePrincipal();
      await this.activities?.append(
        {
          actorKind: 'HUMAN',
          actorId: principal.userId,
          actorName: principal.username,
          objectType: 'PROJECT_PROGRESS_DRAFT',
          objectId: id,
          projectId: draft.projectId,
          action: 'ADOPTED',
          summary: '已采纳员工周报项目进展草稿',
          sourcePath: `/projects/${encodeURIComponent(draft.projectId)}?tab=progress`,
          metadata: {
            reportId: report.id,
            createRisks: Boolean(input.createRisks),
            createTasks: Boolean(input.createTasks),
          },
        },
        tx,
      );
      await this.audit?.record(
        {
          action: 'PROJECT_PROGRESS_DRAFT_ADOPTED',
          entityType: 'projectProgressDraft',
          entityId: id,
          outcome: 'SUCCEEDED',
          changedFields: ['status', 'adoptedReportId', 'adoptedAt'],
          metadata: {
            reportId: report.id,
            sourceBatchId: draft.sourceBatchId,
            sourceVersion: draft.sourceVersion,
          },
        },
        tx,
      );
      return { draft: adopted, report, alreadyAdopted: false };
    });
  }

  async ignore(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.projectProgressDraft.findUnique({ where: { id } });
      if (!draft) throw this.notFound('Project progress draft not found');
      await this.assertCanPublish(draft.projectId);
      if (draft.status === ProjectProgressDraftStatus.IGNORED) return draft;
      if (draft.status !== ProjectProgressDraftStatus.PENDING) {
        throw new AppError({
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Project progress draft cannot be ignored from ${draft.status}`,
          statusCode: HttpStatus.CONFLICT,
        });
      }
      const updated = await tx.projectProgressDraft.update({
        where: { id },
        data: { status: ProjectProgressDraftStatus.IGNORED, ignoredAt: new Date() },
      });
      const principal = this.requestContext.requirePrincipal();
      await this.activities?.append(
        {
          actorKind: 'HUMAN',
          actorId: principal.userId,
          actorName: principal.username,
          objectType: 'PROJECT_PROGRESS_DRAFT',
          objectId: id,
          projectId: draft.projectId,
          action: 'IGNORED',
          summary: '已忽略员工周报项目进展草稿',
          sourcePath: `/projects/${encodeURIComponent(draft.projectId)}?tab=progress`,
        },
        tx,
      );
      return updated;
    });
  }

  private renderDraftText(
    projectName: string,
    periodStartAt: Date,
    periodEndAt: Date,
    content: ProjectProgressDraftContent,
  ) {
    const lines = (items: DraftContentLine[]) =>
      items.map((item) => `${item.employeeName}：${item.text}`).join('\n') || null;
    return {
      summary: `${projectName} ${this.dateOnly(periodStartAt)} 至 ${this.dateOnly(periodEndAt)} 周进展`,
      completedResults: lines(content.completed),
      nextSteps: lines(content.nextPlans),
      blockers: lines(content.blockers),
      riskSummary: lines(content.risks),
      hoursSummary: `本周计划 ${content.hours.planned}h，实际 ${content.hours.actual}h；下周计划 ${content.hours.nextPlanned}h`,
    };
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private normalizedRowTitle(value: Prisma.JsonValue): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const title = (value as Prisma.JsonObject).title;
      if (typeof title === 'string' && title.trim()) return title.trim();
    }
    return '未关联周报行';
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private async assertCanPublish(projectId: string) {
    const principal = this.requestContext.requirePrincipal();
    if (principal.roleCodes.includes('SUPER_ADMIN')) return;
    if (this.authorization.hasPermission(principal, PERMISSIONS.PROJECT_PROGRESS_PUBLISH)) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerUserId: principal.userId, archivedAt: null },
      select: { id: true },
    });
    if (project) return;
    throw new AppError({
      code: ErrorCodes.PERMISSION_DENIED,
      message: 'Only the project owner or a progress publisher can perform this action',
      statusCode: HttpStatus.FORBIDDEN,
    });
  }

  private notFound(message: string) {
    return new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
