import { Controller, Get, Param } from '@nestjs/common';
import { GetJobUseCase } from '../../application/get-job.use-case';

@Controller('jobs')
export class JobsController {
  constructor(private readonly getJobUseCase: GetJobUseCase) {}

  @Get(':jobId')
  get(@Param('jobId') jobId: string) {
    return this.getJobUseCase.execute(jobId);
  }
}
