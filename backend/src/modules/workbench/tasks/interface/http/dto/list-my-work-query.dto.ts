import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

const isDefined = (_object: object, value: unknown) => value !== undefined;
const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export enum MyWorkView {
  INBOX = 'INBOX',
  TODAY = 'TODAY',
  WEEK = 'WEEK',
  OVERDUE = 'OVERDUE',
  LATER = 'LATER',
  COMPLETED = 'COMPLETED',
}

export class ListMyWorkQueryDto {
  @IsEnum(MyWorkView)
  view!: MyWorkView;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  projectId?: string;
}
