import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  identifier!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe = false;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  newPassword!: string;
}

export class ConnectionTicketDto {
  @IsIn(['knowledge-sse', 'notification-socket'])
  audience!: 'knowledge-sse' | 'notification-socket';
}
