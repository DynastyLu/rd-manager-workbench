import { IsDateString } from 'class-validator';

export class UpsertTaskReminderDto {
  @IsDateString()
  remindAt!: string;
}
