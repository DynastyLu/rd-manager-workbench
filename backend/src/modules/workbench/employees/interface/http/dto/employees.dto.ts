import { EmploymentStatus } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toNumber = ({ value }: { value: unknown }) => Number(value);

export class ListEmployeesQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  q?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class CreateEmployeeDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  department?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  weeklyCapacityHours?: number;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  developmentGoal?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
