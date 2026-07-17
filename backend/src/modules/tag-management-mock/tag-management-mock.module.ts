/** 将标签管理文档接口的内存 Mock controller/service 注册到后端应用。 */
import { Module } from '@nestjs/common';
import { TagManagementMockController } from './interface/http/tag-management-mock.controller';
import { TagManagementMockService } from './tag-management-mock.service';

@Module({
  controllers: [TagManagementMockController],
  providers: [TagManagementMockService],
})
export class TagManagementMockModule {}
