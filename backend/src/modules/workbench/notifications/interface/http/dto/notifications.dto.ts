import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { NotificationStatus } from '@prisma/client';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class SnoozeNotificationDto {
  @IsDateString()
  snoozeUntil!: string;
}

export class ScanNotificationsDto {
  @IsOptional()
  @IsDateString()
  now?: string;
}
