import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class KnowledgeCursorPageDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : undefined))
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class KnowledgeMessagePageDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : undefined))
  @IsString()
  @MaxLength(500)
  messageCursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  messageLimit?: number;
}
