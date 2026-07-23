import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsInt,
  Max,
  Min,
  IsString,
  ValidateIf,
} from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimStringArray = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;
const isDefined = (_object: object, value: unknown) => value !== undefined;

export class CreateTaskDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  milestoneId?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  parentId?: string;

  @Transform(trimStringArray)
  @ValidateIf(isDefined)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  dependencyIds?: string[];

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  description?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  assigneeName?: string;

  @Transform(trimStringArray)
  @ValidateIf(isDefined)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  collaboratorNames?: string[];

  @ValidateIf(isDefined)
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ValidateIf(isDefined)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ValidateIf(isDefined)
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent?: number;

  @ValidateIf(isDefined)
  @IsDateString()
  dueAt?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  sourceType?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  sourceId?: string;
}
