import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureBodyParser } from '../../src/bootstrap/body-parser';
import { configureLocalCors } from '../../src/bootstrap/cors';
import { HttpExceptionFilter } from '../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/shared/interceptors/response.interceptor';

describe('Workbench e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    configureLocalCors(app);
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

  it('reports database readiness without an external queue', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ready',
        checks: {
          database: 'ok',
          queue: 'unavailable',
          storage: 'ok',
        },
      },
    });
  });

  it('allows the local frontend origin to call the API', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/dashboard')
      .set('Origin', 'http://127.0.0.1:4312')
      .set('Access-Control-Request-Method', 'PUT')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4312');
    expect(response.headers['access-control-allow-methods']).toContain('PUT');
  });
});
