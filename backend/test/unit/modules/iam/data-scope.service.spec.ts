import { AuthorizationService } from '../../../../src/modules/iam/application/authorization.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import type {
  AuthenticatedPrincipal,
  PrincipalDataScope,
  PrincipalPermission,
} from '../../../../src/modules/iam/domain/principal';

describe('DataScopeService', () => {
  const service = new DataScopeService(new AuthorizationService());

  it('returns unrestricted project predicates only for SUPER_ADMIN', () => {
    expect(service.projects(principal({ roleCodes: ['SUPER_ADMIN'] }))).toEqual({});
  });

  it('limits INVOLVED projects to projects owned by or explicitly shared with the user', () => {
    const employee = principal({
      permissions: [grant('project.read', 'INVOLVED')],
    });

    expect(service.projects(employee)).toEqual({
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

    expect(service.employees(employee)).toEqual({
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

    expect(service.tasks(employee)).toEqual({
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

    expect(service.employeeWork(employee)).toEqual({
      OR: [{ employeeId: employee.employeeId }, { projectId: { in: ['project-a'] } }],
    });
  });

  it('limits meetings to the organizer, participants, or accessible projects', () => {
    const employee = principal({
      permissions: [grant('meeting.read', 'INVOLVED')],
    });

    expect(service.meetings(employee)).toEqual({
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

    expect(service.documents(employee)).toEqual({
      OR: [
        { ownerUserId: employee.userId },
        { userShares: { some: { userId: employee.userId } } },
        { roleShares: { some: { role: { code: { in: ['EMPLOYEE', 'REVIEWER'] } } } } },
        { project: { members: { some: { userId: employee.userId } } } },
        { visibility: 'ORGANIZATION' },
      ],
    });
  });

  it('applies the document predicate at the chunk query instead of filtering ranked results later', () => {
    const employee = principal({
      permissions: [grant('document.read', 'SELF')],
    });

    expect(service.knowledge(employee)).toEqual({
      document: {
        OR: [{ ownerUserId: employee.userId }],
      },
    });
  });

  it.each([
    [
      'projects',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.projects(user),
    ],
    ['tasks', (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.tasks(user)],
    [
      'employees',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.employees(user),
    ],
    [
      'employee work',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.employeeWork(user),
    ],
    [
      'meetings',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.meetings(user),
    ],
    [
      'documents',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.documents(user),
    ],
    [
      'knowledge',
      (subject: DataScopeService, user: AuthenticatedPrincipal) => subject.knowledge(user),
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
