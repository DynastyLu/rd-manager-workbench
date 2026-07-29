import 'reflect-metadata';
import { EmployeePlanPriority, EmployeeProgressPeriod, EmployeeWorkKind } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import {
  EmployeeWorkbookTemplateQueryDto,
  ResolveEmployeeImportDto,
} from '../../../../src/modules/workbench/employees/interface/http/dto/employee-imports.dto';
import {
  CreateEmployeeDto,
  ListEmployeeWeekPlansQueryDto,
  ListEmployeeWorkItemsQueryDto,
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

  it('accepts the first global V2 staged row when resolving by row number', async () => {
    const dto = plainToInstance(ResolveEmployeeImportDto, {
      rows: [{ rowNumber: 1, workKind: 'NON_PROJECT', employeeId: 'employee-1' }],
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

describe('employee weekly V2 query DTOs', () => {
  it('accepts and normalizes bounded current-work and future-plan filters', async () => {
    const workItems = plainToInstance(ListEmployeeWorkItemsQueryDto, {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-20',
      workDirection: ' 平台研发 ',
      workKind: EmployeeWorkKind.PROJECT,
      taskId: ' task-1 ',
      dueDateFrom: '2026-07-21',
      dueDateTo: '2026-07-25',
      riskOnly: 'true',
    });
    const plans = plainToInstance(ListEmployeeWeekPlansQueryDto, {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStart: '2026-07-27',
      priority: EmployeePlanPriority.HIGH,
      workDirection: ' 平台研发 ',
      dueDateFrom: '2026-07-28',
      dueDateTo: '2026-07-31',
    });

    await expect(validate(workItems)).resolves.toHaveLength(0);
    await expect(validate(plans)).resolves.toHaveLength(0);
    expect(workItems).toMatchObject({
      workDirection: '平台研发',
      taskId: 'task-1',
      riskOnly: true,
    });
    expect(plans).toMatchObject({ workDirection: '平台研发' });
  });
});

describe('EmployeeWorkbookTemplateQueryDto', () => {
  it.each(['2026-07-2', '2026/07/20', 'not-a-date'])(
    'rejects an invalid periodStart %s',
    async (periodStart) => {
      await expect(
        validate(
          plainToInstance(EmployeeWorkbookTemplateQueryDto, {
            version: '2',
            periodStart,
          }),
        ),
      ).resolves.not.toHaveLength(0);
    },
  );

  it('requires an ISO periodStart for the public V2 template download', async () => {
    await expect(
      validate(
        plainToInstance(EmployeeWorkbookTemplateQueryDto, {
          version: '2',
          periodStart: '2026-07-20',
        }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(EmployeeWorkbookTemplateQueryDto, {
          periodStart: '2026-07-20',
        }),
      ),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(EmployeeWorkbookTemplateQueryDto, {
          version: '1',
          periodStart: '2026-07-20',
        }),
      ),
    ).resolves.not.toHaveLength(0);
  });

  it('keeps version=2 and periodStart through the production ValidationPipe contract', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { version: '2', periodStart: '2026-07-27' },
        { type: 'query', metatype: EmployeeWorkbookTemplateQueryDto },
      ),
    ).resolves.toMatchObject({
      version: 2,
      periodStart: '2026-07-27',
    });
  });
});
