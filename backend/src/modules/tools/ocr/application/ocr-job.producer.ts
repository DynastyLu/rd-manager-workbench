import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { JobType } from '../../../../shared/contracts/jobs/job-type';
import { QueueNames } from '../../../../shared/contracts/jobs/queue-names';

export interface EnqueueOcrJobInput {
  jobId: string;
  type: JobType;
  payload: unknown;
}

@Injectable()
export class OcrJobProducer {
  constructor(@Optional() @InjectQueue(QueueNames.Ocr) private readonly queue?: Queue) {}

  async enqueue(input: EnqueueOcrJobInput): Promise<{ queueJobId: string | null }> {
    if (!this.queue) {
      return { queueJobId: null };
    }

    const queueJob = await this.queue.add(input.type, input.payload, {
      jobId: input.jobId,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    return { queueJobId: String(queueJob.id) };
  }
}
