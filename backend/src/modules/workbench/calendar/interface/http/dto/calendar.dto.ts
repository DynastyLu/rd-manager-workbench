import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CalendarEventType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListCalendarEntriesQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class ListCalendarEventsQueryDto extends ListCalendarEntriesQueryDto {}

export class CreateCalendarEventDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  location?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  link?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsEnum(CalendarEventType)
  type?: CalendarEventType;

  @Transform(trim)
  @IsOptional()
  @IsString()
  projectId?: string | null;
}

export class UpdateCalendarEventDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  location?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  link?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsEnum(CalendarEventType)
  type?: CalendarEventType;

  @Transform(trim)
  @IsOptional()
  @IsString()
  projectId?: string | null;
}
