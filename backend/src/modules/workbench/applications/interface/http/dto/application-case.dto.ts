import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApplicationCaseStatus } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateApplicationCaseDto {
  @Transform(trimString) @IsString() @IsNotEmpty() code!: string;
  @Transform(trimString) @IsString() @IsNotEmpty() title!: string;
  @Transform(trimString) @IsString() @IsNotEmpty() projectId!: string;
  @Transform(trimString) @IsString() @IsNotEmpty() workflowTemplateId!: string;
  @Transform(trimString) @IsOptional() @IsString() subjectName?: string;
  @Transform(trimString) @IsOptional() @IsString() region?: string;
  @Transform(trimString) @IsOptional() @IsString() organization?: string;
  @Transform(trimString) @IsOptional() @IsString() batch?: string;
  @IsOptional() @IsDateString() deadlineAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  collaboratorNames?: string[];
  @IsOptional() @IsEnum(ApplicationCaseStatus) status?: ApplicationCaseStatus;
}

export class UpdateApplicationCaseDto {
  @Transform(trimString) @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @Transform(trimString) @IsOptional() @IsString() subjectName?: string;
  @Transform(trimString) @IsOptional() @IsString() region?: string;
  @Transform(trimString) @IsOptional() @IsString() organization?: string;
  @Transform(trimString) @IsOptional() @IsString() batch?: string;
  @IsOptional() @IsDateString() deadlineAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  collaboratorNames?: string[];
  @IsOptional() @IsEnum(ApplicationCaseStatus) status?: ApplicationCaseStatus;
}

export class ListApplicationCasesQueryDto {
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsNotEmpty()
  page?: number;
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsNotEmpty()
  pageSize?: number;
  @IsOptional() @IsString() @IsNotEmpty() projectId?: string;
  @IsOptional() @IsEnum(ApplicationCaseStatus) status?: ApplicationCaseStatus;
}
