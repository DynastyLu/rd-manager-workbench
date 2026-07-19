import { DataFieldType, DataTableSource, DataViewType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value;

export class CreateWorkspaceDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

export class UpdateWorkspaceDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

export class CreateTableDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(50) icon?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

export class UpdateTableDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(50) icon?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

export class CreateFieldDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  key!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsEnum(DataFieldType) type!: DataFieldType;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  inverseFieldName?: string;
  @IsOptional() @IsBoolean() inverseMultiple?: boolean;
}

export class UpdateFieldDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsEnum(DataFieldType) type?: DataFieldType;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

export class RecordValuesDto {
  @IsObject() values!: Record<string, unknown>;
}

export class FormulaPreviewDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) expression!: string;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() recordId?: string;
}

export class ListRecordsQueryDto {
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(300, { each: true })
  recordIds?: string[];
  @Transform(trim) @IsOptional() @IsString() @MaxLength(500) query?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(100) filterField?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(500) filterValue?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(100) sortField?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(1) page?: number;
  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

export class CreateViewDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsEnum(DataViewType) type!: DataViewType;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

export class UpdateViewDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsEnum(DataViewType) type?: DataViewType;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) sequence?: number;
}

// Re-exported for consumers that build exhaustive UI mappings from the API contract.
export { DataFieldType, DataTableSource, DataViewType };
