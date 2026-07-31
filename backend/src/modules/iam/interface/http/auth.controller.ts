import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppEnv } from '../../../../infrastructure/config/env.schema';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { AuthService, AuthenticationResult } from '../../application/auth.service';
import { BootstrapService } from '../../application/bootstrap.service';
import type { AuthenticatedPrincipal } from '../../domain/principal';
import { AllowBeforePasswordChange, Public } from './public.decorator';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { CurrentUser } from './current-user.decorator';

@Throttle({
  ip: { limit: 200, ttl: 60_000 },
  identifier: { limit: 200, ttl: 60_000 },
})
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly bootstrapService: BootstrapService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Get('bootstrap/status')
  @Public()
  bootstrapStatus() {
    return this.bootstrapService.status();
  }

  @Get('csrf')
  @Public()
  csrf(@Req() request: Request) {
    return this.authService.csrfToken(this.refreshToken(request));
  }

  @Post('login')
  @Public()
  @Throttle({
    ip: { limit: 60, ttl: 60_000 },
    identifier: { limit: 20, ttl: 60_000 },
  })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(input, requestMeta(request));
    this.setRefreshCookie(response, result);
    return publicAuthenticationResult(result);
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.refresh(
        this.refreshToken(request),
        requiredCsrfToken(csrfToken),
        requestMeta(request),
      );
      this.setRefreshCookie(response, result);
      return publicAuthenticationResult(result);
    } catch (error) {
      if (shouldClearRefreshCookie(error)) {
        this.clearRefreshCookie(response);
      }
      throw error;
    }
  }

  @Post('logout')
  @Public()
  async logout(
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.optionalRefreshToken(request);
    if (refreshToken) {
      await this.authService.logout(
        refreshToken,
        requiredCsrfToken(csrfToken),
        requestMeta(request),
      );
    }
    this.clearRefreshCookie(response);
    return { loggedOut: true };
  }

  @Get('me')
  @AllowBeforePasswordChange()
  async me(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.authService.me(principal);
  }

  @Post('change-password')
  @AllowBeforePasswordChange()
  async changePassword(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: ChangePasswordDto,
  ) {
    return this.authService.changePassword(principal, input.currentPassword, input.newPassword);
  }

  @Get('sessions')
  async sessions(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.authService.sessions(principal);
  }

  @Delete('sessions')
  async revokeAllSessions(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.authService.revokeAllSessions(principal);
  }

  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') sessionId: string,
  ) {
    await this.authService.revokeSession(principal, sessionId);
    return { revoked: true };
  }

  private setRefreshCookie(response: Response, result: AuthenticationResult): void {
    response.cookie(this.environment('AUTH_COOKIE_NAME'), result.refreshToken, {
      httpOnly: true,
      secure: this.environment('AUTH_COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/api/auth',
      expires: result.refreshExpiresAt,
    });
  }

  private refreshToken(request: Request): string {
    const token = this.optionalRefreshToken(request);
    if (!token) {
      throw new AppError({
        code: ErrorCodes.AUTH_REFRESH_INVALID,
        message: 'Refresh token is invalid or expired',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }
    return token;
  }

  private optionalRefreshToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.environment('AUTH_COOKIE_NAME')];
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.environment('AUTH_COOKIE_NAME'), {
      httpOnly: true,
      secure: this.environment('AUTH_COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  private environment<Key extends keyof AppEnv>(key: Key): AppEnv[Key] {
    const value = this.config.get(key);
    if (value === undefined) {
      throw new Error(`Missing required application configuration: ${key}`);
    }
    return value;
  }
}

function publicAuthenticationResult(result: AuthenticationResult) {
  return {
    accessToken: result.accessToken,
    csrfToken: result.csrfToken,
    user: result.user,
    mustChangePassword: result.mustChangePassword,
  };
}

function requestMeta(request: Request) {
  const deviceHeader = request.header('x-device-name');
  return {
    deviceName: deviceHeader || undefined,
    userAgent: request.header('user-agent') || undefined,
    ipAddress: request.ip || request.socket.remoteAddress,
  };
}

function requiredCsrfToken(value: string | undefined): string {
  if (!value) {
    throw new AppError({
      code: ErrorCodes.AUTH_CSRF_INVALID,
      message: 'Refresh request CSRF token is invalid',
      statusCode: HttpStatus.FORBIDDEN,
    });
  }
  return value;
}

function shouldClearRefreshCookie(error: unknown): boolean {
  const unrecoverableRefreshErrors = new Set<string>([
    ErrorCodes.AUTH_REFRESH_INVALID,
    ErrorCodes.AUTH_REFRESH_REPLAYED,
    ErrorCodes.AUTH_REQUIRED,
    ErrorCodes.AUTH_SESSION_NOT_FOUND,
  ]);
  return error instanceof AppError && unrecoverableRefreshErrors.has(error.code);
}
