import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class EmployeeWorkbookTemplateQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([2])
  version!: number;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodStart!: string;
}

const isRowNumberRequired = (row: ResolveEmployeeImportRowDto) =>
  row.rowNumber !== undefined || row.rowId === undefined;
const isRowIdRequired = (row: ResolveEmployeeImportRowDto) =>
  row.rowId !== undefined || row.rowNumber === undefined;

export class CreateEmployeeFromImportDto {
  @IsString()
  @MaxLength(200)
  @Matches(/\S/)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workDirection?: string;
}

export class ResolveEmployeeImportRowDto {
  @ValidateIf(isRowNumberRequired)
  @IsInt()
  @Min(1)
  @Max(1_048_576)
  rowNumber?: number;

  @ValidateIf(isRowIdRequired)
  @IsString()
  @MaxLength(200)
  @Matches(/\S/)
  rowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/\S/)
  employeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/\S/)
  projectId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/\S/)
  taskId?: string | null;

  @IsOptional()
  @IsBoolean()
  keepUnlinked?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEmployeeFromImportDto)
  createEmployee?: CreateEmployeeFromImportDto;

  @IsOptional()
  @IsBoolean()
  updateEmployeeProfile?: boolean;

  @IsOptional()
  @IsIn(['PROJECT', 'NON_PROJECT'])
  workKind?: 'PROJECT' | 'NON_PROJECT';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999.99)
  plannedHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999.99)
  actualHours?: number;

  @IsOptional()
  @IsIn(['KEEP', 'REMOVE', 'EDIT'])
  riskDecision?: 'KEEP' | 'REMOVE' | 'EDIT';

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  riskText?: string;
}

export class ResolveEmployeeImportDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50_000)
  @ValidateNested({ each: true })
  @Type(() => ResolveEmployeeImportRowDto)
  rows!: ResolveEmployeeImportRowDto[];
}
