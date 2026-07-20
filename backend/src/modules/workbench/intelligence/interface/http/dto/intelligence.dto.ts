import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  IntelligenceCollectionFrequency,
  IntelligenceBriefKind,
  IntelligenceItemStatus,
  IntelligencePriority,
  IntelligenceRunStatus,
  IntelligenceSourceKind,
  RiskImpact,
  RiskLevel,
  RiskLikelihood,
  TaskPriority,
} from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeStrings = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : value;

export class PageQueryDto {
  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ListTopicsQueryDto extends PageQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  q?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;
}

export class CreateTopicDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @Transform(normalizeStrings)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  keywords?: string[];

  @Transform(normalizeStrings)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  projectIds?: string[];
}

export class UpdateTopicDto {
  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string | null;

  @Transform(normalizeStrings)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  keywords?: string[];

  @Transform(normalizeStrings)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  projectIds?: string[];
}

export class ListSourcesQueryDto extends PageQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  q?: string;

  @IsOptional()
  @IsEnum(IntelligenceSourceKind)
  kind?: IntelligenceSourceKind;
}

export class CreateSourceDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(IntelligenceSourceKind)
  kind!: IntelligenceSourceKind;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  credibility?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string;
}

export class UpdateSourceDto {
  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(IntelligenceSourceKind)
  kind?: IntelligenceSourceKind;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string | null;

  @Transform(({ value }) => (value === null ? null : Number(value)))
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  credibility?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string | null;
}

export class ListPlansQueryDto extends PageQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  q?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceId?: string;

  @IsOptional()
  @IsEnum(IntelligenceCollectionFrequency)
  frequency?: IntelligenceCollectionFrequency;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreatePlanDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  sourceId!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(IntelligenceCollectionFrequency)
  frequency!: IntelligenceCollectionFrequency;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/)
  runAtLocalTime?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  connectorProfileId?: string;
}

export class UpdatePlanDto {
  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  sourceId?: string;

  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(IntelligenceCollectionFrequency)
  frequency?: IntelligenceCollectionFrequency;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/)
  runAtLocalTime?: string | null;

  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  connectorProfileId?: string | null;
}

export class ManualRunItemDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() summary?: string;
  @Transform(trim) @IsOptional() @IsString() impact?: string;
  @Transform(trim) @IsOptional() @IsString() recommendation?: string;
  @Transform(trim) @IsOptional() @IsString() canonicalUrl?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsEnum(IntelligencePriority) priority?: IntelligencePriority;
  @IsOptional() @IsEnum(IntelligenceItemStatus) status?: IntelligenceItemStatus;
  @Transform(trim) @IsOptional() @IsString() sourceUrl?: string;
  @Transform(trim) @IsOptional() @IsString() rawTitle?: string;
  @Transform(trim) @IsOptional() @IsString() rawSummary?: string;
  @Transform(normalizeStrings) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) topicIds?: string[];
  @Transform(normalizeStrings) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) projectIds?: string[];
}

export class RecordManualRunDto {
  @IsIn([IntelligenceRunStatus.SUCCEEDED, IntelligenceRunStatus.FAILED])
  status!: IntelligenceRunStatus;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  itemCount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ManualRunItemDto)
  items?: ManualRunItemDto[];

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  inputSummary?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  errorCode?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  errorMessage?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  finishedAt?: string;
}

export class ListRunsQueryDto extends PageQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  planId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceId?: string;

  @IsOptional()
  @IsEnum(IntelligenceRunStatus)
  status?: IntelligenceRunStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListItemsQueryDto extends PageQueryDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() q?: string;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() topicId?: string;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() sourceId?: string;
  @IsOptional() @IsEnum(IntelligencePriority) priority?: IntelligencePriority;
  @IsOptional() @IsEnum(IntelligenceItemStatus) status?: IntelligenceItemStatus;
  @IsOptional() @IsDateString() publishedFrom?: string;
  @IsOptional() @IsDateString() publishedTo?: string;
}

export class CreateItemDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() summary?: string;
  @Transform(trim) @IsOptional() @IsString() impact?: string;
  @Transform(trim) @IsOptional() @IsString() recommendation?: string;
  @Transform(trim) @IsOptional() @IsString() canonicalUrl?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsEnum(IntelligencePriority) priority?: IntelligencePriority;
  @IsOptional() @IsEnum(IntelligenceItemStatus) status?: IntelligenceItemStatus;
  @Transform(trim) @IsString() @IsNotEmpty() sourceId!: string;
  @Transform(trim) @IsOptional() @IsString() sourceUrl?: string;
  @Transform(trim) @IsOptional() @IsString() rawTitle?: string;
  @Transform(trim) @IsOptional() @IsString() rawSummary?: string;
  @Transform(normalizeStrings) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) topicIds?: string[];
  @Transform(normalizeStrings) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) projectIds?: string[];
}

export class UpdateItemDto {
  @Transform(trim) @ValidateIf((_object, value) => value !== undefined) @IsString() @IsNotEmpty() title?: string;
  @Transform(trim) @IsOptional() @IsString() summary?: string | null;
  @Transform(trim) @IsOptional() @IsString() impact?: string | null;
  @Transform(trim) @IsOptional() @IsString() recommendation?: string | null;
  @Transform(trim) @IsOptional() @IsString() canonicalUrl?: string | null;
  @IsOptional() @IsDateString() publishedAt?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(IntelligencePriority) priority?: IntelligencePriority;
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(IntelligenceItemStatus) status?: IntelligenceItemStatus;
  @Transform(normalizeStrings) @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) topicIds?: string[];
  @Transform(normalizeStrings) @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) projectIds?: string[];
}

export class ConvertItemToTaskDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() description?: string;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() assigneeName?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
}

export class ConvertItemToRiskDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() description?: string;
  @IsEnum(RiskLikelihood) likelihood!: RiskLikelihood;
  @IsEnum(RiskImpact) impact!: RiskImpact;
  @IsEnum(RiskLevel) level!: RiskLevel;
  @Transform(trim) @IsOptional() @IsString() mitigation?: string;
  @Transform(trim) @IsOptional() @IsString() ownerName?: string;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
}

export class ConvertItemToMeetingAgendaDto {
  @Transform(trim) @IsString() @IsNotEmpty() meetingId!: string;
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() description?: string;
}

export class ConvertItemToKnowledgePageDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() plainText?: string;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() spaceId?: string;
}

export class ListBriefsQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(IntelligenceBriefKind) kind?: IntelligenceBriefKind;
}

export class SaveBriefDto {
  @IsEnum(IntelligenceBriefKind) kind!: IntelligenceBriefKind;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) briefDate!: string;
  @Transform(trim) @IsOptional() @IsString() title?: string;
  @Transform(trim) @IsOptional() @IsString() introduction?: string | null;
  @Transform(normalizeStrings) @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) itemIds!: string[];
}
