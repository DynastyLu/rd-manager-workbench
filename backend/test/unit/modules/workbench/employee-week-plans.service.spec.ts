import {
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  TaskPriority,
} from '@prisma/client';
import { AppError } from '../../../../src/shared/errors/app-error';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';
import { EmployeeWeekPlansService } from '../../../../src/modules/workbench/employees/application/employee-week-plans.service';

describe('EmployeeWeekPlansService', () => {
  const plan = {
    id: 'plan-1',
    employeeId: 'employee-1',
    title: '完成权限模型',
    deliverableText: '交付设计与实现',
    planText: '按期推进',
    note: '导入备注',
    plannedCompletionAt: new Date('2026-08-07T00:00:00.000Z'),
    priority: EmployeePlanPriority.HIGH,
    collaborationText: '需要安全团队评审',
    workKind: EmployeeWorkKind.PROJECT,
    projectId: 'project-1',
    taskId: null,
    carryStatus: EmployeePlanCarryStatus.PLANNED,
    matchedWorkItemId: null,
    cancelReason: null,
    employee: { displayName: '匿名员工' },
    project: { id: 'project-1', archivedAt: null },
  };

  function fixture(currentPlan: Record<string, unknown> = plan) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      employeeWeekPlanItem: {
        findFirst: jest.fn().mockResolvedValue(currentPlan),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...currentPlan, ...data })),
      },
      employeeWorkItem: {
        findFirst: jest.fn(),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
      workTask: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const prisma = {
      employeeWeekPlanItem: {
        findFirst: jest.fn().mockResolvedValue(currentPlan),
      },
      $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const tasks = {
      createTaskInTransaction: jest.fn(),
    };
    const audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const service = new EmployeeWeekPlansService(prisma as never, tasks as never, audit as never);
    return { service, prisma, tx, tasks, audit };
  }

  it('gets only an active plan from a completed weekly import', async () => {
    const { service, prisma } = fixture();

    await expect(service.get('plan-1')).resolves.toEqual(plan);

    expect(prisma.employeeWeekPlanItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'plan-1',
        archivedAt: null,
        employee: { archivedAt: null },
        importBatch: {
          periodType: EmployeeProgressPeriod.WEEK,
          status: EmployeeWorkImportStatus.COMPLETED,
          archivedAt: null,
        },
      },
      include: expect.any(Object),
    });
  });

  it('rejects a missing or inactive plan with the generic resource code', async () => {
    const { service, prisma } = fixture();
    prisma.employeeWeekPlanItem.findFirst.mockResolvedValue(null);

    await expect(service.get('missing')).rejects.toMatchObject({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('updates only system-owned fields in a locked transaction and audits changed fields', async () => {
    const { service, prisma, tx, audit } = fixture();
    const completion = new Date('2026-08-08T00:00:00.000Z');

    const result = await service.updateSystemFields('plan-1', {
      workKind: EmployeeWorkKind.PROJECT,
      projectId: 'project-1',
      taskId: null,
      plannedCompletionAt: completion,
      priority: EmployeePlanPriority.URGENT,
      collaborationText: '需要测试资源',
      title: '不得修改导入标题',
      planText: '不得修改导入计划文本',
    } as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        workKind: EmployeeWorkKind.PROJECT,
        projectId: 'project-1',
        taskId: null,
        plannedCompletionAt: completion,
        priority: EmployeePlanPriority.URGENT,
        collaborationText: '需要测试资源',
      },
      include: expect.any(Object),
    });
    expect(result).not.toHaveProperty('title', '不得修改导入标题');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_SYSTEM_FIELDS_UPDATED',
        entityType: 'employeeWeekPlanItem',
        entityId: 'plan-1',
        outcome: 'SUCCEEDED',
        changedFields: ['collaborationText', 'plannedCompletionAt', 'priority'],
      }),
      tx,
    );
  });

  it('requires an active project and requires the task to belong to it', async () => {
    const { service, tx } = fixture();
    tx.project.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSystemFields('plan-1', { projectId: 'missing-project' }),
    ).rejects.toMatchObject({
      code: ErrorCodes.PROJECT_NOT_FOUND,
    });

    tx.project.findFirst.mockResolvedValue({ id: 'project-2' });
    tx.workTask.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSystemFields('plan-1', {
        projectId: 'project-2',
        taskId: 'task-from-another-project',
      }),
    ).rejects.toMatchObject({
      code: ErrorCodes.TASK_INVALID_REFERENCE,
    });
  });

  it('clears project and task links when classified as non-project work', async () => {
    const { service, tx } = fixture({ ...plan, taskId: 'task-1' });

    await service.updateSystemFields('plan-1', {
      workKind: EmployeeWorkKind.NON_PROJECT,
      projectId: 'ignored-project',
      taskId: 'ignored-task',
    });

    expect(tx.project.findFirst).not.toHaveBeenCalled();
    expect(tx.workTask.findFirst).not.toHaveBeenCalled();
    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          workKind: EmployeeWorkKind.NON_PROJECT,
          projectId: null,
          taskId: null,
        },
      }),
    );
  });

  it('cancels once, preserves the first reason on retry, and audits both outcomes', async () => {
    const { service, tx, audit } = fixture();
    const cancelled = {
      ...plan,
      carryStatus: EmployeePlanCarryStatus.CANCELLED,
      cancelReason: '优先级调整',
    };
    tx.employeeWeekPlanItem.findFirst.mockResolvedValueOnce(plan).mockResolvedValueOnce(cancelled);
    tx.employeeWeekPlanItem.update.mockResolvedValue(cancelled);

    await expect(service.cancel('plan-1', '  优先级调整  ')).resolves.toEqual({
      plan: cancelled,
      alreadyCancelled: false,
    });
    await expect(service.cancel('plan-1', '第二次不同原因')).resolves.toEqual({
      plan: cancelled,
      alreadyCancelled: true,
    });

    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledTimes(1);
    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        carryStatus: EmployeePlanCarryStatus.CANCELLED,
        matchedWorkItemId: null,
        cancelReason: '优先级调整',
      },
      include: expect.any(Object),
    });
    expect(audit.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_CANCELLED',
        changedFields: [],
        metadata: expect.objectContaining({ status: 'ALREADY_CANCELLED' }),
      }),
      tx,
    );
  });

  it('matches a planned plan only to an active work item for the same employee and is idempotent', async () => {
    const matched = {
      ...plan,
      carryStatus: EmployeePlanCarryStatus.MATCHED,
      matchedWorkItemId: 'work-1',
    };
    const { service, tx } = fixture();
    tx.employeeWeekPlanItem.findFirst.mockResolvedValueOnce(plan).mockResolvedValueOnce(matched);
    tx.employeeWorkItem.findFirst.mockResolvedValue({
      id: 'work-1',
      employeeId: plan.employeeId,
    });
    tx.employeeWeekPlanItem.update.mockResolvedValue(matched);

    await expect(service.match('plan-1', 'work-1')).resolves.toEqual({
      plan: matched,
      alreadyMatched: false,
    });
    await expect(service.match('plan-1', 'work-1')).resolves.toEqual({
      plan: matched,
      alreadyMatched: true,
    });

    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledTimes(1);
    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        carryStatus: EmployeePlanCarryStatus.MATCHED,
        matchedWorkItemId: 'work-1',
        cancelReason: null,
      },
      include: expect.any(Object),
    });
  });

  it('rejects matching to a different employee or matching a cancelled plan', async () => {
    const { service, tx } = fixture();
    tx.employeeWorkItem.findFirst.mockResolvedValue({
      id: 'work-1',
      employeeId: 'employee-2',
    });

    await expect(service.match('plan-1', 'work-1')).rejects.toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
    });

    tx.employeeWeekPlanItem.findFirst.mockResolvedValue({
      ...plan,
      carryStatus: EmployeePlanCarryStatus.CANCELLED,
    });
    tx.employeeWorkItem.findFirst.mockResolvedValue({
      id: 'work-1',
      employeeId: plan.employeeId,
    });

    await expect(service.match('plan-1', 'work-1')).rejects.toBeInstanceOf(AppError);
  });

  it('unmatches to planned and is idempotent when already planned', async () => {
    const matched = {
      ...plan,
      carryStatus: EmployeePlanCarryStatus.MATCHED,
      matchedWorkItemId: 'work-1',
    };
    const { service, tx } = fixture(matched);
    const planned = { ...plan };
    tx.employeeWeekPlanItem.findFirst.mockResolvedValueOnce(matched).mockResolvedValueOnce(planned);
    tx.employeeWeekPlanItem.update.mockResolvedValue(planned);

    await expect(service.unmatch('plan-1')).resolves.toEqual({
      plan: planned,
      alreadyPlanned: false,
    });
    await expect(service.unmatch('plan-1')).resolves.toEqual({
      plan: planned,
      alreadyPlanned: true,
    });

    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledTimes(1);
    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        carryStatus: EmployeePlanCarryStatus.PLANNED,
        matchedWorkItemId: null,
        cancelReason: null,
      },
      include: expect.any(Object),
    });
  });

  it('converts one project plan to a linked task and reuses that task on retry', async () => {
    const task = { id: 'task-1', projectId: 'project-1', title: plan.title };
    const linkedPlan = { ...plan, taskId: task.id };
    const { service, tx, tasks, audit } = fixture();
    tx.employeeWeekPlanItem.findFirst.mockResolvedValueOnce(plan).mockResolvedValueOnce(linkedPlan);
    tx.workTask.findFirst.mockResolvedValue(task);
    tx.employeeWeekPlanItem.update.mockResolvedValue(linkedPlan);
    tasks.createTaskInTransaction.mockResolvedValue(task);

    await expect(service.convertToTask('plan-1')).resolves.toEqual({
      plan: linkedPlan,
      task,
      alreadyExists: false,
    });
    await expect(service.convertToTask('plan-1')).resolves.toEqual({
      plan: linkedPlan,
      task,
      alreadyExists: true,
    });

    expect(tasks.createTaskInTransaction).toHaveBeenCalledTimes(1);
    expect(tasks.createTaskInTransaction).toHaveBeenCalledWith(tx, {
      title: plan.title,
      description: plan.deliverableText,
      assigneeName: plan.employee.displayName,
      priority: TaskPriority.HIGH,
      dueAt: '2026-08-07',
      projectId: plan.projectId,
      sourceType: 'EMPLOYEE_WEEK_PLAN',
      sourceId: plan.id,
    });
    expect(tx.employeeWeekPlanItem.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { taskId: task.id },
      include: expect.any(Object),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WEEK_PLAN_CONVERTED_TO_TASK',
        changedFields: ['taskId'],
        metadata: expect.objectContaining({ status: 'CREATED' }),
      }),
      tx,
    );
  });

  it('rejects converting a non-project plan', async () => {
    const { service } = fixture({
      ...plan,
      workKind: EmployeeWorkKind.NON_PROJECT,
      projectId: null,
    });

    await expect(service.convertToTask('plan-1')).rejects.toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
    });
  });
});
