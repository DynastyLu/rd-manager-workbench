import { Controller, Get, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  RequirePermissions,
} from '../../../../iam/interface/http/permissions.decorator';
import { ActivityService } from '../../application/activity.service';
import { ListActivitiesQueryDto } from './dto/activity.dto';

@Controller('activities')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ACTIVITY_READ)
  list(@Query() query: ListActivitiesQueryDto) {
    return this.service.list(query);
  }
}
