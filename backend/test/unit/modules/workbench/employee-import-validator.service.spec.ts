import { EmployeeImportRowStatus, EmployeeWorkStatus } from '@prisma/client';
import {
  EmployeeImportValidatorService,
  EmployeeImportResolution,
} from '../../../../src/modules/workbench/employees/application/employee-import-validator.service';
import { NormalizedEmployeeWorkRow } from '../../../../src/modules/workbench/employees/domain/employee-work.types';
import {
  NormalizedEmployeeCurrentWorkRow,
  NormalizedEmployeeNextWeekPlanRow,
} from '../../../../src/modules/workbench/employees/domain/employee-work.types';

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
  it('requires V2 work classification and a project for project work', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'employee-1',
            displayName: '匿名员工',
            department: '研发部',
            workDirection: '平台工程',
          },
        ]),
      },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      workTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);
    const current = {
      ...row({ employeeName: '匿名员工' }),
      sourceSection: 'CURRENT_WORK',
      sourceSheetName: '匿名员工',
      sourceRowNumber: 7,
      department: '研发部',
      workDirection: '平台工程',
      plannedCompletionAt: '2026-07-24',
    } satisfies NormalizedEmployeeCurrentWorkRow;

    const [unclassified] = await validator.validate([current]);
    const [projectMissing] = await validator.validate(
      [current],
      new Map([[2, { workKind: 'PROJECT' }]]),
    );

    expect(unclassified).toMatchObject({
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [expect.objectContaining({ code: 'WORK_KIND_REQUIRED' })],
    });
    expect(projectMissing).toMatchObject({
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: [expect.objectContaining({ code: 'PROJECT_REQUIRED' })],
      workKind: 'PROJECT',
    });
  });

  it('rejects project/task links and actual hours for a non-project next-week plan', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'employee-1', displayName: '匿名员工', department: null, workDirection: null },
        ]),
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
    const plan: NormalizedEmployeeNextWeekPlanRow = {
      sourceSection: 'NEXT_WEEK_PLAN',
      rowNumber: 3,
      sourceSheetName: '匿名员工',
      sourceRowNumber: 28,
      employeeName: '匿名员工',
      department: null,
      workDirection: null,
      title: '发布导入功能',
      deliverableText: '完成上线',
      plannedCompletionAt: '2026-07-31',
      priority: 'HIGH',
      collaborationText: null,
      planText: null,
      note: null,
      rawValues: { 下周重点工作: '发布导入功能' },
    };

    const [result] = await validator.validate(
      [plan],
      new Map([
        [
          3,
          {
            employeeId: 'employee-1',
            workKind: 'NON_PROJECT',
            projectId: 'project-1',
            taskId: 'task-1',
            plannedHours: 6,
            actualHours: 1,
          },
        ],
      ]),
    );

    expect(result).toMatchObject({
      status: EmployeeImportRowStatus.UNRESOLVED,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'NON_PROJECT_LINK_FORBIDDEN' }),
        expect.objectContaining({ code: 'ACTUAL_HOURS_NOT_ALLOWED' }),
      ]),
      plannedHours: 6,
      actualHours: 1,
    });
  });

  it('reports profile differences as non-blocking warnings', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'employee-1',
            displayName: '匿名员工',
            department: '旧部门',
            workDirection: '旧方向',
          },
        ]),
      },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      workTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);
    const current = {
      ...row({ employeeName: '匿名员工' }),
      sourceSection: 'CURRENT_WORK',
      sourceSheetName: '匿名员工',
      sourceRowNumber: 7,
      department: '新部门',
      workDirection: '新方向',
      plannedCompletionAt: null,
    } satisfies NormalizedEmployeeCurrentWorkRow;

    const [result] = await validator.validate(
      [current],
      new Map([[2, { workKind: 'NON_PROJECT' }]]),
    );

    expect(result).toMatchObject({
      status: EmployeeImportRowStatus.VALID,
      errors: [],
      warnings: [
        expect.objectContaining({ field: 'department', profileValue: '旧部门', rowValue: '新部门' }),
        expect.objectContaining({
          field: 'workDirection',
          profileValue: '旧方向',
          rowValue: '新方向',
        }),
      ],
    });
  });

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

  it('does not duplicate name and code parameters when every row has explicit commit resolutions', async () => {
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
    const resolutions = new Map<number, EmployeeImportResolution>([
      [2, { employeeId: 'employee-1', projectId: 'project-1', taskId: 'task-1' }],
      [3, { employeeId: 'employee-1', projectId: 'project-1', taskId: 'task-1' }],
    ]);

    await validator.validate(
      [
        row({ projectCode: 'RD-026', taskCode: 'TASK-001' }),
        row({ rowNumber: 3, projectCode: 'RD-026', taskCode: 'TASK-001' }),
      ],
      resolutions,
    );

    expect(prisma.resourceProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['employee-1'] },
        }),
      }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['project-1'] },
        }),
      }),
    );
    expect(prisma.workTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['task-1'] },
        }),
      }),
    );
  });

  it('validates 50,000 high-cardinality resolutions in deterministic chunks', async () => {
    const rowCount = 50_000;
    const prisma = {
      resourceProfile: {
        findMany: jest
          .fn()
          .mockImplementation(async ({ where }) =>
            (where.id.in as string[]).map((id) => ({ id, displayName: `name-${id}` })),
          ),
      },
      project: {
        findMany: jest
          .fn()
          .mockImplementation(async ({ where }) =>
            (where.id.in as string[]).map((id) => ({ id, code: `code-${id}` })),
          ),
      },
      workTask: {
        findMany: jest.fn().mockImplementation(async ({ where }) =>
          (where.id.in as string[]).map((id) => ({
            id,
            code: `code-${id}`,
            projectId: id.replace('task-', 'project-'),
          })),
        ),
      },
    };
    const validator = new EmployeeImportValidatorService(prisma as never);
    const rows = Array.from({ length: rowCount }, (_, index) => {
      const suffix = String(index).padStart(5, '0');
      return row({
        rowNumber: index + 2,
        employeeName: `Employee ${suffix}`,
        projectCode: `P-${suffix}`,
        taskCode: `T-${suffix}`,
      });
    });
    const resolutions = new Map<number, EmployeeImportResolution>(
      rows.map((input, index) => {
        const suffix = String(index).padStart(5, '0');
        return [
          input.rowNumber,
          {
            employeeId: `employee-${suffix}`,
            projectId: `project-${suffix}`,
            taskId: `task-${suffix}`,
          },
        ];
      }),
    );

    const result = await validator.validate(rows, resolutions);

    expect(result).toHaveLength(rowCount);
    expect(result.every(({ status }) => status === EmployeeImportRowStatus.VALID)).toBe(true);
    for (const delegate of [
      prisma.resourceProfile.findMany,
      prisma.project.findMany,
      prisma.workTask.findMany,
    ]) {
      expect(delegate).toHaveBeenCalledTimes(50);
      expect(
        delegate.mock.calls.every(([{ where }]) => {
          const values = where.id.in as string[];
          return values.length > 0 && values.length <= 1_000;
        }),
      ).toBe(true);
    }
  });
});
