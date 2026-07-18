import { ValidationPipe } from '@nestjs/common';
import { ListProjectsQueryDto } from '../../../../src/modules/workbench/projects/interface/http/dto/list-projects-query.dto';

describe('ListProjectsQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  it('accepts search with the strict global validation settings', async () => {
    await expect(
      pipe.transform({ search: 'Alpha' }, { type: 'query', metatype: ListProjectsQueryDto }),
    ).resolves.toMatchObject({ search: 'Alpha' });
  });

  it('transforms up to eight comma-separated project ids', async () => {
    await expect(
      pipe.transform(
        { ids: 'project-150, project-5' },
        { type: 'query', metatype: ListProjectsQueryDto },
      ),
    ).resolves.toMatchObject({ ids: ['project-150', 'project-5'] });
  });

  it('rejects empty project ids', async () => {
    await expect(
      pipe.transform(
        { ids: 'project-1,,project-2' },
        { type: 'query', metatype: ListProjectsQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('rejects more than eight project ids', async () => {
    await expect(
      pipe.transform(
        { ids: Array.from({ length: 9 }, (_, index) => `project-${index + 1}`).join(',') },
        { type: 'query', metatype: ListProjectsQueryDto },
      ),
    ).rejects.toThrow();
  });
});
