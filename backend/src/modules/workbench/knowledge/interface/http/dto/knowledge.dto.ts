import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { KnowledgeCursorPageDto } from './knowledge-pagination.dto';

export class CreateSessionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value : ''))
  @IsString()
  @IsNotEmpty()
  question!: string;
}

export class ChatMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value : ''))
  @IsString()
  @IsNotEmpty()
  question!: string;
}

export class KnowledgeScopeDto {
  @IsIn(['ALL', 'PROJECT', 'SPACE', 'FOLDER', 'DOCUMENTS', 'RECENT'])
  type!: 'ALL' | 'PROJECT' | 'SPACE' | 'FOLDER' | 'DOCUMENTS' | 'RECENT';

  @ValidateIf((scope: KnowledgeScopeDto) => scope.type === 'PROJECT')
  @IsString()
  @IsNotEmpty()
  projectId?: string;

  @ValidateIf((scope: KnowledgeScopeDto) => scope.type === 'SPACE')
  @IsString()
  @IsNotEmpty()
  spaceId?: string;

  @ValidateIf((scope: KnowledgeScopeDto) => scope.type === 'FOLDER')
  @IsString()
  @IsNotEmpty()
  folderWatchId?: string;

  @ValidateIf((scope: KnowledgeScopeDto) => scope.type === 'DOCUMENTS')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  documentIds?: string[];
}

export class ListSessionsQueryDto extends KnowledgeCursorPageDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : undefined))
  @IsString()
  @MaxLength(60)
  search?: string;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => KnowledgeScopeDto)
  scope?: KnowledgeScopeDto;
}
