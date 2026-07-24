import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
  RiskImpact,
  RiskLevel,
  RiskLikelihood,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { RisksService } from '../../management/application/risks.service';

const CONVERSION_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 30_000,
  timeout: 120_000,
} as const;

@Injectable()
export class EmployeeWorkRiskService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly risks: RisksService,
    private readonly audit: AuditLogService,
  ) {}

  async convert(workItemId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:employee-work-risk:${workItemId}`}))`,
        );
        const workItem = await tx.employeeWorkItem.findFirst({
          where: {
            id: workItemId,
            archivedAt: null,
            employee: { archivedAt: null },
            importBatch: {
              periodType: EmployeeProgressPeriod.WEEK,
              status: EmployeeWorkImportStatus.COMPLETED,
              archivedAt: null,
            },
          },
          select: {
            id: true,
            title: true,
            riskText: true,
            status: true,
            projectId: true,
            taskId: true,
            riskId: true,
            employee: { select: { displayName: true } },
            project: { select: { id: true, archivedAt: true } },
          },
        });
        if (!workItem) {
          throw this.invalid(
            'Employee work item must be a current active confirmed work item',
            HttpStatus.NOT_FOUND,
          );
        }
        if (workItem.riskId) {
          const risk = await tx.risk.findFirst({
            where: { id: workItem.riskId, archivedAt: null },
          });
          if (!risk) {
            throw this.invalid('Linked employee work risk is unavailable', HttpStatus.CONFLICT);
          }
          await this.recordSucceeded(tx, workItemId, risk.id, true);
          return { risk, alreadyExists: true };
        }
        if (!workItem.riskText?.trim()) {
          throw this.invalid('Employee work item risk text must not be empty');
        }
        if (
          workItem.status !== EmployeeWorkStatus.AT_RISK &&
          workItem.status !== EmployeeWorkStatus.BLOCKED
        ) {
          throw this.invalid('Employee work item must have a risk status');
        }
        if (!workItem.projectId || !workItem.project || workItem.project.archivedAt) {
          throw this.invalid('Employee work item must reference an active project');
        }

        const risk = await this.risks.createRiskInTransaction(tx, {
          title: workItem.title,
          description: workItem.riskText.trim(),
          likelihood: RiskLikelihood.MEDIUM,
          impact: RiskImpact.MEDIUM,
          level: RiskLevel.MEDIUM,
          ownerName: workItem.employee.displayName,
          projectId: workItem.projectId,
          taskId: workItem.taskId ?? undefined,
        });
        await tx.employeeWorkItem.update({
          where: { id: workItemId },
          data: { riskId: risk.id },
        });
        await this.recordSucceeded(tx, workItemId, risk.id, false);
        return { risk, alreadyExists: false };
      }, CONVERSION_TRANSACTION_OPTIONS);
    } catch (error) {
      await this.audit
        .record({
          action: 'EMPLOYEE_WORK_RISK_CONVERSION_FAILED',
          entityType: 'employeeWorkItem',
          entityId: workItemId,
          outcome: 'FAILED',
          changedFields: [],
          metadata: {
            workItemId,
            errorCode: error instanceof AppError ? error.code : ErrorCodes.INTERNAL_ERROR,
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private recordSucceeded(
    tx: Prisma.TransactionClient,
    workItemId: string,
    riskId: string,
    alreadyExists: boolean,
  ) {
    return this.audit.record(
      {
        action: 'EMPLOYEE_WORK_RISK_CONVERTED',
        entityType: 'employeeWorkItem',
        entityId: workItemId,
        outcome: 'SUCCEEDED',
        changedFields: alreadyExists ? [] : ['riskId'],
        metadata: {
          workItemId,
          riskId,
          status: alreadyExists ? 'ALREADY_EXISTS' : 'CREATED',
        },
      },
      tx,
    );
  }

  private invalid(
    message: string,
    statusCode: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ): AppError {
    return new AppError({
      code: ErrorCodes.EMPLOYEE_WORK_RISK_CONVERSION_INVALID,
      message,
      statusCode,
    });
  }
}
