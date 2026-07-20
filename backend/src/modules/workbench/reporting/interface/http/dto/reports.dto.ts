import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.toUpperCase() : value;

export type ReportBucket = 'WEEK' | 'MONTH';
export type ReportKind = 'PORTFOLIO' | 'TASKS' | 'RISKS' | 'RESOURCES' | 'INTELLIGENCE';
export type ReportFormat = 'CSV' | 'XLSX';

export class ReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @Transform(upper) @IsOptional() @IsIn(['WEEK', 'MONTH']) bucket?: ReportBucket;
}

export class ResourceReportQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @Transform(upper) @IsOptional() @IsIn(['WEEK', 'MONTH']) bucket?: ReportBucket;
  @IsOptional() @IsDateString() fromWeek?: string;
  @IsOptional() @IsDateString() toWeek?: string;
}

export class ExportReportQueryDto extends ReportQueryDto {
  @Transform(upper) @IsIn(['PORTFOLIO', 'TASKS', 'RISKS', 'RESOURCES', 'INTELLIGENCE']) kind!: ReportKind;
  @Transform(upper) @IsIn(['CSV', 'XLSX']) format!: ReportFormat;
}
