import { JobType } from '../../../../shared/contracts/jobs/job-type';
import { JobEntity } from './job.entity';

export interface CreateJobRepositoryInput {
  type: JobType;
  input?: unknown;
  queueJobId?: string;
  tenantId?: string;
  tenantKey?: string;
  operatorId?: string;
  traceId?: string;
}

export interface JobFailureInput {
  errorCode: string;
  errorMessage: string;
}

export abstract class JobRepository {
  abstract create(input: CreateJobRepositoryInput): Promise<JobEntity>;
  abstract findById(id: string): Promise<JobEntity | null>;
  abstract markProcessing(id: string): Promise<JobEntity>;
  abstract markSucceeded(id: string, result: unknown): Promise<JobEntity>;
  abstract markFailed(id: string, error: JobFailureInput): Promise<JobEntity>;
  abstract listByTenant(input: { tenantId?: string; tenantKey?: string }): Promise<JobEntity[]>;
}
