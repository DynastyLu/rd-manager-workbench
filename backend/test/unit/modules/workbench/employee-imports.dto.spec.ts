import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EmployeeWorkbookTemplateQueryDto,
  ResolveEmployeeImportDto,
} from '../../../../src/modules/workbench/employees/interface/http/dto/employee-imports.dto';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
} from '../../../../src/modules/workbench/employees/interface/http/dto/employees.dto';

describe('ResolveEmployeeImportDto', () => {
  it.each([
    { rows: [] },
    { rows: [{ rowNumber: 1_048_577 }] },
    { rows: [{ rowNumber: 2, employeeId: '' }] },
    { rows: [{ rowNumber: 2, projectId: 'x'.repeat(201) }] },
    { rows: [{ rowNumber: 2, taskId: '   ' }] },
  ])('rejects bounded resolution payload %j', async (payload) => {
    const errors = await validate(plainToInstance(ResolveEmployeeImportDto, payload));
    expect(errors).not.toHaveLength(0);
  });

  it('accepts null or bounded non-empty optional IDs', async () => {
    const dto = plainToInstance(ResolveEmployeeImportDto, {
      rows: [
        {
          rowNumber: 1_048_576,
          employeeId: null,
          projectId: 'project-1',
          taskId: null,
        },
      ],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    {
      rows: [
        {
          rowId: 'row-2',
          workKind: 'UNKNOWN',
        },
      ],
    },
    {
      rows: [
        {
          rowId: 'row-2',
          workKind: 'PROJECT',
          plannedHours: -0.01,
        },
      ],
    },
    {
      rows: [
        {
          rowId: 'row-2',
          workKind: 'PROJECT',
          actualHours: 10_000,
        },
      ],
    },
    {
      rows: [
        {
          rowId: 'row-2',
          workKind: 'PROJECT',
          riskDecision: 'IGNORE',
        },
      ],
    },
    {
      rows: [
        {
          rowId: 'row-2',
          workKind: 'PROJECT',
          createEmployee: { displayName: '', department: '研发部' },
        },
      ],
    },
  ])('rejects invalid V2 resolution payload %j', async (payload) => {
    const errors = await validate(plainToInstance(ResolveEmployeeImportDto, payload));
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a bounded V2 resolution with an explicit profile and risk decision', async () => {
    const dto = plainToInstance(ResolveEmployeeImportDto, {
      rows: [
        {
          rowId: 'row-2',
          employeeId: 'employee-1',
          createEmployee: {
            displayName: '匿名员工',
            department: '研发部',
            workDirection: '平台工程',
          },
          updateEmployeeProfile: true,
          workKind: 'PROJECT',
          projectId: 'project-1',
          taskId: 'task-1',
          plannedHours: 8.25,
          actualHours: 7.5,
          riskDecision: 'EDIT',
          riskText: '依赖外部接口联调',
        },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});

describe('employee workDirection DTOs', () => {
  it('trims workDirection in employee list and create payloads', async () => {
    const query = plainToInstance(ListEmployeesQueryDto, {
      workDirection: '  平台工程  ',
    });
    const create = plainToInstance(CreateEmployeeDto, {
      displayName: '匿名员工',
      workDirection: '  平台工程  ',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    await expect(validate(create)).resolves.toHaveLength(0);
    expect(query.workDirection).toBe('平台工程');
    expect(create.workDirection).toBe('平台工程');
  });
});

describe('EmployeeWorkbookTemplateQueryDto', () => {
  it.each(['2026-07-2', '2026/07/20', 'not-a-date'])(
    'rejects an invalid periodStart %s',
    async (periodStart) => {
      await expect(
        validate(plainToInstance(EmployeeWorkbookTemplateQueryDto, { periodStart })),
      ).resolves.not.toHaveLength(0);
    },
  );

  it('requires an ISO periodStart for the public V2 template download', async () => {
    await expect(
      validate(
        plainToInstance(EmployeeWorkbookTemplateQueryDto, { periodStart: '2026-07-20' }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(EmployeeWorkbookTemplateQueryDto, {})),
    ).resolves.not.toHaveLength(0);
  });
});
