import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MilestoneStatus } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const isDefined = (_object: object, value: unknown) => value !== undefined;

export class CreateMilestoneDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateIf(isDefined)
  @IsDateString()
  plannedAt?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  plannedStartAt?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  plannedEndAt?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  actualAt?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  ownerName?: string;

  @ValidateIf(isDefined)
  @IsBoolean()
  isCritical?: boolean;

  @ValidateIf(isDefined)
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;

  @ValidateIf(isDefined)
  @IsNumber()
  @Min(0)
  @Max(100)
  weightPercent?: number;

  @ValidateIf(isDefined)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualCompletionPercent?: number;
}
