import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ExtensionKind } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeStrings = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : value;

export class CreateExtensionProfileDto {
  @IsEnum(ExtensionKind)
  kind!: ExtensionKind;
  @Transform(trim) @IsString() @IsNotEmpty() @Matches(/^[A-Z][A-Z0-9_]{2,63}$/)
  provider!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;
  @IsOptional() @IsBoolean()
  enabled?: boolean;
  @IsObject()
  publicConfig!: Record<string, unknown>;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^credential:[A-Za-z0-9._:-]{1,180}$/)
  credentialRef?: string;
  @Transform(normalizeStrings) @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true })
  permissions?: string[];
}

export class UpdateExtensionProfileDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;
  @IsOptional() @IsBoolean()
  enabled?: boolean;
  @IsOptional() @IsObject()
  publicConfig?: Record<string, unknown>;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^credential:[A-Za-z0-9._:-]{1,180}$/)
  credentialRef?: string | null;
  @Transform(normalizeStrings) @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true })
  permissions?: string[];
}

export class PrepareExtensionRunDto {
  @Transform(trim) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  operation!: string;
  @IsObject()
  payload!: Record<string, unknown>;
}

export class StartExtensionRunDto extends PrepareExtensionRunDto {
  @IsString() @Matches(/^[0-9a-f]{64}$/)
  confirmationHash!: string;
}

export class CompleteExtensionRunDto {
  @IsString() @IsNotEmpty()
  completionToken!: string;
  @IsIn(['SUCCEEDED', 'FAILED', 'REJECTED'])
  status!: 'SUCCEEDED' | 'FAILED' | 'REJECTED';
  @IsOptional()
  output?: unknown;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  errorCode?: string;
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateSmsRecipientDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120)
  label!: string;
  @Transform(trim) @IsString() @Matches(/^\+?[0-9]{0,4}\*{4,12}[0-9]{2,4}$/)
  maskedPhone!: string;
  @Transform(trim) @IsString() @Matches(/^credential:[A-Za-z0-9._:-]{1,180}$/)
  credentialRef!: string;
  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

export class UpdateSmsRecipientDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  label?: string;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^\+?[0-9]{0,4}\*{4,12}[0-9]{2,4}$/)
  maskedPhone?: string;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^credential:[A-Za-z0-9._:-]{1,180}$/)
  credentialRef?: string;
  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

export class PrepareAiDto {
  @IsString() @IsIn(['AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'])
  operation!: 'AI_SUMMARIZE_MEETING' | 'AI_SUMMARIZE_DOCUMENT' | 'AI_KNOWLEDGE_QA';
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty()
  objectId?: string;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(4_000)
  question?: string;
}

export class PrepareAiRequestDto extends PrepareAiDto {
  @Transform(trim) @IsString() @IsNotEmpty()
  profileId!: string;
}

export class SyncPrepareDto {
  @Transform(trim) @IsString() @IsNotEmpty()
  profileId!: string;
  @IsObject()
  target!: Record<string, unknown>;
}

export class SyncStartDto {
  @IsString() @Matches(/^[0-9a-f]{64}$/)
  confirmationHash!: string;
}

export class SyncSessionCommitDto {
  @IsString() @Matches(/^[0-9a-f]{64}$/)
  preflightHash!: string;
  @IsArray() @ArrayMaxSize(500) @IsObject({ each: true })
  resolutions!: Array<Record<string, unknown>>;
}

export class AdoptAiDto {
  @Transform(trim) @IsString() @IsNotEmpty()
  runId!: string;
  @IsString() @IsIn(['AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'])
  operation!: 'AI_SUMMARIZE_MEETING' | 'AI_SUMMARIZE_DOCUMENT' | 'AI_KNOWLEDGE_QA';
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty()
  objectId?: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true })
  citationIds!: string[];
  @IsObject()
  output!: Record<string, unknown>;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500)
  title?: string;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty()
  spaceId?: string;
}
