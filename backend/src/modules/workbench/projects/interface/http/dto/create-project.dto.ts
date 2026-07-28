import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import {
  ProjectHealth,
  ProjectPhase,
  ProjectStatus,
  ProjectWeightMode,
} from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimStringArray = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

const isDefined = (_object: object, value: unknown) => value !== undefined;

export class CreateProjectDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  code!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  type?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  researchDirection?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  objective?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  expectedOutcome?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  leadName?: string;

  @Transform(trimStringArray)
  @ValidateIf(isDefined)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  participantNames?: string[];

  @ValidateIf(isDefined)
  @IsDateString()
  plannedStartAt?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  plannedEndAt?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  actualStartAt?: string;

  @ValidateIf(isDefined)
  @IsDateString()
  actualEndAt?: string;

  @ValidateIf(isDefined)
  @IsEnum(ProjectPhase)
  phase?: ProjectPhase;

  @ValidateIf(isDefined)
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ValidateIf(isDefined)
  @IsEnum(ProjectWeightMode)
  weightMode?: ProjectWeightMode;

  @ValidateIf(isDefined)
  @IsEnum(ProjectHealth)
  healthOverride?: ProjectHealth;
}
