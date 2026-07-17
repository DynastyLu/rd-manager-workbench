import { IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name!: string;

  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
