import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { NonProjectRdService } from './application/non-project-rd.service';
import { NonProjectRdController } from './interface/http/non-project-rd.controller';
import { ResourcesService } from './application/resources.service';
import { ResourcesController } from './interface/http/resources.controller';

@Module({
  imports: [TasksModule],
  controllers: [NonProjectRdController, ResourcesController],
  providers: [NonProjectRdService, ResourcesService],
  exports: [NonProjectRdService, ResourcesService],
})
export class OperationsModule {}
