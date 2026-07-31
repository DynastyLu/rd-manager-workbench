import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AppEnv } from '../../../../src/infrastructure/config/env.schema';
import { AuthService } from '../../../../src/modules/iam/application/auth.service';
import { BootstrapService } from '../../../../src/modules/iam/application/bootstrap.service';
import { AuthController } from '../../../../src/modules/iam/interface/http/auth.controller';

describe('AuthController refresh cookie policy', () => {
  it('preserves the refresh cookie on an unexpected internal refresh failure', async () => {
    const auth = {
      refresh: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as AuthService;
    const config = {
      get: jest.fn((key: keyof AppEnv) => {
        if (key === 'AUTH_COOKIE_NAME') return 'rd_refresh';
        if (key === 'AUTH_COOKIE_SECURE') return false;
        return undefined;
      }),
    } as unknown as ConfigService<AppEnv, true>;
    const controller = new AuthController(auth, {} as BootstrapService, config);
    const request = {
      cookies: { rd_refresh: 'raw-refresh-token' },
      header: jest.fn(),
      socket: {},
    } as unknown as Request;
    const response = {
      clearCookie: jest.fn(),
      cookie: jest.fn(),
    } as unknown as Response;

    await expect(controller.refresh('valid-csrf', request, response)).rejects.toThrow(
      'database unavailable',
    );
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});
