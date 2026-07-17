import { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { closeE2eApp, createE2eApp } from './helpers/e2e-app';

describe('Operations endpoints e2e', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
  });

  afterAll(async () => {
    await closeE2eApp(app, prisma);
  });

  it('exposes liveness and readiness checks', async () => {
    const live = await request(app.getHttpServer()).get('/api/health/live');
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({
      success: true,
      data: { status: 'live' },
    });

    const ready = await request(app.getHttpServer()).get('/api/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      success: true,
      data: {
        status: 'ready',
        checks: {
          database: 'ok',
          queue: expect.any(String),
          storage: 'ok',
        },
      },
    });
  });

  it('exposes queue operations and a lightweight queue dashboard', async () => {
    const summary = await request(app.getHttpServer()).get('/api/system/queues/ocr');
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      success: true,
      data: {
        name: 'ocr',
        available: false,
      },
    });

    const failed = await request(app.getHttpServer()).get('/api/system/queues/ocr/failed');
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({
      success: true,
      data: {
        jobs: [],
      },
    });

    const dashboard = await request(app.getHttpServer()).get('/api/system/queues/ocr/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('OCR Queue');
  });

  it('exposes platform metrics', async () => {
    const response = await request(app.getHttpServer()).get('/api/system/metrics');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        service: 'backend-core-platform',
        uptimeSeconds: expect.any(Number),
        jobs: {
          total: expect.any(Number),
        },
      },
    });
  });
});
