import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));

  if (!match) {
    throw new Error(`Missing ${modelName} model`);
  }

  return match[1];
}

describe('project execution catalog contract', () => {
  const prismaClient = new PrismaClient();
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  it('maps every P0 model, relation, and query index in the Prisma schema', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const project = modelBlock(schema, 'Project');
    const milestone = modelBlock(schema, 'Milestone');
    const workTask = modelBlock(schema, 'WorkTask');
    const taskDependency = modelBlock(schema, 'TaskDependency');
    const progressReport = modelBlock(schema, 'ProgressReport');
    const healthSnapshot = modelBlock(schema, 'ProjectHealthSnapshot');

    expect(project).toContain('@@map("projects")');
    expect(project).toMatch(/milestones\s+Milestone\[\]/);
    expect(project).toMatch(/tasks\s+WorkTask\[\]/);
    expect(project).toMatch(/progressReports\s+ProgressReport\[\]/);
    expect(project).toMatch(/healthSnapshots\s+ProjectHealthSnapshot\[\]/);
    expect(project).toContain('@@index([status, archivedAt])');
    expect(project).toContain('@@index([plannedEndAt])');

    expect(milestone).toContain('@@map("milestones")');
    expect(milestone).toContain('onDelete: Cascade');
    expect(milestone).toMatch(/tasks\s+WorkTask\[\]/);
    expect(milestone).toContain('@@index([projectId, plannedAt])');
    expect(milestone).toContain('@@index([plannedAt])');

    expect(workTask).toContain('@@map("tasks")');
    expect(workTask).toContain('onDelete: SetNull');
    expect(workTask).toContain('@relation("TaskHierarchy"');
    expect(workTask).toContain('@relation("DependencyTask")');
    expect(workTask).toContain('@relation("DependencyDependsOn")');
    expect(workTask).toContain('@@index([projectId, status, dueAt])');
    expect(workTask).toContain('@@index([milestoneId])');
    expect(workTask).toContain('@@index([parentId])');
    expect(workTask).toContain('@@index([archivedAt, dueAt])');
    expect(workTask).toContain('@@index([assigneeName, archivedAt, dueAt])');

    expect(taskDependency).toContain('@@map("task_dependencies")');
    expect(taskDependency).toContain('@@id([taskId, dependsOnTaskId])');
    expect(taskDependency).toContain('onDelete: Cascade');
    expect(taskDependency).toContain('@@index([dependsOnTaskId])');

    expect(progressReport).toContain('@@map("progress_reports")');
    expect(progressReport).toContain('onDelete: Cascade');
    expect(progressReport).toContain('@@index([projectId, reportedAt])');
    expect(progressReport).toContain('@@index([reportedAt])');

    expect(healthSnapshot).toContain('@@map("project_health_snapshots")');
    expect(healthSnapshot).toContain('onDelete: Cascade');
    expect(healthSnapshot).toContain('@@index([projectId, calculatedAt])');
  });

  it('creates the P0 query indexes in the PostgreSQL catalog', async () => {
    const indexes = await prismaClient.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'app'
        AND tablename IN (
          'projects',
          'milestones',
          'tasks',
          'task_dependencies',
          'progress_reports',
          'project_health_snapshots'
        )
    `;

    expect(indexes.map((index) => index.indexname)).toEqual(
      expect.arrayContaining([
        'projects_code_key',
        'projects_status_archived_at_idx',
        'projects_planned_end_at_idx',
        'milestones_project_id_planned_at_idx',
        'milestones_planned_at_idx',
        'tasks_project_id_status_due_at_idx',
        'tasks_milestone_id_idx',
        'tasks_parent_id_idx',
        'tasks_archived_at_due_at_idx',
        'tasks_assignee_name_archived_at_due_at_idx',
        'task_dependencies_depends_on_task_id_idx',
        'progress_reports_project_id_reported_at_idx',
        'progress_reports_reported_at_idx',
        'project_health_snapshots_project_id_calculated_at_idx',
      ]),
    );
  });
});
