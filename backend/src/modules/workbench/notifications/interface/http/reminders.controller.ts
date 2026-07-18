import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RemindersService } from '../../application/reminders.service';
import { CreateReminderRuleDto, ListReminderRulesQueryDto } from './dto/reminders.dto';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly service: RemindersService) {}

  @Get()
  list(@Query() query: ListReminderRulesQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateReminderRuleDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }
}
