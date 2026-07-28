import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsNotEmpty,
  IsString,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const isDefined = (_object: object, value: unknown) => value !== undefined;

export class CreateProgressReportDto {
  @IsDefined()
  @IsDateString()
  reportedAt!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  summary!: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  blockers?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  completedResults?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  nextSteps?: string;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  milestoneId?: string;
}
