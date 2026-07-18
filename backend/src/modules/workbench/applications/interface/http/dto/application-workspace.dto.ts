import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ApplicationNodeStatus,
  CorrectionStatus,
  MaterialReviewStatus,
  RequirementStatus,
  SubmissionStatus,
} from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateApplicationNodeDto {
  @IsEnum(ApplicationNodeStatus) status!: ApplicationNodeStatus;
}

export class CreateApplicationRequirementDto {
  @Transform(trimString) @IsString() @IsNotEmpty() code!: string;
  @Transform(trimString) @IsString() @IsNotEmpty() title!: string;
  @Transform(trimString) @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsEnum(RequirementStatus) status?: RequirementStatus;
  @Transform(trimString) @IsOptional() @IsString() applicationNodeId?: string;
}

export class UpdateApplicationRequirementDto {
  @Transform(trimString) @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @Transform(trimString) @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsEnum(RequirementStatus) status?: RequirementStatus;
  @Transform(trimString) @IsOptional() @IsString() applicationNodeId?: string;
}

export class CreateApplicationMaterialDto {
  @Transform(trimString) @IsString() @IsNotEmpty() code!: string;
  @Transform(trimString) @IsString() @IsNotEmpty() title!: string;
  @Transform(trimString) @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @Transform(trimString) @IsOptional() @IsString() applicationNodeId?: string;
}

export class CreateMaterialVersionDto {
  @Transform(trimString) @IsString() @IsNotEmpty() fileName!: string;
  @Transform(trimString) @IsOptional() @IsString() storageKey?: string;
  @Transform(trimString) @IsOptional() @IsString() checksum?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) fileSize?: number;
  @Transform(trimString) @IsOptional() @IsString() note?: string;
  @IsOptional() @IsEnum(MaterialReviewStatus) reviewStatus?: MaterialReviewStatus;
  @IsOptional() @IsBoolean() isFinal?: boolean;
}

export class CreateEvidenceRecordDto {
  @Transform(trimString) @IsString() @IsNotEmpty() title!: string;
  @Transform(trimString) @IsOptional() @IsString() description?: string;
  @Transform(trimString) @IsOptional() @IsString() sourceUri?: string;
  @IsOptional() @IsDateString() collectedAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  requirementIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  materialIds?: string[];
}

export class CreateCorrectionRecordDto {
  @Transform(trimString) @IsString() @IsNotEmpty() title!: string;
  @Transform(trimString) @IsOptional() @IsString() details?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsEnum(CorrectionStatus) status?: CorrectionStatus;
  @Transform(trimString) @IsOptional() @IsString() submissionRecordId?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  materialVersionIds?: string[];
}

export class CreateSubmissionRecordDto {
  @Transform(trimString) @IsOptional() @IsString() referenceNumber?: string;
  @Transform(trimString) @IsOptional() @IsString() submittedByName?: string;
  @IsOptional() @IsDateString() submittedAt?: string;
  @IsOptional() @IsEnum(SubmissionStatus) status?: SubmissionStatus;
  @Transform(trimString) @IsOptional() @IsString() note?: string;
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  materialVersionIds!: string[];
}
