import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ProjectPhase, ProjectStatus } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimStringArray = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

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
  @IsOptional()
  @IsString()
  type?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  researchDirection?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  objective?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  expectedOutcome?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  leadName?: string;

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  participantNames?: string[];

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

  @IsOptional()
  @IsEnum(ProjectPhase)
  phase?: ProjectPhase;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
