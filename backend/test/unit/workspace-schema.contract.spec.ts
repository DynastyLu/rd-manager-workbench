import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260718060000_project_space_my_work/migration.sql',
);

describe('my-work Prisma schema contract', () => {
  const prismaClient = new PrismaClient();

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  it('exposes task reminder and later delegates', () => {
    expect(prismaClient).toHaveProperty('taskReminder');
    expect(prismaClient).toHaveProperty('taskLater');
  });

  it('maps one reminder and one later state to each work task', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/model WorkTask \{[\s\S]*?reminder\s+TaskReminder\?/);
    expect(schema).toMatch(/model WorkTask \{[\s\S]*?later\s+TaskLater\?/);
  });

  it('defines reminder fields, one-to-one task relation, and query index', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/model TaskReminder \{[\s\S]*?id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    expect(schema).toMatch(/model TaskReminder \{[\s\S]*?taskId\s+String\s+@unique\s+@map\("task_id"\)/);
    expect(schema).toMatch(/model TaskReminder \{[\s\S]*?remindAt\s+DateTime\s+@map\("remind_at"\)\s+@db\.Timestamptz\(6\)/);
    expect(schema).toMatch(/model TaskReminder \{[\s\S]*?dismissedAt\s+DateTime\?\s+@map\("dismissed_at"\)\s+@db\.Timestamptz\(6\)/);
    expect(schema).toMatch(/model TaskReminder \{[\s\S]*?task\s+WorkTask\s+@relation\(fields: \[taskId\], references: \[id\], onDelete: Cascade\)/);
    expect(schema).toMatch(/model TaskReminder \{[\s\S]*?@@index\(\[remindAt, dismissedAt\]\)[\s\S]*?@@map\("task_reminders"\)[\s\S]*?@@schema\("app"\)/);
  });

  it('defines later fields, one-to-one task relation, and query index', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/model TaskLater \{[\s\S]*?id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    expect(schema).toMatch(/model TaskLater \{[\s\S]*?taskId\s+String\s+@unique\s+@map\("task_id"\)/);
    expect(schema).toMatch(/model TaskLater \{[\s\S]*?deferredUntil\s+DateTime\s+@map\("deferred_until"\)\s+@db\.Timestamptz\(6\)/);
    expect(schema).toMatch(/model TaskLater \{[\s\S]*?task\s+WorkTask\s+@relation\(fields: \[taskId\], references: \[id\], onDelete: Cascade\)/);
    expect(schema).toMatch(/model TaskLater \{[\s\S]*?@@index\(\[deferredUntil\]\)[\s\S]*?@@map\("task_laters"\)[\s\S]*?@@schema\("app"\)/);
  });

  it('creates only the reminder and later persistence objects in the forward migration', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('CREATE TABLE "app"."task_reminders"');
    expect(migration).toContain('CREATE TABLE "app"."task_laters"');
    expect(migration).toContain('"task_reminders_task_id_fkey"');
    expect(migration).toContain('"task_laters_task_id_fkey"');
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\s+TABLE\b/i);
    expect(migration).not.toContain('ALTER TABLE "app"."tasks"');
  });
});
