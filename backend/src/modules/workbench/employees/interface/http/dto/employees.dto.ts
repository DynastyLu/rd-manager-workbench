import { EmploymentStatus } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, ValidateIf } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toNumber = ({ value }: { value: unknown }) =>
  value === null || (typeof value === 'string' && value.trim() === '')
    ? value
    : Number(value);

const isDefined = (_object: object, value: unknown) => value !== undefined;

export const MAX_EMPLOYEE_PAGE = 1_000_000;
export const MAX_EMPLOYEE_PAGE_SIZE = 100;

export class ListEmployeesQueryDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  q?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  department?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @Transform(toNumber)
  @ValidateIf(isDefined)
  @IsInt()
  @Min(1)
  @Max(MAX_EMPLOYEE_PAGE)
  page?: number;

  @Transform(toNumber)
  @ValidateIf(isDefined)
  @IsInt()
  @Min(1)
  @Max(MAX_EMPLOYEE_PAGE_SIZE)
  pageSize?: number;
}

export class CreateEmployeeDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  department?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  roleTitle?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  managerName?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @Transform(toNumber)
  @ValidateIf(isDefined)
  @IsInt()
  @Min(0)
  @Max(168)
  weeklyCapacityHours?: number;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  developmentGoal?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  notes?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto, {
  skipNullProperties: false,
}) {}
