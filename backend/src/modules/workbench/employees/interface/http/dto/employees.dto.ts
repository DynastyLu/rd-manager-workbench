import {
  EmployeeImportRowStatus,
  EmployeePlanCarryStatus,
  EmployeePlanPriority,
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  EmployeeWorkStatus,
  EmploymentStatus,
  ProjectProgressDraftStatus,
} from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toNumber = ({ value }: { value: unknown }) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? value : Number(value);

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

const isDefined = (_object: object, value: unknown) => value !== undefined;

export const MAX_EMPLOYEE_PAGE = 1_000_000;
export const MAX_EMPLOYEE_PAGE_SIZE = 100;
export enum EmployeeArchiveState {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export class ListEmployeesQueryDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  q?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  department?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  workDirection?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ValidateIf(isDefined)
  @IsEnum(EmployeeArchiveState)
  archiveState?: EmployeeArchiveState;

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
  workDirection?: string;

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

export class ProgressPeriodQueryDto {
  @IsEnum(EmployeeProgressPeriod)
  periodType!: EmployeeProgressPeriod;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodStart!: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  department?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  projectId?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmployeeWorkStatus)
  status?: EmployeeWorkStatus;
}

export class ListEmployeeWorkItemsQueryDto extends ProgressPeriodQueryDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  employeeId?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  workDirection?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmployeeWorkKind)
  workKind?: EmployeeWorkKind;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  taskId?: string;

  @ValidateIf(isDefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDateFrom?: string;

  @ValidateIf(isDefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDateTo?: string;

  @Transform(toBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  riskOnly?: boolean;

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

export class ListEmployeeWeekPlansQueryDto extends ProgressPeriodQueryDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  employeeId?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  workDirection?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmployeePlanPriority)
  priority?: EmployeePlanPriority;

  @ValidateIf(isDefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDateFrom?: string;

  @ValidateIf(isDefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDateTo?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmployeePlanCarryStatus)
  carryStatus?: EmployeePlanCarryStatus;

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

export class UpdateEmployeeWeekPlanDto {
  @ValidateIf(isDefined)
  @IsEnum(EmployeeWorkKind)
  workKind?: EmployeeWorkKind;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  projectId?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  taskId?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  plannedCompletionAt?: string | null;

  @ValidateIf(isDefined)
  @IsEnum(EmployeePlanPriority)
  priority?: EmployeePlanPriority;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2_000)
  collaborationText?: string | null;
}

export class UpdateEmployeeWorkItemDto {
  @ValidateIf(isDefined)
  @IsEnum(EmployeeWorkKind)
  workKind?: EmployeeWorkKind;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  projectId?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  taskId?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  plannedCompletionAt?: string | null;

  @Transform(toNumber)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  plannedHours?: number | null;

  @Transform(toNumber)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  actualHours?: number | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2_000)
  riskText?: string | null;
}

export class CancelEmployeeWeekPlanDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class MatchEmployeeWeekPlanDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  workItemId!: string;
}

export class ExportEmployeeWorkItemsQueryDto extends ProgressPeriodQueryDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  employeeId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf(isDefined)
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';
}

export class ListEmployeeImportsQueryDto {
  @ValidateIf(isDefined)
  @IsEnum(EmployeeProgressPeriod)
  periodType?: EmployeeProgressPeriod;

  @ValidateIf(isDefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodStart?: string;

  @ValidateIf(isDefined)
  @IsEnum(EmployeeWorkImportStatus)
  status?: EmployeeWorkImportStatus;

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

export class EmployeeImportDetailQueryDto {
  @Transform(toNumber)
  @ValidateIf(isDefined)
  @IsInt()
  @Min(1)
  @Max(MAX_EMPLOYEE_PAGE)
  rowsPage?: number;

  @Transform(toNumber)
  @ValidateIf(isDefined)
  @IsInt()
  @Min(1)
  @Max(MAX_EMPLOYEE_PAGE_SIZE)
  rowsPageSize?: number;

  @ValidateIf(isDefined)
  @IsEnum(EmployeeImportRowStatus)
  rowStatus?: EmployeeImportRowStatus;

  @Transform(toBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  issuesOnly?: boolean;
}

export class ListProjectProgressDraftsQueryDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  sourceBatchId?: string;

  @ValidateIf(isDefined)
  @IsEnum(ProjectProgressDraftStatus)
  status?: ProjectProgressDraftStatus;
}

export class AdoptProjectProgressDraftDto {
  @Transform(toBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  createRisks?: boolean;

  @Transform(toBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  createTasks?: boolean;
}

export class IgnoreProjectProgressDraftDto {}
