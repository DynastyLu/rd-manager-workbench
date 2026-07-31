import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS, RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { DecisionsService } from '../../application/decisions.service';
import { CreateDecisionDto, CreateSourceTaskDto, ListDecisionsQueryDto, UpdateDecisionDto } from './dto/management.dto';
@Controller('decisions')
@RequirePermissions(PERMISSIONS.DECISION_READ)
export class DecisionsController { constructor(private readonly service:DecisionsService){} @Get() list(@Query()q:ListDecisionsQueryDto){return this.service.list(q)} @Post() @RequirePermissions(PERMISSIONS.DECISION_CREATE) create(@Body()d:CreateDecisionDto){return this.service.create(d)} @Get(':id')get(@Param('id')id:string){return this.service.get(id)} @Patch(':id')@RequirePermissions(PERMISSIONS.DECISION_UPDATE)update(@Param('id')id:string,@Body()d:UpdateDecisionDto){return this.service.update(id,d)} @Delete(':id')@HttpCode(HttpStatus.NO_CONTENT)@RequirePermissions(PERMISSIONS.DECISION_DELETE)async archive(@Param('id')id:string){await this.service.archive(id)} @Post(':id/task')@RequirePermissions(PERMISSIONS.TASK_CREATE)task(@Param('id')id:string,@Body()d:CreateSourceTaskDto){return this.service.createFollowUpTask(id,d)} }
