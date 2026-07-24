import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ResolveEmployeeImportRowDto {
  @IsInt()
  @Min(2)
  rowNumber!: number;

  @IsOptional()
  @IsString()
  employeeId?: string | null;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  taskId?: string | null;

  @IsOptional()
  @IsBoolean()
  keepUnlinked?: boolean;
}

export class ResolveEmployeeImportDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50_000)
  @ValidateNested({ each: true })
  @Type(() => ResolveEmployeeImportRowDto)
  rows!: ResolveEmployeeImportRowDto[];
}
