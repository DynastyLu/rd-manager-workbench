import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SEARCH_TYPES, SearchAction, SearchType } from '../../../domain/search.types';

const SERVER_ACTIONS: SearchAction[] = [
  'COMPLETE_TASK',
  'REOPEN_TASK',
  'TOGGLE_DOCUMENT_FAVORITE',
  'CLOSE_RISK',
];

export class GlobalSearchQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((type) => type.trim())
          .filter(Boolean)
      : value,
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SEARCH_TYPES.length)
  @IsIn(SEARCH_TYPES, { each: true })
  types?: SearchType[];

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SearchActionParamsDto {
  @IsIn(SEARCH_TYPES)
  type!: SearchType;

  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class RunSearchActionDto {
  @IsIn(SERVER_ACTIONS)
  action!: SearchAction;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
