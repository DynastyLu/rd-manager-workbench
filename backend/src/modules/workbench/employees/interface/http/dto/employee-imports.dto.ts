import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ResolveEmployeeImportRowDto {
  @IsInt()
  @Min(2)
  @Max(1_048_576)
  rowNumber!: number;

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
}

export class ResolveEmployeeImportDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50_000)
  @ValidateNested({ each: true })
  @Type(() => ResolveEmployeeImportRowDto)
  rows!: ResolveEmployeeImportRowDto[];
}
