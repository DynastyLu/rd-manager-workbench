import { ProjectHealthService } from '../../../../src/modules/workbench/projects/application/project-health.service';

describe('ProjectHealthService', () => {
  const service = new ProjectHealthService();

  it('returns RED with missed-milestone and critical-overdue reasons in a stable order', () => {
    expect(
      service.calculate({
        today: new Date('2026-07-18T00:00:00.000Z'),
        missedMilestones: 2,
        overdueCriticalTasks: 1,
        dueSoonMilestones: 4,
        overdueTasks: 5,
      }),
    ).toEqual({
      health: 'RED',
      reasons: ['里程碑已逾期', '关键任务已逾期'],
    });
  });

  it('returns YELLOW with overdue-task and due-soon reasons in a stable order', () => {
    expect(
      service.calculate({
        today: new Date('2026-07-18T00:00:00.000Z'),
        missedMilestones: 0,
        overdueCriticalTasks: 0,
        dueSoonMilestones: 1,
        overdueTasks: 2,
      }),
    ).toEqual({
      health: 'YELLOW',
      reasons: ['任务已逾期', '里程碑临近'],
    });
  });

  it('returns GREEN with no reasons when the project has no health signals', () => {
    expect(
      service.calculate({
        today: new Date('2026-07-18T00:00:00.000Z'),
        missedMilestones: 0,
        overdueCriticalTasks: 0,
        dueSoonMilestones: 0,
        overdueTasks: 0,
      }),
    ).toEqual({ health: 'GREEN', reasons: [] });
  });
});
