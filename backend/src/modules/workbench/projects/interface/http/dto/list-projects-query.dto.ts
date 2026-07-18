import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ProjectStatus } from '@prisma/client';

const isDefined = (_object: object, value: unknown) => value !== undefined;

export class ListProjectsQueryDto {
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
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  search?: string;

  @ValidateIf(isDefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').map((id) => id.trim()) : value,
  )
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids?: string[];
}
