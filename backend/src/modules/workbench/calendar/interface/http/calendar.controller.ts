import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CalendarService } from '../../application/calendar.service';
import {
  CreateCalendarEventDto,
  ListCalendarEntriesQueryDto,
  ListCalendarEventsQueryDto,
  UpdateCalendarEventDto,
} from './dto/calendar.dto';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get('entries')
  entries(@Query() query: ListCalendarEntriesQueryDto) {
    return this.service.listEntries(query);
  }

  @Get('events')
  listEvents(@Query() query: ListCalendarEventsQueryDto) {
    return this.service.listEvents(query);
  }

  @Post('events')
  createEvent(@Body() dto: CreateCalendarEventDto) {
    return this.service.createEvent(dto);
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string) {
    return this.service.getEvent(id);
  }

  @Patch('events/:id')
  updateEvent(@Param('id') id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.service.updateEvent(id, dto);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveEvent(@Param('id') id: string) {
    await this.service.archiveEvent(id);
  }
}
