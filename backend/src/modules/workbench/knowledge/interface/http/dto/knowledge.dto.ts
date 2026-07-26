import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

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

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  status?: string;
}
