import { Global, Module } from '@nestjs/common';
import { ActivityService } from './application/activity.service';
import { ActivityController } from './interface/http/activity.controller';

@Global()
@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
