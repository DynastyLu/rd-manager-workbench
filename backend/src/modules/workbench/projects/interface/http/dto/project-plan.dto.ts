import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProjectWorkItemViewDto {
  @IsIn(['LIST', 'BOARD', 'CALENDAR', 'GANTT'])
  type!: 'LIST' | 'BOARD' | 'CALENDAR' | 'GANTT';

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'])
  status?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';

  @IsOptional()
  @IsIn(['status', 'priority'])
  groupField?: 'status' | 'priority';

  @IsOptional()
  @IsArray()
  @IsIn(['assignee', 'dueAt', 'progress'], { each: true })
  hiddenFields?: Array<'assignee' | 'dueAt' | 'progress'>;

  @IsOptional()
  @IsIn(['DAY', 'WEEK', 'MONTH'])
  ganttScale?: 'DAY' | 'WEEK' | 'MONTH';
}

export class CreateProjectPlanBaselineDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class ProjectScheduleChangeDto {
  @IsIn(['TASK', 'MILESTONE'])
  entityType!: 'TASK' | 'MILESTONE';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsDateString()
  nextDate!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
