import { IsDateString } from 'class-validator';

export class UpsertTaskLaterDto {
  @IsDateString()
  deferredUntil!: string;
}
