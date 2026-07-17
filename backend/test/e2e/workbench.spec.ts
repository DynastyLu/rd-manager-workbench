import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureBodyParser } from '../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/shared/interceptors/response.interceptor';

describe('Workbench e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_NAME = 'rd-manager-workbench';
    process.env.DATABASE_URL =
      'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app';

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns stable local status without authentication or tenant headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/workbench/status').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        mode: 'local',
        database: 'postgresql',
      },
    });
  });
});
