import { ValidationPipe } from '@nestjs/common';
import { ListProjectsQueryDto } from '../../../../src/modules/workbench/projects/interface/http/dto/list-projects-query.dto';

describe('ListProjectsQueryDto', () => {
  it('accepts search with the strict global validation settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform({ search: 'Alpha' }, { type: 'query', metatype: ListProjectsQueryDto }),
    ).resolves.toMatchObject({ search: 'Alpha' });
  });
});
