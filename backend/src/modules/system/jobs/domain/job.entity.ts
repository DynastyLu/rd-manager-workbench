import { JobStatus } from '../../../../shared/contracts/jobs/job-status';
import { JobType } from '../../../../shared/contracts/jobs/job-type';

export interface JobEntity {
  id: string;
  type: JobType;
  status: JobStatus;
  queueJobId?: string;
  tenantId?: string;
  tenantKey?: string;
  operatorId?: string;
  traceId?: string;
  input?: unknown;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  attempts: number;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}
