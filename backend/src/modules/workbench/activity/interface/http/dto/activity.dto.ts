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
import { ActivityActorKind } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListActivitiesQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  employeeId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  objectType?: string;

  @IsOptional()
  @IsEnum(ActivityActorKind)
  actorKind?: ActivityActorKind;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
