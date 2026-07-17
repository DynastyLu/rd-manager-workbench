import { Injectable } from '@nestjs/common';
import { JobType } from '../../../../shared/contracts/jobs/job-type';
import { JobRepository } from '../domain/job.repository';

export interface CreateJobInput {
  type: JobType;
  input?: unknown;
  queueJobId?: string;
  tenantId?: string;
  tenantKey?: string;
  operatorId?: string;
  traceId?: string;
}

@Injectable()
export class CreateJobUseCase {
  constructor(private readonly jobRepository: JobRepository) {}

  execute(input: CreateJobInput) {
    return this.jobRepository.create(input);
  }
}
