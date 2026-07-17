import { Test } from '@nestjs/testing';
import { QueueInfrastructureModule } from '../../../../src/infrastructure/queue/queue.module';

describe('QueueInfrastructureModule', () => {
  it('compiles without connecting to Redis in test env', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [QueueInfrastructureModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
