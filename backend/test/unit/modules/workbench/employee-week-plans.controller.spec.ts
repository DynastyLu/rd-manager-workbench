import {
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeProgressPeriod,
  EmployeeWorkKind,
} from '@prisma/client';
import { EmployeeProgressController } from '../../../../src/modules/workbench/employees/interface/http/employees.controller';

describe('EmployeeProgressController week-plan routes', () => {
  const progress = {
    weekPlans: jest.fn(),
    weekPlan: jest.fn(),
    workItem: jest.fn(),
  };
  const plans = {
    updateSystemFields: jest.fn(),
    cancel: jest.fn(),
    match: jest.fn(),
    unmatch: jest.fn(),
    convertToTask: jest.fn(),
  };
  const workItems = {
    updateSystemFields: jest.fn(),
  };

  const controller = new (EmployeeProgressController as unknown as new (
    progress: unknown,
    workExport: unknown,
    workRisks: unknown,
    plans: unknown,
    workItems: unknown,
  ) => EmployeeProgressController)(progress, {}, {}, plans, workItems);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('delegates bounded week-plan listing and detail queries', async () => {
    const query = {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-27',
      employeeId: 'employee-1',
      projectId: 'project-1',
      carryStatus: EmployeePlanCarryStatus.PLANNED,
      page: 1,
      pageSize: 20,
    };
    progress.weekPlans.mockResolvedValue({ data: [] });
    progress.weekPlan.mockResolvedValue({ id: 'plan-1' });

    await expect(controller.weekPlans(query)).resolves.toEqual({ data: [] });
    await expect(controller.weekPlan('plan-1')).resolves.toEqual({ id: 'plan-1' });
    expect(progress.weekPlans).toHaveBeenCalledWith(query);
    expect(progress.weekPlan).toHaveBeenCalledWith('plan-1');
  });

  it('delegates every idempotent week-plan action with its explicit input', async () => {
    const update = {
      workKind: EmployeeWorkKind.PROJECT,
      projectId: 'project-1',
      taskId: 'task-1',
      plannedCompletionAt: '2026-07-30',
      priority: EmployeePlanPriority.HIGH,
      collaborationText: '需要测试协作',
    };

    await controller.updateWeekPlan('plan-1', update);
    await controller.cancelWeekPlan('plan-1', { reason: '计划调整' });
    await controller.matchWeekPlan('plan-1', { workItemId: 'work-1' });
    await controller.unmatchWeekPlan('plan-1');
    await controller.convertWeekPlanToTask('plan-1');

    expect(plans.updateSystemFields).toHaveBeenCalledWith('plan-1', {
      ...update,
      plannedCompletionAt: new Date('2026-07-30T00:00:00.000Z'),
    });
    expect(plans.cancel).toHaveBeenCalledWith('plan-1', '计划调整');
    expect(plans.match).toHaveBeenCalledWith('plan-1', 'work-1');
    expect(plans.unmatch).toHaveBeenCalledWith('plan-1');
    expect(plans.convertToTask).toHaveBeenCalledWith('plan-1');
  });

  it('delegates bounded current-work system field updates', async () => {
    await controller.updateWorkItem('work-1', {
      workKind: EmployeeWorkKind.NON_PROJECT,
      projectId: null,
      taskId: null,
      plannedCompletionAt: '2026-07-30',
      plannedHours: 8,
      actualHours: 6.5,
      riskText: null,
    });

    expect(workItems.updateSystemFields).toHaveBeenCalledWith('work-1', {
      workKind: EmployeeWorkKind.NON_PROJECT,
      projectId: null,
      taskId: null,
      plannedCompletionAt: new Date('2026-07-30T00:00:00.000Z'),
      plannedHours: 8,
      actualHours: 6.5,
      riskText: null,
    });
  });
});
