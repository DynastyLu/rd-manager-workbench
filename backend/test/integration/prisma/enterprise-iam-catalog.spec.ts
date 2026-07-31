import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function schemaBlock(schema: string, kind: 'enum' | 'model', name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));

  if (!match) {
    throw new Error(`Missing ${name} ${kind}`);
  }

  return match[1];
}

describe('enterprise IAM Prisma catalog', () => {
  const prisma = new PrismaClient();
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');
  const migrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260730020000_enterprise_iam/migration.sql',
  );

  afterAll(async () => prisma.$disconnect());

  it('defines the IAM enums, models, and one-to-one employee identity link', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schemaBlock(schema, 'enum', 'UserStatus')).toContain('@@schema("app")');
    expect(schemaBlock(schema, 'enum', 'DataScope')).toContain('@@schema("app")');

    for (const modelName of [
      'User',
      'Role',
      'Permission',
      'UserRole',
      'RolePermission',
      'AuthSession',
      'LoginAudit',
    ]) {
      expect(schemaBlock(schema, 'model', modelName)).toContain('@@schema("app")');
    }

    const user = schemaBlock(schema, 'model', 'User');
    const resourceProfile = schemaBlock(schema, 'model', 'ResourceProfile');
    const authSession = schemaBlock(schema, 'model', 'AuthSession');

    expect(user).toMatch(/resourceProfileId\s+String\s+@unique\s+@map\("resource_profile_id"\)/);
    expect(user).toMatch(
      /resourceProfile\s+ResourceProfile\s+@relation\(fields: \[resourceProfileId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(user).toContain('assignedUserRoles');
    expect(resourceProfile).toMatch(/\buser\s+User\?/);
    expect(authSession).toMatch(/refreshTokenHash\s+String\s+@unique/);
    expect(authSession).toMatch(/rotatedToSessionId\s+String\?\s+@unique/);
    expect(authSession).toContain('@@index([userId, expiresAt])');
    expect(authSession).toContain('@@index([tokenFamilyId])');
    expect(authSession).toContain('@@index([revokedAt])');
  });

  it('installs the IAM tables, enum values, and unique indexes in PostgreSQL', async () => {
    const [tables, enumValues, uniqueIndexes] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
      `,
      prisma.$queryRaw<Array<{ type_name: string; enum_label: string }>>`
        SELECT type.typname AS type_name, value.enumlabel AS enum_label
        FROM pg_type type
        JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        JOIN pg_enum value ON value.enumtypid = type.oid
        WHERE namespace.nspname = 'app'
          AND type.typname IN ('UserStatus', 'DataScope')
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      `,
    ]);

    const tableNames = tables.map(({ table_name }) => table_name);
    const enumCatalog = enumValues.map(({ type_name, enum_label }) => `${type_name}.${enum_label}`);
    const uniqueConstraints = uniqueIndexes.map(({ indexname }) => indexname);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'users',
        'roles',
        'permissions',
        'user_roles',
        'role_permissions',
        'auth_sessions',
        'login_audits',
      ]),
    );
    expect(enumCatalog).toEqual(
      expect.arrayContaining([
        'UserStatus.PENDING',
        'UserStatus.ACTIVE',
        'UserStatus.DISABLED',
        'UserStatus.LOCKED',
        'DataScope.SELF',
        'DataScope.INVOLVED',
        'DataScope.DEPARTMENT',
        'DataScope.PROJECT',
        'DataScope.ALL',
      ]),
    );
    expect(uniqueConstraints).toEqual(
      expect.arrayContaining([
        'users_username_key',
        'users_employee_no_key',
        'users_resource_profile_id_key',
        'roles_code_key',
        'permissions_code_key',
        'auth_sessions_refresh_token_hash_key',
        'auth_sessions_rotated_to_session_id_key',
      ]),
    );
  });

  it('installs restrictive principals, cascading joins, and nullable audit links', async () => {
    const foreignKeys = await prisma.$queryRaw<
      Array<{ constraint_name: string; delete_rule: string }>
    >`
      SELECT constraint_name, delete_rule
      FROM information_schema.referential_constraints
      WHERE constraint_schema = 'app'
        AND constraint_name IN (
          'users_resource_profile_id_fkey',
          'user_roles_user_id_fkey',
          'user_roles_role_id_fkey',
          'user_roles_assigned_by_user_id_fkey',
          'role_permissions_role_id_fkey',
          'role_permissions_permission_id_fkey',
          'auth_sessions_user_id_fkey',
          'auth_sessions_rotated_to_session_id_fkey',
          'login_audits_user_id_fkey'
        )
    `;

    expect(
      Object.fromEntries(
        foreignKeys.map(({ constraint_name, delete_rule }) => [constraint_name, delete_rule]),
      ),
    ).toEqual({
      auth_sessions_rotated_to_session_id_fkey: 'SET NULL',
      auth_sessions_user_id_fkey: 'RESTRICT',
      login_audits_user_id_fkey: 'SET NULL',
      role_permissions_permission_id_fkey: 'RESTRICT',
      role_permissions_role_id_fkey: 'CASCADE',
      user_roles_assigned_by_user_id_fkey: 'SET NULL',
      user_roles_role_id_fkey: 'CASCADE',
      user_roles_user_id_fkey: 'RESTRICT',
      users_resource_profile_id_fkey: 'RESTRICT',
    });
  });

  it('ships an additive migration with refresh-family and audit indexes', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TYPE "app"."UserStatus"');
    expect(migration).toContain('CREATE TYPE "app"."DataScope"');
    for (const tableName of [
      'users',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
      'auth_sessions',
      'login_audits',
    ]) {
      expect(migration).toContain(`CREATE TABLE "app"."${tableName}"`);
    }
    expect(migration).toContain('CREATE UNIQUE INDEX "users_resource_profile_id_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key"');
    expect(migration).toContain('CREATE INDEX "auth_sessions_token_family_id_idx"');
    expect(migration).toContain('CREATE INDEX "auth_sessions_user_id_expires_at_idx"');
    expect(migration).toContain('CREATE INDEX "login_audits_user_id_occurred_at_idx"');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });
});
