import { Module } from '@nestjs/common';
import { CalendarService } from './application/calendar.service';
import { CalendarController } from './interface/http/calendar.controller';

@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
