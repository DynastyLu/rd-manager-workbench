import { AuthorizationService } from '../../../../src/modules/iam/application/authorization.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import type {
  AuthenticatedPrincipal,
  PrincipalDataScope,
  PrincipalPermission,
} from '../../../../src/modules/iam/domain/principal';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';

describe('DataScopeService', () => {
  const service = new DataScopeService(new AuthorizationService());

  it('resolves project scope from the permission for the current operation', () => {
    const employee = principal({
      permissions: [
        grant(PERMISSIONS.PROJECT_READ, 'ALL'),
        grant(PERMISSIONS.PROJECT_UPDATE, 'SELF'),
        grant(PERMISSIONS.PROJECT_DELETE, 'SELF'),
      ],
    });

    expect(service.projects(employee, PERMISSIONS.PROJECT_READ)).toEqual({});
    expect(service.projects(employee, PERMISSIONS.PROJECT_UPDATE)).toEqual({
      OR: [{ ownerUserId: employee.userId }],
    });
    expect(service.projects(employee, PERMISSIONS.PROJECT_DELETE)).toEqual({
      OR: [{ ownerUserId: employee.userId }],
    });
  });

  it('resolves task scope from the permission for the current operation', () => {
    const employee = principal({
      permissions: [
        grant(PERMISSIONS.TASK_READ, 'ALL'),
        grant(PERMISSIONS.TASK_UPDATE, 'SELF'),
        grant(PERMISSIONS.TASK_DELETE, 'SELF'),
      ],
    });

    expect(service.tasks(employee, PERMISSIONS.TASK_READ)).toEqual({});
    expect(service.tasks(employee, PERMISSIONS.TASK_UPDATE)).toEqual({
      OR: [
        { ownerUserId: employee.userId },
        { assigneeUserId: employee.userId },
      ],
    });
    expect(service.tasks(employee, PERMISSIONS.TASK_DELETE)).toEqual({
      OR: [
        { ownerUserId: employee.userId },
        { assigneeUserId: employee.userId },
      ],
    });
  });

  it('returns unrestricted project predicates only for SUPER_ADMIN', () => {
    expect(service.projects(principal({ roleCodes: ['SUPER_ADMIN'] }), PERMISSIONS.PROJECT_READ)).toEqual({});
  });

  it('limits INVOLVED projects to projects owned by or explicitly shared with the user', () => {
    const employee = principal({
      permissions: [grant('project.read', 'INVOLVED')],
    });

    expect(service.projects(employee, PERMISSIONS.PROJECT_READ)).toEqual({
      OR: [{ ownerUserId: employee.userId }, { members: { some: { userId: employee.userId } } }],
    });
  });

  it('unions configured department and project employee scopes without widening to all data', () => {
    const employee = principal({
      permissions: [
        grant('employee.read', 'SELF'),
        grant('employee.read', 'DEPARTMENT', {
          departmentNames: ['研发部', '产品部', '研发部'],
        }),
        grant('employee.read', 'PROJECT', {
          projectIds: ['project-b', 'project-a', 'project-b'],
        }),
      ],
    });

    expect(service.employees(employee, PERMISSIONS.EMPLOYEE_READ)).toEqual({
      OR: [
        { id: employee.employeeId },
        { department: { in: ['产品部', '研发部'] } },
        {
          user: {
            projectMemberships: {
              some: {
                projectId: { in: ['project-a', 'project-b'] },
              },
            },
          },
        },
      ],
    });
  });

  it('limits involved tasks to responsibility, execution, participation, or project membership', () => {
    const employee = principal({
      permissions: [grant('task.read', 'INVOLVED')],
    });

    expect(service.tasks(employee, PERMISSIONS.TASK_READ)).toEqual({
      OR: [
        { ownerUserId: employee.userId },
        { assigneeUserId: employee.userId },
        { participants: { some: { userId: employee.userId } } },
        { project: { members: { some: { userId: employee.userId } } } },
      ],
    });
  });

  it('limits personal work to the bound employee and explicitly authorized projects', () => {
    const employee = principal({
      permissions: [
        grant('employee.read', 'SELF'),
        grant('employee.read', 'PROJECT', { projectIds: ['project-a'] }),
      ],
    });

    expect(service.employeeWork(employee, PERMISSIONS.EMPLOYEE_READ)).toEqual({
      OR: [{ employeeId: employee.employeeId }, { projectId: { in: ['project-a'] } }],
    });
  });

  it('treats INVOLVED employee work and week plans as the bound employee without widening scope', () => {
    const employee = principal({
      permissions: [grant(PERMISSIONS.EMPLOYEE_READ, 'INVOLVED')],
    });

    expect(service.employeeWork(employee, PERMISSIONS.EMPLOYEE_READ)).toEqual({
      OR: [{ employeeId: employee.employeeId }],
    });
    expect(service.employeeWeekPlanItems(employee, PERMISSIONS.EMPLOYEE_READ)).toEqual({
      OR: [{ employeeId: employee.employeeId }],
    });
  });

  it('limits meetings to the organizer, participants, or accessible projects', () => {
    const employee = principal({
      permissions: [grant('meeting.read', 'INVOLVED')],
    });

    expect(service.meetings(employee, PERMISSIONS.MEETING_READ)).toEqual({
      OR: [
        { organizerUserId: employee.userId },
        { participants: { some: { userId: employee.userId } } },
        { project: { members: { some: { userId: employee.userId } } } },
      ],
    });
  });

  it('includes direct user shares, role shares, and accessible projects in document scope', () => {
    const employee = principal({
      roleCodes: ['EMPLOYEE', 'REVIEWER'],
      permissions: [grant('document.read', 'INVOLVED')],
    });

    expect(service.documents(employee, PERMISSIONS.DOCUMENT_READ)).toEqual({
      OR: [
        { ownerUserId: employee.userId },
        { userShares: { some: { userId: employee.userId } } },
        { roleShares: { some: { role: { code: { in: ['EMPLOYEE', 'REVIEWER'] } } } } },
        { project: { members: { some: { userId: employee.userId } } } },
        { visibility: 'ORGANIZATION' },
      ],
    });
  });

  it('keeps INVOLVED document write scope owner-only instead of treating read shares as editors', () => {
    const employee = principal({
      roleCodes: ['EMPLOYEE', 'REVIEWER'],
      permissions: [
        grant(PERMISSIONS.DOCUMENT_UPDATE, 'INVOLVED'),
        grant(PERMISSIONS.DOCUMENT_DELETE, 'INVOLVED'),
      ],
    });

    expect(service.documents(employee, PERMISSIONS.DOCUMENT_UPDATE)).toEqual({
      OR: [{ ownerUserId: employee.userId }],
    });
    expect(service.documents(employee, PERMISSIONS.DOCUMENT_DELETE)).toEqual({
      OR: [{ ownerUserId: employee.userId }],
    });
  });

  it('applies the document predicate at the chunk query instead of filtering ranked results later', () => {
    const employee = principal({
      permissions: [grant('document.read', 'SELF')],
    });

    expect(service.knowledge(employee, PERMISSIONS.DOCUMENT_READ)).toEqual({
      document: {
        OR: [{ ownerUserId: employee.userId }],
      },
    });
  });

  it.each([
    [
      'projects',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.projects(user, PERMISSIONS.PROJECT_READ),
    ],
    ['tasks', (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.tasks(user, PERMISSIONS.TASK_READ)],
    [
      'employees',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.employees(user, PERMISSIONS.EMPLOYEE_READ),
    ],
    [
      'employee work',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.employeeWork(user, PERMISSIONS.EMPLOYEE_READ),
    ],
    [
      'meetings',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.meetings(user, PERMISSIONS.MEETING_READ),
    ],
    [
      'documents',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.documents(user, PERMISSIONS.DOCUMENT_READ),
    ],
    [
      'knowledge',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.knowledge(user, PERMISSIONS.DOCUMENT_READ),
    ],
  ])('returns an explicit deny-all predicate for %s without a relevant grant', (_name, build) => {
    expect(build(service, principal())).toEqual({ id: { in: [] } });
  });
});

function grant(
  code: string,
  dataScope: PrincipalDataScope,
  scopeConfig: Record<string, unknown> | null = null,
): PrincipalPermission {
  return { code, dataScope, scopeConfig };
}

function principal(overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal {
  return {
    userId: 'user-1',
    employeeId: 'employee-1',
    username: 'employee',
    sessionId: 'session-1',
    mustChangePassword: false,
    roleCodes: ['EMPLOYEE'],
    permissions: [],
    permissionVersion: 1,
    ...overrides,
  };
}
