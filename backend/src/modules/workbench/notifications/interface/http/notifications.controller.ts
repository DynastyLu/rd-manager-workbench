import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../../application/notifications.service';
import { ReminderSchedulerService } from '../../application/reminder-scheduler.service';
import {
  ListNotificationsQueryDto,
  ScanNotificationsDto,
  SnoozeNotificationDto,
} from './dto/notifications.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly scheduler: ReminderSchedulerService,
  ) {}

  @Get()
  list(@Query() query: ListNotificationsQueryDto) {
    return this.service.list(query);
  }

  @Put(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(@Param('id') id: string) {
    await this.service.dismiss(id);
  }

  @Put(':id/snooze')
  snooze(@Param('id') id: string, @Body() dto: SnoozeNotificationDto) {
    return this.service.snooze(id, dto);
  }

  @Post('test/scan')
  scan(@Body() dto: ScanNotificationsDto) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.scheduler.scanDue(dto.now ? new Date(dto.now) : new Date());
  }
}
