import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  NonProjectOutcomeStatus,
  NonProjectRdKind,
  NonProjectRdStatus,
  TaskPriority,
} from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListNonProjectRdQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  q?: string;

  @IsOptional()
  @IsEnum(NonProjectRdKind)
  kind?: NonProjectRdKind;

  @IsOptional()
  @IsEnum(NonProjectRdStatus)
  status?: NonProjectRdStatus;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  plannedFrom?: string;

  @IsOptional()
  @IsDateString()
  plannedTo?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateNonProjectRdDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsEnum(NonProjectRdKind)
  kind!: NonProjectRdKind;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objective?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  expectedOutcome?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ownerName?: string;

  @IsOptional()
  @IsDateString()
  plannedStartAt?: string;

  @IsOptional()
  @IsDateString()
  plannedEndAt?: string;

  @IsOptional()
  @IsDateString()
  actualStartAt?: string;

  @IsOptional()
  @IsDateString()
  actualEndAt?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedPersonHours?: number;

  @IsOptional()
  @IsEnum(NonProjectRdStatus)
  status?: NonProjectRdStatus;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  impactScope?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  severity?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  suggestedProjectName?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outcomeWaivedReason?: string;
}

export class UpdateNonProjectRdDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsEnum(NonProjectRdKind)
  kind?: NonProjectRdKind;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objective?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  expectedOutcome?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ownerName?: string | null;

  @IsOptional()
  @IsDateString()
  plannedStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEndAt?: string | null;

  @IsOptional()
  @IsDateString()
  actualStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  actualEndAt?: string | null;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedPersonHours?: number;

  @IsOptional()
  @IsEnum(NonProjectRdStatus)
  status?: NonProjectRdStatus;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  impactScope?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  severity?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  suggestedProjectName?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outcomeWaivedReason?: string | null;
}

export class CreateNonProjectRdOutcomeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  summary?: string;

  @IsOptional()
  @IsEnum(NonProjectOutcomeStatus)
  status?: NonProjectOutcomeStatus;

  @IsOptional()
  @IsDateString()
  verifiedAt?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  evidenceNote?: string;
}

export class UpdateNonProjectRdOutcomeDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  summary?: string | null;

  @IsOptional()
  @IsEnum(NonProjectOutcomeStatus)
  status?: NonProjectOutcomeStatus;

  @IsOptional()
  @IsDateString()
  verifiedAt?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  evidenceNote?: string | null;
}

export class CreateNonProjectTaskDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assigneeName?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}
