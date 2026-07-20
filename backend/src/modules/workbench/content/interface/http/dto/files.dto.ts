import { FileAssetStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListFilesQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  documentId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  projectId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  meetingId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  partnerId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  nonProjectRdItemId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  nonProjectRdOutcomeId?: string;

  @IsOptional()
  @IsEnum(FileAssetStatus)
  status?: FileAssetStatus;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class CreateFileDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  documentId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  projectId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  meetingId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  partnerId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  nonProjectRdItemId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  nonProjectRdOutcomeId?: string;
}

export class UpdateFileDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  documentId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  projectId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  meetingId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  partnerId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  nonProjectRdItemId?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  nonProjectRdOutcomeId?: string | null;
}

export class DownloadFileQueryDto {
  @IsOptional()
  @IsString()
  versionId?: string;
}
