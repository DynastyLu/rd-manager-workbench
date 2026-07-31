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

function expectMappedIdentityField(block: string, field: string): void {
  const column = field.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  expect(block).toMatch(new RegExp(`${field}\\s+String\\?\\s+@map\\("${column}"\\)`));
}

describe('business ownership Prisma catalog', () => {
  const prisma = new PrismaClient();
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');
  const migrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260730030000_business_ownership/migration.sql',
  );

  afterAll(async () => prisma.$disconnect());

  it('adds semantically appropriate ownership without removing legacy display names', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    const ownershipFields: Record<string, readonly string[]> = {
      Project: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      Milestone: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      WorkTask: ['createdByUserId', 'updatedByUserId', 'ownerUserId', 'assigneeUserId'],
      ProgressReport: ['createdByUserId'],
      Risk: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      Issue: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      Decision: ['createdByUserId', 'updatedByUserId'],
      EmployeeWorkItem: ['createdByUserId', 'updatedByUserId'],
      EmployeeWeekPlanItem: ['createdByUserId', 'updatedByUserId'],
      ReminderRule: ['createdByUserId', 'ownerUserId'],
      Meeting: ['createdByUserId', 'updatedByUserId', 'organizerUserId'],
      MeetingAction: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      ContentDocument: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      KnowledgeSpace: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      DataTable: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      DataView: ['ownerUserId'],
      IntelligenceTopic: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      IntelligenceSource: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      IntelligenceCollectionPlan: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      IntelligenceItem: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      IntelligenceBrief: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      NonProjectRdItem: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
      ApplicationCase: ['createdByUserId', 'updatedByUserId', 'ownerUserId'],
    };

    for (const [modelName, fields] of Object.entries(ownershipFields)) {
      const block = schemaBlock(schema, 'model', modelName);
      for (const field of fields) {
        expectMappedIdentityField(block, field);
      }
    }

    expect(schemaBlock(schema, 'model', 'Project')).toContain(
      'participantNames           String[]',
    );
    expect(schemaBlock(schema, 'model', 'WorkTask')).toContain('collaboratorNames');
    expect(schemaBlock(schema, 'model', 'Meeting')).toContain('participantNames');
  });

  it('models private content visibility and explicit participant/member/share joins', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const visibility = schemaBlock(schema, 'enum', 'BusinessVisibility');

    expect(visibility).toContain('PRIVATE');
    expect(visibility).toContain('INVOLVED');
    expect(visibility).toContain('ORGANIZATION');
    expect(visibility).toContain('@@schema("app")');

    for (const modelName of ['ContentDocument', 'KnowledgeSpace', 'DataTable']) {
      expect(schemaBlock(schema, 'model', modelName)).toMatch(
        /visibility\s+BusinessVisibility\s+@default\(PRIVATE\)/,
      );
    }

    const joins = [
      {
        model: 'ProjectMember',
        ownerField: 'projectId',
        identityField: 'userId',
        map: 'project_members',
      },
      {
        model: 'WorkTaskParticipant',
        ownerField: 'taskId',
        identityField: 'userId',
        map: 'work_task_participants',
      },
      {
        model: 'MeetingParticipant',
        ownerField: 'meetingId',
        identityField: 'userId',
        map: 'meeting_participants',
      },
      {
        model: 'DocumentUserShare',
        ownerField: 'documentId',
        identityField: 'userId',
        map: 'document_user_shares',
      },
      {
        model: 'DocumentRoleShare',
        ownerField: 'documentId',
        identityField: 'roleId',
        map: 'document_role_shares',
      },
      {
        model: 'KnowledgeSpaceMember',
        ownerField: 'spaceId',
        identityField: 'userId',
        map: 'knowledge_space_members',
      },
    ] as const;

    for (const join of joins) {
      const block = schemaBlock(schema, 'model', join.model);
      expect(block).toContain(`${join.ownerField}`);
      expect(block).toContain(`${join.identityField}`);
      expect(block).toContain(`@@id([${join.ownerField}, ${join.identityField}])`);
      expect(block).toContain(`@@index([${join.identityField}])`);
      expect(block).toContain(`@@map("${join.map}")`);
      expect(block).toContain('@@schema("app")');
    }

    expect(schemaBlock(schema, 'model', 'DocumentUserShare')).toMatch(
      /canEdit\s+Boolean\s+@default\(false\)\s+@map\("can_edit"\)/,
    );
    expect(schemaBlock(schema, 'model', 'DocumentRoleShare')).toMatch(
      /canEdit\s+Boolean\s+@default\(false\)\s+@map\("can_edit"\)/,
    );
    expect(schemaBlock(schema, 'model', 'KnowledgeSpaceMember')).toMatch(
      /canEdit\s+Boolean\s+@default\(false\)\s+@map\("can_edit"\)/,
    );
  });

  it('installs ownership columns, join tables, and foreign keys in PostgreSQL', async () => {
    const [tables, columns, foreignKeys] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
      `,
      prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND (
            column_name IN (
              'created_by_user_id',
              'updated_by_user_id',
              'owner_user_id',
              'assignee_user_id',
              'organizer_user_id',
              'visibility'
            )
            OR table_name IN (
              'project_members',
              'work_task_participants',
              'meeting_participants',
              'document_user_shares',
              'document_role_shares',
              'knowledge_space_members'
            )
          )
      `,
      prisma.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_schema = 'app'
          AND constraint_name IN (
            'projects_owner_user_id_fkey',
            'tasks_assignee_user_id_fkey',
            'meetings_organizer_user_id_fkey',
            'project_members_project_id_fkey',
            'project_members_user_id_fkey',
            'work_task_participants_task_id_fkey',
            'work_task_participants_user_id_fkey',
            'meeting_participants_meeting_id_fkey',
            'meeting_participants_user_id_fkey',
            'document_user_shares_document_id_fkey',
            'document_user_shares_user_id_fkey',
            'document_role_shares_document_id_fkey',
            'document_role_shares_role_id_fkey',
            'knowledge_space_members_space_id_fkey',
            'knowledge_space_members_user_id_fkey'
          )
      `,
    ]);

    const tableNames = tables.map(({ table_name }) => table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'project_members',
        'work_task_participants',
        'meeting_participants',
        'document_user_shares',
        'document_role_shares',
        'knowledge_space_members',
      ]),
    );

    const columnCatalog = columns.map(
      ({ table_name, column_name }) => `${table_name}.${column_name}`,
    );
    expect(columnCatalog).toEqual(
      expect.arrayContaining([
        'projects.owner_user_id',
        'projects.created_by_user_id',
        'tasks.owner_user_id',
        'tasks.assignee_user_id',
        'meetings.organizer_user_id',
        'content_documents.visibility',
        'content_documents.owner_user_id',
        'knowledge_spaces.visibility',
        'data_tables.visibility',
        'project_members.user_id',
        'document_user_shares.user_id',
        'document_role_shares.role_id',
        'knowledge_space_members.user_id',
      ]),
    );

    const deleteRules = Object.fromEntries(
      foreignKeys.map(({ constraint_name, delete_rule }) => [constraint_name, delete_rule]),
    );
    expect(deleteRules).toEqual({
      document_role_shares_document_id_fkey: 'CASCADE',
      document_role_shares_role_id_fkey: 'RESTRICT',
      document_user_shares_document_id_fkey: 'CASCADE',
      document_user_shares_user_id_fkey: 'RESTRICT',
      knowledge_space_members_space_id_fkey: 'CASCADE',
      knowledge_space_members_user_id_fkey: 'RESTRICT',
      meeting_participants_meeting_id_fkey: 'CASCADE',
      meeting_participants_user_id_fkey: 'RESTRICT',
      meetings_organizer_user_id_fkey: 'RESTRICT',
      project_members_project_id_fkey: 'CASCADE',
      project_members_user_id_fkey: 'RESTRICT',
      projects_owner_user_id_fkey: 'RESTRICT',
      tasks_assignee_user_id_fkey: 'RESTRICT',
      work_task_participants_task_id_fkey: 'CASCADE',
      work_task_participants_user_id_fkey: 'RESTRICT',
    });
  });

  it('ships an additive migration with scope-query indexes', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TYPE "app"."BusinessVisibility"');
    for (const tableName of [
      'project_members',
      'work_task_participants',
      'meeting_participants',
      'document_user_shares',
      'document_role_shares',
      'knowledge_space_members',
    ]) {
      expect(migration).toContain(`CREATE TABLE "app"."${tableName}"`);
    }
    for (const indexName of [
      'projects_owner_user_id_idx',
      'tasks_owner_user_id_idx',
      'tasks_assignee_user_id_idx',
      'meetings_organizer_user_id_idx',
      'content_documents_owner_user_id_visibility_idx',
      'project_members_user_id_idx',
      'document_user_shares_user_id_idx',
      'document_role_shares_role_id_idx',
      'knowledge_space_members_user_id_idx',
    ]) {
      expect(migration).toContain(`CREATE INDEX "${indexName}"`);
    }
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });
});
