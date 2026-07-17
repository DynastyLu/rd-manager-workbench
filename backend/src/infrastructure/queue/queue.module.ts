import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/app-config.module';
import { QueueNames } from '../../shared/contracts/jobs/queue-names';

const bullImports =
  process.env.NODE_ENV === 'test'
    ? []
    : [
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            connection: {
              host: configService.getOrThrow<string>('REDIS_HOST'),
              port: configService.getOrThrow<number>('REDIS_PORT'),
              password: configService.get<string>('REDIS_PASSWORD'),
            },
            prefix: configService.getOrThrow<string>('QUEUE_PREFIX'),
          }),
        }),
        BullModule.registerQueue({
          name: QueueNames.Ocr,
        }),
      ];
const bullExports = process.env.NODE_ENV === 'test' ? [] : [BullModule];

@Module({
  imports: [AppConfigModule, ...bullImports],
  exports: bullExports,
})
export class QueueInfrastructureModule {}
