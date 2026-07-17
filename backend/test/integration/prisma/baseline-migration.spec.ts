import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Prisma baseline migration', () => {
  const backendRoot = resolve(__dirname, '../../..');
  const migrationPath = resolve(
    backendRoot,
    'prisma/migrations/20260717000000_init/migration.sql',
  );

  it('can describe an empty-database deployment without a pre-existing app schema', () => {
    expect(readFileSync(migrationPath, 'utf8')).toMatch(/^CREATE SCHEMA IF NOT EXISTS "app";/);

    const sql = execFileSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema-datamodel',
        './prisma/schema.prisma',
        '--script',
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
      },
    );

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "app"');
    expect(sql).toContain('CREATE TABLE "app"."app_metadata"');
  });
});
