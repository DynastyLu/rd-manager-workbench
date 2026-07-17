import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { JobStatus } from '../../../../shared/contracts/jobs/job-status';
import { JobType } from '../../../../shared/contracts/jobs/job-type';
import { JobEntity } from '../domain/job.entity';
import {
  CreateJobRepositoryInput,
  JobFailureInput,
  JobRepository,
} from '../domain/job.repository';

type PrismaJobRecord = {
  id: string;
  type: string;
  status: string;
  queueJobId: string | null;
  tenantId: string | null;
  tenantKey: string | null;
  operatorId: string | null;
  traceId: string | null;
  input: unknown;
  result: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  progress: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

@Injectable()
export class PrismaJobRepository extends JobRepository {
  constructor(private readonly prisma: PlatformPrismaService) {
    super();
  }

  async create(input: CreateJobRepositoryInput): Promise<JobEntity> {
    const job = await this.prisma.job.create({
      data: {
        type: input.type,
        input: input.input as never,
        queueJobId: input.queueJobId,
        tenantId: input.tenantId,
        tenantKey: input.tenantKey,
        operatorId: input.operatorId,
        traceId: input.traceId,
      },
    });
    return this.toEntity(job);
  }

  async findById(id: string): Promise<JobEntity | null> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    return job ? this.toEntity(job) : null;
  }

  async markProcessing(id: string): Promise<JobEntity> {
    return this.updateOrThrow(id, {
      status: 'PROCESSING',
      progress: 1,
      startedAt: new Date(),
    });
  }

  async markSucceeded(id: string, result: unknown): Promise<JobEntity> {
    return this.updateOrThrow(id, {
      status: 'SUCCEEDED',
      progress: 100,
      result: result as never,
      finishedAt: new Date(),
    });
  }

  async markFailed(id: string, error: JobFailureInput): Promise<JobEntity> {
    return this.updateOrThrow(id, {
      status: 'FAILED',
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
      finishedAt: new Date(),
    });
  }

  async listByTenant(input: { tenantId?: string; tenantKey?: string }): Promise<JobEntity[]> {
    const jobs = await this.prisma.job.findMany({
      where: {
        tenantId: input.tenantId,
        tenantKey: input.tenantKey,
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map((job) => this.toEntity(job));
  }

  private async updateOrThrow(id: string, data: Record<string, unknown>) {
    try {
      const job = await this.prisma.job.update({
        where: { id },
        data: data as never,
      });
      return this.toEntity(job);
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new NotFoundException(`Job not found: ${id}`);
      }
      throw error;
    }
  }

  private toEntity(job: PrismaJobRecord): JobEntity {
    return {
      id: job.id,
      type: job.type as JobType,
      status: this.toContractStatus(job.status),
      queueJobId: job.queueJobId ?? undefined,
      tenantId: job.tenantId ?? undefined,
      tenantKey: job.tenantKey ?? undefined,
      operatorId: job.operatorId ?? undefined,
      traceId: job.traceId ?? undefined,
      input: job.input ?? undefined,
      result: job.result ?? undefined,
      errorCode: job.errorCode ?? undefined,
      errorMessage: job.errorMessage ?? undefined,
      attempts: job.attempts,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? undefined,
      finishedAt: job.finishedAt ?? undefined,
    };
  }

  private toContractStatus(status: string): JobStatus {
    const statusMap: Record<string, JobStatus> = {
      QUEUED: JobStatus.Queued,
      PROCESSING: JobStatus.Processing,
      SUCCEEDED: JobStatus.Succeeded,
      FAILED: JobStatus.Failed,
      CANCELED: JobStatus.Canceled,
    };
    return statusMap[status] ?? JobStatus.Failed;
  }

  private isRecordNotFound(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2025'
    );
  }
}
