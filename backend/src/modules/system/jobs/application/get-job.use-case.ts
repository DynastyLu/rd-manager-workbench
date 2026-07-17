import { Injectable, NotFoundException } from '@nestjs/common';
import { JobRepository } from '../domain/job.repository';

@Injectable()
export class GetJobUseCase {
  constructor(private readonly jobRepository: JobRepository) {}

  async execute(jobId: string) {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }

    return job;
  }
}
