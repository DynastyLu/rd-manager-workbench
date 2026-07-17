import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Param, Post, Res, Optional } from '@nestjs/common';
import type { Response } from 'express';
import type { Job, Queue } from 'bullmq';
import { QueueNames } from '../../../../../shared/contracts/jobs/queue-names';

@Controller('system/queues/ocr')
export class QueueAdminController {
  constructor(@Optional() @InjectQueue(QueueNames.Ocr) private readonly queue?: Queue) {}

  @Get()
  async summary() {
    return {
      name: QueueNames.Ocr,
      available: Boolean(this.queue),
      counts: this.queue
        ? await this.queue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
            'paused',
          )
        : {},
    };
  }

  @Get('failed')
  async failed() {
    if (!this.queue) {
      return { jobs: [] };
    }

    const jobs = await this.queue.getFailed(0, 50);
    return {
      jobs: jobs.map((job) => this.serializeJob(job)),
    };
  }

  @Post('failed/:jobId/retry')
  async retry(@Param('jobId') jobId: string) {
    const job = await this.getFailedJob(jobId);
    if (!job) {
      return { retried: false, jobId };
    }

    await job.retry();
    return { retried: true, jobId };
  }

  @Post('failed/:jobId/archive')
  async archive(@Param('jobId') jobId: string) {
    const job = await this.getFailedJob(jobId);
    if (!job) {
      return { archived: false, jobId };
    }

    await job.remove();
    return { archived: true, jobId };
  }

  @Get('dashboard')
  async dashboard(@Res() response: Response) {
    const summary = await this.summary();
    const failed = await this.failed();
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>OCR Queue</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #111827; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>OCR Queue</h1>
  <p>Available: <code>${summary.available}</code></p>
  <pre>${escapeHtml(JSON.stringify(summary.counts, null, 2))}</pre>
  <h2>Failed Jobs</h2>
  <table>
    <thead><tr><th>ID</th><th>Name</th><th>Failed Reason</th></tr></thead>
    <tbody>${failed.jobs
      .map(
        (job) =>
          `<tr><td>${escapeHtml(job.id)}</td><td>${escapeHtml(job.name)}</td><td>${escapeHtml(
            job.failedReason || '',
          )}</td></tr>`,
      )
      .join('')}</tbody>
  </table>
</body>
</html>`);
  }

  private async getFailedJob(jobId: string) {
    if (!this.queue) {
      return null;
    }
    const job = await this.queue.getJob(jobId);
    if (!job || (await job.getState()) !== 'failed') {
      return null;
    }
    return job;
  }

  private serializeJob(job: Job) {
    return {
      id: String(job.id),
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
