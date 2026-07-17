import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';

@Module({
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
