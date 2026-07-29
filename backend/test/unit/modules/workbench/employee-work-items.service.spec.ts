import { EmployeeWorkKind } from '@prisma/client';
import { EmployeeWorkItemsService } from '../../../../src/modules/workbench/employees/application/employee-work-items.service';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';

describe('EmployeeWorkItemsService', () => {
  const workItem = {
    id: 'work-1',
    importBatchId: 'batch-1',
    workKind: EmployeeWorkKind.PROJECT,
    projectId: 'project-1',
    taskId: null,
    plannedCompletionAt: new Date('2026-07-31T00:00:00.000Z'),
    plannedHours: 16,
    actualHours: 8,
    riskText: null,
    archivedAt: null,
    importBatch: { archivedAt: null },
  };

  function fixture(current: Record<string, unknown> = workItem) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      employeeWorkItem: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...current, ...data })),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
      workTask: {
        findFirst: jest.fn().mockResolvedValue({ id: 'task-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const snapshots = {
      rebuildBatch: jest.fn().mockResolvedValue({ id: 'batch-1', snapshotStatus: 'READY' }),
    };
    const service = new EmployeeWorkItemsService(
      prisma as never,
      audit as never,
      snapshots as never,
    );
    return { service, tx, audit, snapshots };
  }

  it('updates only system-owned fields in a lock, audits, and rebuilds the import snapshot', async () => {
    const { service, tx, audit, snapshots } = fixture();

    const result = await service.updateSystemFields('work-1', {
      workKind: EmployeeWorkKind.PROJECT,
      projectId: 'project-1',
      taskId: 'task-1',
      plannedCompletionAt: new Date('2026-08-01T00:00:00.000Z'),
      plannedHours: 20,
      actualHours: 12.5,
      riskText: '接口联调存在风险',
      title: '不得修改导入标题',
    } as never);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.employeeWorkItem.update).toHaveBeenCalledWith({
      where: { id: 'work-1' },
      data: {
        workKind: EmployeeWorkKind.PROJECT,
        projectId: 'project-1',
        taskId: 'task-1',
        plannedCompletionAt: new Date('2026-08-01T00:00:00.000Z'),
        plannedHours: 20,
        actualHours: 12.5,
        riskText: '接口联调存在风险',
      },
    });
    expect(result).not.toHaveProperty('title', '不得修改导入标题');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_ITEM_SYSTEM_FIELDS_UPDATED',
        entityType: 'employeeWorkItem',
        entityId: 'work-1',
        changedFields: [
          'actualHours',
          'plannedCompletionAt',
          'plannedHours',
          'riskText',
          'taskId',
        ],
      }),
      tx,
    );
    expect(snapshots.rebuildBatch).toHaveBeenCalledWith('batch-1');
  });

  it('clears project and task for non-project work', async () => {
    const { service, tx } = fixture({ ...workItem, taskId: 'task-1' });

    await service.updateSystemFields('work-1', {
      workKind: EmployeeWorkKind.NON_PROJECT,
      projectId: 'ignored',
      taskId: 'ignored',
    });

    expect(tx.project.findFirst).not.toHaveBeenCalled();
    expect(tx.workTask.findFirst).not.toHaveBeenCalled();
    expect(tx.employeeWorkItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          workKind: EmployeeWorkKind.NON_PROJECT,
          projectId: null,
          taskId: null,
        },
      }),
    );
  });

  it('rejects inactive project and task references outside the project', async () => {
    const { service, tx } = fixture();
    tx.project.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSystemFields('work-1', { projectId: 'missing-project' }),
    ).rejects.toMatchObject({ code: ErrorCodes.PROJECT_NOT_FOUND });

    tx.project.findFirst.mockResolvedValue({ id: 'project-1' });
    tx.workTask.findFirst.mockResolvedValue(null);
    await expect(
      service.updateSystemFields('work-1', { projectId: 'project-1', taskId: 'wrong-task' }),
    ).rejects.toMatchObject({ code: ErrorCodes.TASK_INVALID_REFERENCE });
  });

  it('rejects missing or inactive work items', async () => {
    const { service, tx } = fixture();
    tx.employeeWorkItem.findFirst.mockResolvedValue(null);

    await expect(service.updateSystemFields('missing', { plannedHours: 1 })).rejects.toMatchObject({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('updates only work items from the current completed weekly import contract', async () => {
    const { service, tx } = fixture();

    await service.updateSystemFields('work-1', { plannedHours: 10 });

    expect(tx.employeeWorkItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'work-1',
        archivedAt: null,
        employee: { archivedAt: null },
        importBatch: {
          periodType: 'WEEK',
          status: 'COMPLETED',
          archivedAt: null,
        },
      },
      select: expect.any(Object),
    });
  });
});
