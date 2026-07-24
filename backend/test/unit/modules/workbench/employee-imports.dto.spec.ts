import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResolveEmployeeImportDto } from '../../../../src/modules/workbench/employees/interface/http/dto/employee-imports.dto';

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
});
