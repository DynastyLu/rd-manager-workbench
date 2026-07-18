import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ReminderSourceType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListReminderRulesQueryDto {
  @IsEnum(ReminderSourceType)
  sourceType!: ReminderSourceType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  sourceId!: string;
}

export class CreateReminderRuleDto extends ListReminderRulesQueryDto {
  @IsDateString()
  remindAt!: string;
}
