import { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { closeE2eApp, createE2eApp } from './helpers/e2e-app';

describe('OCR tools e2e', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const jobIds = new Set<string>();

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
  });

  afterAll(async () => {
    if (prisma && jobIds.size > 0) {
      await prisma.job.deleteMany({
        where: { id: { in: Array.from(jobIds) } },
      });
    }
    await closeE2eApp(app, prisma);
  });

  it('creates an OCR job through the new task endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/tools/ocr/jobs')
      .attach('image', Buffer.from('fake-image'), {
        filename: 'table.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        jobId: expect.any(String),
        statusUrl: expect.stringContaining('/api/jobs/'),
        resultUrl: expect.stringContaining('/api/tools/ocr/jobs/'),
      },
    });

    const jobId = response.body.data.jobId as string;
    jobIds.add(jobId);
    const persistedJob = await prisma.job.findUnique({ where: { id: jobId } });
    expect(persistedJob).toMatchObject({
      id: jobId,
      type: 'ocr.recognize',
      status: 'QUEUED',
    });
  });

  it('keeps legacy recognize endpoint compatible with async jobs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/recognize')
      .attach('image', Buffer.from('fake-image'), {
        filename: 'table.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      success: false,
      pending: true,
      jobId: expect.any(String),
      statusUrl: expect.stringContaining('/api/jobs/'),
      resultUrl: expect.stringContaining('/api/tools/ocr/jobs/'),
    });

    const jobId = response.body.jobId as string;
    jobIds.add(jobId);
    const persistedJob = await prisma.job.findUnique({ where: { id: jobId } });
    expect(persistedJob).toMatchObject({
      id: jobId,
      type: 'ocr.recognize',
      status: 'QUEUED',
    });
  });

  it('keeps legacy export endpoint compatible with async jobs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/export')
      .send({
        rows: [['姓名', '分数']],
        merged_cells: [{ from: [0, 0], to: [0, 1] }],
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      success: false,
      pending: true,
      jobId: expect.any(String),
      statusUrl: expect.stringContaining('/api/jobs/'),
      resultUrl: expect.stringContaining('/api/tools/ocr/jobs/'),
    });

    const jobId = response.body.jobId as string;
    jobIds.add(jobId);
    const persistedJob = await prisma.job.findUnique({ where: { id: jobId } });
    expect(persistedJob).toMatchObject({
      id: jobId,
      type: 'excel.export',
      status: 'QUEUED',
    });
  });

  it('rejects legacy batch export payloads above the old 20-sheet limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/export-batch')
      .send({
        sheets: Array.from({ length: 21 }, (_, index) => ({
          name: `Sheet${index + 1}`,
          rows: [['姓名', '分数']],
        })),
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: expect.stringContaining('20'),
      },
    });
  });

  it('keeps legacy hairstyle transform endpoint compatible with async jobs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/hairstyle/transform')
      .field('style', 'short-bob')
      .attach('image', Buffer.from('fake-image'), {
        filename: 'portrait.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      success: false,
      pending: true,
      jobId: expect.any(String),
      statusUrl: expect.stringContaining('/api/jobs/'),
      resultUrl: expect.stringContaining('/api/tools/hairstyle/jobs/'),
    });

    const jobId = response.body.jobId as string;
    jobIds.add(jobId);
    const persistedJob = await prisma.job.findUnique({ where: { id: jobId } });
    expect(persistedJob).toMatchObject({
      id: jobId,
      type: 'hairstyle.transform',
      status: 'QUEUED',
    });
  });

  it('exposes hairstyle style presets from the migrated backend', async () => {
    const response = await request(app.getHttpServer()).get('/api/hairstyle/styles');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: expect.arrayContaining([
        { id: 'short-bob', label: '短波波' },
        { id: 'air-bangs', label: '空气刘海' },
      ]),
    });
  });

  it('does not regress health endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        service: 'backend-core-platform',
      },
    });
  });
});
