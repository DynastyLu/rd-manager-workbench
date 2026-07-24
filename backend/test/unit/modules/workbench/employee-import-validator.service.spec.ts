import { EmployeeImportRowStatus, EmployeeWorkStatus } from '@prisma/client';
import {
  EmployeeImportValidatorService,
  EmployeeImportResolution,
} from '../../../../src/modules/workbench/employees/application/employee-import-validator.service';
import { NormalizedEmployeeWorkRow } from '../../../../src/modules/workbench/employees/domain/employee-work.types';

function row(overrides: Partial<NormalizedEmployeeWorkRow> = {}): NormalizedEmployeeWorkRow {
  return {
    rowNumber: 2,
    employeeName: '张明',
    title: '实现员工周报导入',
    planText: null,
    summaryText: null,
    completionRate: 90,
    status: EmployeeWorkStatus.IN_PROGRESS,
    nextPlanText: null,
    riskText: null,
    plannedHours: 8,
    actualHours: 7,
    projectCode: null,
    taskCode: null,
    note: null,
    rawValues: {
      员工姓名: '张明',
      工作内容: '实现员工周报导入',
      项目编号: null,
      任务编号: null,
    },
    ...overrides,
  };
}

describe('EmployeeImportValidatorService', () => {
  it('marks unknown employees and projects unresolved and rejects a task outside the project', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([{ id: 'employee-1', displayName: '张明' }]),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([{ id: 'project-1', code: 'RD-026' }]),
      },
      workTask: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'task-other', code: 'TASK-OTHER001', projectId: 'project-other' },
          ]),
      },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);

    const result = await validator.validate([
      row({
        employeeName: '未知员工',
        projectCode: 'RD-404',
        rawValues: {
          员工姓名: '未知员工',
          工作内容: '实现员工周报导入',
          项目编号: 'RD-404',
          任务编号: null,
        },
      }),
      row({
        rowNumber: 3,
        projectCode: 'RD-026',
        taskCode: 'TASK-OTHER001',
        rawValues: {
          员工姓名: '张明',
          工作内容: '实现员工周报导入',
          项目编号: 'RD-026',
          任务编号: 'TASK-OTHER001',
        },
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        status: EmployeeImportRowStatus.UNRESOLVED,
        errors: expect.arrayContaining([
          expect.objectContaining({ field: '员工姓名', code: 'EMPLOYEE_NOT_FOUND' }),
          expect.objectContaining({ field: '项目编号', code: 'PROJECT_NOT_FOUND' }),
        ]),
      }),
      expect.objectContaining({
        status: EmployeeImportRowStatus.UNRESOLVED,
        errors: [expect.objectContaining({ field: '任务编号', code: 'TASK_PROJECT_MISMATCH' })],
      }),
    ]);
  });

  it('resolves exact active employee, project, and task matches in three bulk queries', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([{ id: 'employee-1', displayName: '张明' }]),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([{ id: 'project-1', code: 'RD-026' }]),
      },
      workTask: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'task-1', code: 'TASK-001', projectId: 'project-1' }]),
      },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);

    const result = await validator.validate([
      row({ projectCode: 'RD-026', taskCode: 'TASK-001' }),
      row({ rowNumber: 3, projectCode: 'RD-026', taskCode: 'TASK-001' }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        row: expect.objectContaining({ rowNumber: 2 }),
        status: EmployeeImportRowStatus.VALID,
        errors: [],
        resolvedEmployeeId: 'employee-1',
        resolvedProjectId: 'project-1',
        resolvedTaskId: 'task-1',
      }),
      expect.objectContaining({
        row: expect.objectContaining({ rowNumber: 3 }),
        status: EmployeeImportRowStatus.VALID,
      }),
    ]);
    expect(prisma.resourceProfile.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.workTask.findMany).toHaveBeenCalledTimes(1);
  });

  it('allows an explicitly unresolved project to stay unlinked but still rejects bad employee and task resolutions', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([{ id: 'employee-1', displayName: '张明' }]),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([{ id: 'project-1', code: 'RD-026' }]),
      },
      workTask: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'task-other', code: 'TASK-OTHER001', projectId: 'project-other' },
          ]),
      },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);
    const resolutions = new Map<number, EmployeeImportResolution>([
      [2, { employeeId: 'employee-1', projectId: null, taskId: null, keepUnlinked: true }],
      [
        3,
        {
          employeeId: 'employee-missing',
          projectId: 'project-1',
          taskId: 'task-other',
          keepUnlinked: false,
        },
      ],
    ]);

    const result = await validator.validate(
      [
        row({ projectCode: 'RD-404' }),
        row({
          rowNumber: 3,
          projectCode: 'RD-026',
          taskCode: 'TASK-OTHER001',
        }),
      ],
      resolutions,
    );

    expect(result[0]).toMatchObject({
      status: EmployeeImportRowStatus.VALID,
      errors: [],
      resolvedEmployeeId: 'employee-1',
      resolvedProjectId: null,
      resolvedTaskId: null,
      keepUnlinked: true,
    });
    expect(result[1]).toMatchObject({
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: '员工姓名', code: 'EMPLOYEE_NOT_FOUND' }),
        expect.objectContaining({ field: '任务编号', code: 'TASK_PROJECT_MISMATCH' }),
      ]),
    });
  });

  it('does not clear an unknown project unless keepUnlinked is explicitly true', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([{ id: 'employee-1', displayName: '张明' }]),
      },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      workTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);

    const result = await validator.validate(
      [row({ projectCode: 'RD-404' })],
      new Map([
        [
          2,
          {
            employeeId: 'employee-1',
            projectId: null,
            taskId: null,
            keepUnlinked: false,
          },
        ],
      ]),
    );

    expect(result[0]).toMatchObject({
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [expect.objectContaining({ field: '项目编号', code: 'PROJECT_NOT_FOUND' })],
    });
  });
});
