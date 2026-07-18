import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';

const isDefined = (_object: object, value: unknown) => value !== undefined;

export class ListTasksQueryDto {
  @ValidateIf(isDefined)
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ValidateIf(isDefined)
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @ValidateIf(isDefined)
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  assigneeName?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  dueBefore?: string;

  @ValidateIf(isDefined)
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
}
