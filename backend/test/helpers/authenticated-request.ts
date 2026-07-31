import { INestApplication } from '@nestjs/common';
import { DataScope, Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthService } from '../../src/modules/iam/application/auth.service';
import { PasswordService } from '../../src/modules/iam/application/password.service';

const FIXTURE_PASSWORD = 'Integration123';

export interface AuthenticatedFixturePermission {
  code: string;
  dataScope: DataScope;
  scopeConfig?: Record<string, unknown>;
}

export async function authenticatedRequest(
  app: INestApplication,
  prisma: PrismaClient,
  roleCode: string,
  permissions: AuthenticatedFixturePermission[] = [],
) {
  const fixtureId = randomUUID();
  const username = `integration-${fixtureId}`.toLowerCase();
  const employeeNo = `IT-${fixtureId}`.toUpperCase();
  const employee = await prisma.resourceProfile.create({
    data: {
      displayName: `Integration ${fixtureId}`,
      department: 'Integration Tests',
      employmentStatus: 'ACTIVE',
    },
  });
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    create: {
      code: roleCode,
      name: roleCode,
      isEnabled: true,
    },
    update: { isEnabled: true },
  });
  const scopeConfigValue = (value: Record<string, unknown> | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
    if (!value) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  };
  if (permissions.length > 0) {
    for (const grant of permissions) {
      const permission = await prisma.permission.upsert({
        where: { code: grant.code },
        create: {
          code: grant.code,
          module: 'integration-test',
          resource: 'integration-test',
          action: 'integration-test',
          description: 'Integration test permission',
        },
        update: {},
      });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
          dataScope: grant.dataScope,
          scopeConfig: scopeConfigValue(grant.scopeConfig),
        },
        update: {
          dataScope: grant.dataScope,
          scopeConfig: scopeConfigValue(grant.scopeConfig),
        },
      });
    }
  }
  const passwordHash = await app.get(PasswordService).hash(FIXTURE_PASSWORD);
  const user = await prisma.user.create({
    data: {
      username,
      employeeNo,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      resourceProfileId: employee.id,
      userRoles: {
        create: {
          roleId: role.id,
        },
      },
    },
  });
  const authentication = await app.get(AuthService).login(
    {
      identifier: username,
      password: FIXTURE_PASSWORD,
      rememberMe: false,
    },
    {
      deviceName: 'integration-test',
      userAgent: 'supertest',
      ipAddress: '127.0.0.1',
    },
  );
  const agent = request
    .agent(app.getHttpServer())
    .set('Authorization', `Bearer ${authentication.accessToken}`);

  return {
    user,
    employee,
    role,
    agent,
  };
}
