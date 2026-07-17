import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus } from '../../../../shared/contracts/jobs/job-status';
import { JobEntity } from '../domain/job.entity';
import {
  CreateJobRepositoryInput,
  JobFailureInput,
  JobRepository,
} from '../domain/job.repository';

@Injectable()
export class InMemoryJobRepository extends JobRepository {
  private readonly jobs = new Map<string, JobEntity>();

  async create(input: CreateJobRepositoryInput): Promise<JobEntity> {
    const job: JobEntity = {
      id: randomUUID(),
      type: input.type,
      status: JobStatus.Queued,
      queueJobId: input.queueJobId,
      tenantId: input.tenantId,
      tenantKey: input.tenantKey,
      operatorId: input.operatorId,
      traceId: input.traceId,
      input: input.input,
      attempts: 0,
      progress: 0,
      createdAt: new Date(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async findById(id: string): Promise<JobEntity | null> {
    return this.jobs.get(id) ?? null;
  }

  async markProcessing(id: string): Promise<JobEntity> {
    return this.updateJob(id, {
      status: JobStatus.Processing,
      progress: 1,
      startedAt: new Date(),
    });
  }

  async markSucceeded(id: string, result: unknown): Promise<JobEntity> {
    return this.updateJob(id, {
      status: JobStatus.Succeeded,
      progress: 100,
      result,
      finishedAt: new Date(),
    });
  }

  async markFailed(id: string, error: JobFailureInput): Promise<JobEntity> {
    return this.updateJob(id, {
      status: JobStatus.Failed,
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
      finishedAt: new Date(),
    });
  }

  async listByTenant(input: { tenantId?: string; tenantKey?: string }): Promise<JobEntity[]> {
    return [...this.jobs.values()].filter(
      (job) =>
        (!input.tenantId || job.tenantId === input.tenantId) &&
        (!input.tenantKey || job.tenantKey === input.tenantKey),
    );
  }

  private updateJob(id: string, patch: Partial<JobEntity>): JobEntity {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException(`Job not found: ${id}`);
    }

    const updated = { ...job, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }
}
