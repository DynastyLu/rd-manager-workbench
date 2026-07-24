import { Injectable } from '@nestjs/common';
import { EmployeeProgressPeriod, EmployeeWorkImportStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { buildSearchSnippet, limitSearchCandidates } from '../domain/search-ranking';
import { SearchAdapter, SearchCandidate, SearchType } from '../domain/search.types';

const CANDIDATE_LIMIT = 100;

@Injectable()
export class EmployeesSearchAdapter implements SearchAdapter {
  readonly types = ['EMPLOYEE', 'EMPLOYEE_WORK'] as const satisfies readonly SearchType[];

  constructor(private readonly prisma: PlatformPrismaService) {}

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    const [employees, workItems] = await Promise.all([
      types.includes('EMPLOYEE') ? this.searchEmployees(query) : Promise.resolve([]),
      types.includes('EMPLOYEE_WORK') ? this.searchWorkItems(query) : Promise.resolve([]),
    ]);
    return limitSearchCandidates(query, [...employees, ...workItems], CANDIDATE_LIMIT);
  }

  private async searchEmployees(query: string): Promise<SearchCandidate[]> {
    const contains = { contains: query, mode: 'insensitive' as const };
    const employees = await this.prisma.resourceProfile.findMany({
      where: {
        archivedAt: null,
        OR: [
          { displayName: contains },
          { department: contains },
          { roleTitle: contains },
          { managerName: contains },
          { developmentGoal: contains },
          { notes: contains },
        ],
      },
      select: {
        id: true,
        displayName: true,
        department: true,
        roleTitle: true,
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
        { project: { code: contains } },
        { project: { name: contains } },
        { task: { code: contains } },
        { task: { title: contains } },
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
        employee: { select: { displayName: true, department: true } },
        project: { select: { code: true, name: true } },
        task: { select: { code: true, title: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });
    return items.map((item) => {
      const params = new URLSearchParams({
        periodType: EmployeeProgressPeriod.WEEK,
        periodStart: item.periodStartAt.toISOString().slice(0, 10),
        workItemId: item.id,
      });
      return {
        type: 'EMPLOYEE_WORK' as const,
        id: item.id,
        title: item.title,
        snippet: buildSearchSnippet(query, [
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
}
