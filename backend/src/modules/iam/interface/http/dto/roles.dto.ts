import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DataScope } from '@prisma/client';

export class RolePermissionGrantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  permissionCode!: string;

  @IsEnum(DataScope)
  dataScope!: DataScope;

  @IsOptional()
  @IsObject()
  scopeConfig?: Record<string, unknown> | null;
}

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Za-z][A-Za-z0-9_-]*$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionGrantDto)
  permissions?: RolePermissionGrantDto[];
}

export class CopyRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Za-z][A-Za-z0-9_-]*$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class ReplaceRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionGrantDto)
  permissions!: RolePermissionGrantDto[];
}
