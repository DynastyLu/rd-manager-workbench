import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
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

  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent!: number;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  blockers?: string;
}
