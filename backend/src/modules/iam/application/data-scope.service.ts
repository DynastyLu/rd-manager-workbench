import { Injectable } from '@nestjs/common';
import { DataTableSource, type Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import type { AuthenticatedPrincipal } from '../domain/principal';
import type { PermissionCode } from '../domain/permission-catalog';

@Injectable()
export class DataScopeService {
  constructor(private readonly authorization: AuthorizationService) {}

  projects(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.ProjectWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.ProjectWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ ownerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push({ members: { some: { userId: principal.userId } } });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ id: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  tasks(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.WorkTaskWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.WorkTaskWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ ownerUserId: principal.userId }, { assigneeUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { participants: { some: { userId: principal.userId } } },
        { project: { members: { some: { userId: principal.userId } } } },
      );
    }
    if (scope.kinds.includes('DEPARTMENT') && scope.departmentNames && scope.departmentNames.length > 0) {
      predicates.push(
        { owner: { resourceProfile: { department: { in: scope.departmentNames } } } },
        { assignee: { resourceProfile: { department: { in: scope.departmentNames } } } },
        { participants: { some: { user: { resourceProfile: { department: { in: scope.departmentNames } } } } } },
      );
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  employees(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.ResourceProfileWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.ResourceProfileWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ id: principal.employeeId });
    }
    if (scope.kinds.includes('DEPARTMENT') && scope.departmentNames && scope.departmentNames.length > 0) {
      predicates.push({ department: { in: scope.departmentNames } });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({
        user: {
          projectMemberships: {
            some: {
              projectId: { in: scope.projectIds },
            },
          },
        },
      });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  employeeWork(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.EmployeeWorkItemWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.EmployeeWorkItemWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ employeeId: principal.employeeId });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  employeeWeekPlanItems(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.EmployeeWeekPlanItemWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.EmployeeWeekPlanItemWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ employeeId: principal.employeeId });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  meetings(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.MeetingWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.MeetingWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ organizerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { participants: { some: { userId: principal.userId } } },
        { project: { members: { some: { userId: principal.userId } } } },
      );
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  documents(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.ContentDocumentWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.ContentDocumentWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ ownerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { userShares: { some: { userId: principal.userId } } },
        { roleShares: { some: { role: { code: { in: [...principal.roleCodes] } } } } },
        { project: { members: { some: { userId: principal.userId } } } },
        { visibility: 'ORGANIZATION' },
      );
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  knowledge(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.DocumentChunkWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const documentPredicates: Prisma.ContentDocumentWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      documentPredicates.push({ ownerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      documentPredicates.push(
        { userShares: { some: { userId: principal.userId } } },
        { roleShares: { some: { role: { code: { in: [...principal.roleCodes] } } } } },
        { space: { members: { some: { userId: principal.userId } } } },
        { visibility: 'ORGANIZATION' },
      );
    }

    return documentPredicates.length > 0
      ? { document: { OR: documentPredicates } }
      : { id: { in: [] } };
  }

  knowledgeSpaces(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.KnowledgeSpaceWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.KnowledgeSpaceWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ ownerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { members: { some: { userId: principal.userId } } },
        { visibility: 'ORGANIZATION' },
      );
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  decisions(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.DecisionWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.DecisionWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ createdByUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { project: { members: { some: { userId: principal.userId } } } },
        { meeting: { participants: { some: { userId: principal.userId } } } },
        { meeting: { organizerUserId: principal.userId } },
      );
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  issues(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.IssueWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.IssueWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ createdByUserId: principal.userId }, { ownerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { project: { members: { some: { userId: principal.userId } } } },
        { task: { assigneeUserId: principal.userId } },
        { task: { participants: { some: { userId: principal.userId } } } },
      );
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  risks(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.RiskWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.RiskWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({ createdByUserId: principal.userId }, { ownerUserId: principal.userId });
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push({ project: { members: { some: { userId: principal.userId } } } });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  intelligenceItems(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.IntelligenceItemWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.IntelligenceItemWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { createdByUserId: principal.userId },
        { ownerUserId: principal.userId },
      );
    }
    if (scope.kinds.includes('INVOLVED')) {
      predicates.push({
        projects: {
          some: {
            project: {
              OR: [
                { ownerUserId: principal.userId },
                { members: { some: { userId: principal.userId } } },
              ],
            },
          },
        },
      });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projects: { some: { projectId: { in: scope.projectIds } } } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  partners(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.PartnerWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.PartnerWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push({
        projects: { some: { project: this.projects(principal, permissionCode) } },
      });
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projects: { some: { projectId: { in: scope.projectIds } } } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  communications(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.CommunicationRecordWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.CommunicationRecordWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { project: this.projects(principal, permissionCode) },
        { partner: this.partners(principal, permissionCode) },
      );
    }
    if (scope.kinds.includes('PROJECT') && scope.projectIds && scope.projectIds.length > 0) {
      predicates.push({ projectId: { in: scope.projectIds } });
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  baseTables(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.DataTableWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.DataTableWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { source: { not: DataTableSource.CUSTOM } },
        { ownerUserId: principal.userId },
        { visibility: 'ORGANIZATION' },
      );
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }

  baseRecords(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.DataRecordWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const tablePredicates: Prisma.DataTableWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      tablePredicates.push(
        { source: { not: DataTableSource.CUSTOM } },
        { ownerUserId: principal.userId },
        { visibility: 'ORGANIZATION' },
      );
    }

    return tablePredicates.length > 0
      ? { table: { OR: tablePredicates } }
      : { id: { in: [] } };
  }

  activities(principal: AuthenticatedPrincipal, permissionCode: PermissionCode): Prisma.ActivityRecordWhereInput {
    const scope = this.authorization.resolveScope(principal, permissionCode);
    if (scope.kinds.includes('ALL')) {
      return {};
    }

    const predicates: Prisma.ActivityRecordWhereInput[] = [];
    if (scope.kinds.includes('SELF') || scope.kinds.includes('INVOLVED')) {
      predicates.push(
        { actorId: principal.userId },
        { employeeId: principal.employeeId },
        { project: this.projects(principal, permissionCode) },
      );
    }

    return predicates.length > 0 ? { OR: predicates } : { id: { in: [] } };
  }
}
