import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { LoadEntryKind, SkillLevel } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class ListResourcesQueryDto {
  @Transform(trim) @IsOptional() @IsString() q?: string;
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(1) page?: number;
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
export class CreateResourceDto {
  @Transform(trim) @IsString() @IsNotEmpty() displayName!: string;
  @Transform(trim) @IsOptional() @IsString() roleTitle?: string;
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(0) @Max(168) weeklyCapacityHours?: number;
  @Transform(trim) @IsOptional() @IsString() developmentGoal?: string;
  @Transform(trim) @IsOptional() @IsString() notes?: string;
}
export class UpdateResourceDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() displayName?: string;
  @Transform(trim) @IsOptional() @IsString() roleTitle?: string | null;
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(0) @Max(168) weeklyCapacityHours?: number;
  @Transform(trim) @IsOptional() @IsString() developmentGoal?: string | null;
  @Transform(trim) @IsOptional() @IsString() notes?: string | null;
}
export class CreateResourceSkillDto {
  @Transform(trim) @IsString() @IsNotEmpty() name!: string;
  @IsEnum(SkillLevel) level!: SkillLevel;
  @Transform(trim) @IsOptional() @IsString() evidence?: string;
  @IsOptional() @IsDateString() assessedAt?: string;
}
export class UpdateResourceSkillDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEnum(SkillLevel) level?: SkillLevel;
  @Transform(trim) @IsOptional() @IsString() evidence?: string | null;
  @IsOptional() @IsDateString() assessedAt?: string | null;
}
export class CreateResourceLoadDto {
  @IsDateString() weekStartAt!: string;
  @IsEnum(LoadEntryKind) kind!: LoadEntryKind;
  @Transform(trim) @IsOptional() @IsString() nonProjectRdItemId?: string;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() taskId?: string;
  @Transform(({ value }) => Number(value)) @IsNumber() @Min(0) @Max(9999) plannedHours!: number;
  @Transform(trim) @IsOptional() @IsString() note?: string;
}
export class UpdateResourceLoadDto {
  @IsOptional() @IsDateString() weekStartAt?: string;
  @IsOptional() @IsEnum(LoadEntryKind) kind?: LoadEntryKind;
  @Transform(trim) @IsOptional() @IsString() nonProjectRdItemId?: string | null;
  @Transform(trim) @IsOptional() @IsString() projectId?: string | null;
  @Transform(trim) @IsOptional() @IsString() taskId?: string | null;
  @Transform(({ value }) => Number(value)) @IsOptional() @IsNumber() @Min(0) @Max(9999) plannedHours?: number;
  @Transform(trim) @IsOptional() @IsString() note?: string | null;
}
export class LoadSummaryQueryDto {
  @IsDateString() fromWeek!: string;
  @IsDateString() toWeek!: string;
}
