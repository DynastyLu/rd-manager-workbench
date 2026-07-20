import { AuditOutcome } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBackupDto {}

export class ListBackupsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class UpdateGovernanceSettingsDto {
  @IsOptional() @IsBoolean() autoBackupEnabled?: boolean;
  @IsOptional() @IsString() @Matches(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/) autoBackupTimeLocal?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) retentionDays?: number;
}

export class ListAuditLogsQueryDto {
  @IsOptional() @IsString() @MaxLength(120) action?: string;
  @IsOptional() @IsString() @MaxLength(120) entityType?: string;
  @IsOptional() @IsEnum(AuditOutcome) outcome?: AuditOutcome;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class DataHealthQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  deep?: boolean;
}
