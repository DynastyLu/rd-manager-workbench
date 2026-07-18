import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, ValidateIf } from 'class-validator';
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
}
