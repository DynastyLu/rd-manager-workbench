import { Injectable } from '@nestjs/common';
import { EmployeeProgressPeriod, EmployeeWorkImportStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { buildSearchSnippet, limitSearchCandidates } from '../domain/search-ranking';
import { SearchAdapter, SearchCandidate, SearchType } from '../domain/search.types';

const CANDIDATE_LIMIT = 100;

@Injectable()
export class EmployeesSearchAdapter implements SearchAdapter {
  readonly types = ['EMPLOYEE', 'EMPLOYEE_WORK'] as const satisfies readonly SearchType[];

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    const [employees, workItems, planItems] = await Promise.all([
      types.includes('EMPLOYEE') ? this.searchEmployees(query) : Promise.resolve([]),
      types.includes('EMPLOYEE_WORK') ? this.searchWorkItems(query) : Promise.resolve([]),
      types.includes('EMPLOYEE_WORK') ? this.searchPlanItems(query) : Promise.resolve([]),
    ]);
    return limitSearchCandidates(query, [...employees, ...workItems, ...planItems], CANDIDATE_LIMIT);
  }

  private async searchEmployees(query: string): Promise<SearchCandidate[]> {
    const contains = { contains: query, mode: 'insensitive' as const };
    const employees = await this.prisma.resourceProfile.findMany({
      where: {
        AND: [
          {
            archivedAt: null,
            OR: [
              { displayName: contains },
              { department: contains },
              { roleTitle: contains },
              { workDirection: contains },
              { managerName: contains },
              { developmentGoal: contains },
              { notes: contains },
            ],
          },
          this.dataScope.employees(this.principal(), 'employee.read'),
        ],
      },
      select: {
        id: true,
        displayName: true,
        department: true,
        roleTitle: true,
        workDirection: true,
        managerName: true,
        developmentGoal: true,
        notes: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });
    return employees.map((employee) => ({
      type: 'EMPLOYEE' as const,
      id: employee.id,
      title: employee.displayName,
      snippet: buildSearchSnippet(query, [
        employee.department,
        employee.roleTitle,
        employee.workDirection,
        employee.managerName,
        employee.developmentGoal,
        employee.notes,
      ]),
      path: `/employees/${encodeURIComponent(employee.id)}`,
      updatedAt: employee.updatedAt,
      actions: ['OPEN', 'COPY_LINK'] as const,
    }));
  }

  private async searchWorkItems(query: string): Promise<SearchCandidate[]> {
    const contains = { contains: query, mode: 'insensitive' as const };
    const where: Prisma.EmployeeWorkItemWhereInput = {
      AND: [
        {
          archivedAt: null,
          employee: { archivedAt: null },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
          OR: [
            { title: contains },
            { planText: contains },
            { summaryText: contains },
            { nextPlanText: contains },
            { riskText: contains },
            { note: contains },
            { employee: { displayName: contains } },
            { employee: { department: contains } },
            { employee: { workDirection: contains } },
            { project: { code: contains } },
            { project: { name: contains } },
            { task: { code: contains } },
            { task: { title: contains } },
          ],
        },
        this.dataScope.employeeWork(this.principal(), 'employee.read'),
      ],
    };
    const items = await this.prisma.employeeWorkItem.findMany({
      where,
      select: {
        id: true,
        title: true,
        planText: true,
        summaryText: true,
        nextPlanText: true,
        riskText: true,
        note: true,
        periodStartAt: true,
        employeeId: true,
        updatedAt: true,
        employee: { select: { displayName: true, department: true, workDirection: true } },
        project: { select: { id: true, code: true, name: true } },
        task: { select: { code: true, title: true } },
        sourceRow: {
          select: { sourceSheetName: true, sourceSection: true, sourceRowNumber: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });
    return items.map((item) => {
      const params = new URLSearchParams({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: item.periodStartAt.toISOString().slice(0, 10),
        sourceSection: 'CURRENT_WORK',
        workItemId: item.id,
      });
      if (item.sourceRow.sourceSheetName) {
        params.set('sourceSheet', item.sourceRow.sourceSheetName);
      }
      if (item.sourceRow.sourceRowNumber !== null) {
        params.set('sourceRow', String(item.sourceRow.sourceRowNumber));
      }
      return {
        type: 'EMPLOYEE_WORK' as const,
        id: item.id,
        title: `当前工作｜${item.title}`,
        snippet: buildSearchSnippet(query, [
          item.employee.displayName,
          item.employee.workDirection,
          item.project?.name,
          item.periodStartAt.toISOString().slice(0, 10),
          item.sourceRow.sourceSheetName,
          item.sourceRow.sourceRowNumber === null ? null : `第 ${item.sourceRow.sourceRowNumber} 行`,
          item.planText,
          item.summaryText,
          item.nextPlanText,
          item.riskText,
          item.note,
          item.employee.displayName,
          item.employee.department,
          item.project?.code,
          item.project?.name,
          item.task?.code,
          item.task?.title,
        ]),
        path: `/employees/${encodeURIComponent(item.employeeId)}?${params.toString()}`,
        updatedAt: item.updatedAt,
        actions: ['OPEN', 'COPY_LINK'] as const,
      };
    });
  }

  private async searchPlanItems(query: string): Promise<SearchCandidate[]> {
    const contains = { contains: query, mode: 'insensitive' as const };
    const where: Prisma.EmployeeWeekPlanItemWhereInput = {
      AND: [
        {
          archivedAt: null,
          employee: { archivedAt: null },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
          OR: [
            { title: contains },
            { deliverableText: contains },
            { collaborationText: contains },
            { planText: contains },
            { note: contains },
            { employee: { displayName: contains } },
            { employee: { department: contains } },
            { employee: { workDirection: contains } },
            { project: { code: contains } },
            { project: { name: contains } },
            { task: { code: contains } },
            { task: { title: contains } },
          ],
        },
        { employee: this.dataScope.employees(this.principal(), 'employee.read') },
      ],
    };
    const items = await this.prisma.employeeWeekPlanItem.findMany({
      where,
      select: {
        id: true,
        title: true,
        deliverableText: true,
        collaborationText: true,
        planText: true,
        note: true,
        periodStartAt: true,
        periodEndAt: true,
        employeeId: true,
        updatedAt: true,
        employee: { select: { displayName: true, department: true, workDirection: true } },
        project: { select: { id: true, code: true, name: true } },
        task: { select: { code: true, title: true } },
        sourceRow: {
          select: { sourceSheetName: true, sourceSection: true, sourceRowNumber: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });
    return items.map((item) => {
      const params = new URLSearchParams({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: item.periodStartAt.toISOString().slice(0, 10),
        sourceSection: 'NEXT_WEEK_PLAN',
        planItemId: item.id,
      });
      if (item.sourceRow.sourceSheetName) {
        params.set('sourceSheet', item.sourceRow.sourceSheetName);
      }
      if (item.sourceRow.sourceRowNumber !== null) {
        params.set('sourceRow', String(item.sourceRow.sourceRowNumber));
      }
      return {
        type: 'EMPLOYEE_WORK' as const,
        id: item.id,
        title: `未来计划｜${item.title}`,
        snippet: buildSearchSnippet(query, [
          item.employee.displayName,
          item.employee.workDirection,
          item.project?.name,
          `${item.periodStartAt.toISOString().slice(0, 10)} 至 ${item.periodEndAt
            .toISOString()
            .slice(0, 10)}`,
          item.sourceRow.sourceSheetName,
          item.sourceRow.sourceRowNumber === null ? null : `第 ${item.sourceRow.sourceRowNumber} 行`,
          item.deliverableText,
          item.collaborationText,
          item.planText,
          item.note,
          item.employee.department,
          item.project?.code,
          item.task?.code,
          item.task?.title,
        ]),
        path: `/employees/${encodeURIComponent(item.employeeId)}?${params.toString()}`,
        updatedAt: item.updatedAt,
        actions: ['OPEN', 'COPY_LINK'] as const,
      };
    });
  }
}
