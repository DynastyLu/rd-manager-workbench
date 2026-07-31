import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../../../src/modules/iam/application/auth.service';
import { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';
import { AuthController } from '../../../../src/modules/iam/interface/http/auth.controller';
import { AuthenticationGuard } from '../../../../src/modules/iam/interface/http/authentication.guard';
import {
  AllowBeforePasswordChange,
  ALLOW_BEFORE_PASSWORD_CHANGE_KEY,
  PUBLIC_ROUTE_KEY,
  Public,
} from '../../../../src/modules/iam/interface/http/public.decorator';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { AppError } from '../../../../src/shared/errors/app-error';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';
import { HealthController } from '../../../../src/modules/system/health/interface/http/health.controller';

const principal: AuthenticatedPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'tester',
  sessionId: 'session-1',
  mustChangePassword: false,
  roleCodes: ['EMPLOYEE'],
  permissions: [],
  permissionVersion: 0,
};

describe('AuthenticationGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'get' | 'getAllAndOverride'>>;
  let authService: jest.Mocked<Pick<AuthService, 'authenticateBearer'>>;
  let requestContext: RequestContextService;
  let guard: AuthenticationGuard;

  beforeEach(() => {
    reflector = {
      get: jest.fn().mockReturnValue(undefined),
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    authService = {
      authenticateBearer: jest.fn(),
    };
    requestContext = new RequestContextService();
    guard = new AuthenticationGuard(
      reflector as unknown as Reflector,
      authService as unknown as AuthService,
      requestContext,
    );
  });

  it('allows a public endpoint without credentials', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(executionContext('/api/auth/login'))).resolves.toBe(true);
    expect(authService.authenticateBearer).not.toHaveBeenCalled();
  });

  it('stores a verified principal in the current request context', async () => {
    authService.authenticateBearer.mockResolvedValue(principal);
    const context = requestContext.createContext();

    await requestContext.run(context, async () => {
      await expect(
        guard.canActivate(executionContext('/api/projects', 'Bearer access-token')),
      ).resolves.toBe(true);
      expect(requestContext.requirePrincipal()).toEqual(principal);
    });
  });

  it.each([
    ['missing credentials', undefined],
    ['an expired access token', 'Bearer expired-token'],
  ])('uses AUTH_REQUIRED for %s', async (_scenario, authorization) => {
    authService.authenticateBearer.mockRejectedValue(
      new AppError({
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Authentication required',
        statusCode: 401,
      }),
    );
    const context = requestContext.createContext();

    await requestContext.run(context, async () => {
      await expect(
        guard.canActivate(executionContext('/api/projects', authorization)),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH_REQUIRED, statusCode: 401 });
    });
    expect(authService.authenticateBearer).toHaveBeenCalledWith(authorization);
  });

  it('preserves AUTH_SESSION_REVOKED for a revoked active session', async () => {
    authService.authenticateBearer.mockRejectedValue(
      new AppError({
        code: ErrorCodes.AUTH_SESSION_REVOKED,
        message: 'Authentication session has been revoked',
        statusCode: 401,
      }),
    );
    const context = requestContext.createContext();

    await requestContext.run(context, async () => {
      await expect(
        guard.canActivate(executionContext('/api/projects', 'Bearer revoked-token')),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH_SESSION_REVOKED, statusCode: 401 });
    });
  });

  it('blocks business routes until the first password change is complete', async () => {
    authService.authenticateBearer.mockResolvedValue({
      ...principal,
      mustChangePassword: true,
    });
    const context = requestContext.createContext();

    await requestContext.run(context, async () => {
      await expect(
        guard.canActivate(executionContext('/api/projects', 'Bearer access-token')),
      ).rejects.toMatchObject({
        code: ErrorCodes.AUTH_PASSWORD_CHANGE_REQUIRED,
        statusCode: 403,
      });
    });
  });

  it('does not trust a request URL that looks like an allowed auth route', async () => {
    authService.authenticateBearer.mockResolvedValue({
      ...principal,
      mustChangePassword: true,
    });
    const context = requestContext.createContext();

    await requestContext.run(context, async () => {
      await expect(
        guard.canActivate(executionContext('/api/auth/me', 'Bearer access-token')),
      ).rejects.toMatchObject({
        code: ErrorCodes.AUTH_PASSWORD_CHANGE_REQUIRED,
        statusCode: 403,
      });
    });
  });

  it('allows a handler explicitly marked for first-password-change flow regardless of URL prefix', async () => {
    class Controller {
      @AllowBeforePasswordChange()
      changePassword() {}
    }
    authService.authenticateBearer.mockResolvedValue({
      ...principal,
      mustChangePassword: true,
    });
    const context = requestContext.createContext();
    const metadataGuard = new AuthenticationGuard(
      new Reflector(),
      authService as unknown as AuthService,
      requestContext,
    );

    await requestContext.run(context, async () => {
      await expect(
        metadataGuard.canActivate(
          executionContext(
            '/desktop-prefix/credentials',
            'Bearer access-token',
            'POST',
            Controller.prototype.changePassword,
            Controller,
          ),
        ),
      ).resolves.toBe(true);
    });
    expect(
      Reflect.getMetadata(
        ALLOW_BEFORE_PASSWORD_CHANGE_KEY,
        Controller.prototype.changePassword,
      ),
    ).toBe(true);
  });

  it('ignores password-change allowance metadata placed on a controller class', async () => {
    class Controller {
      me() {}
    }
    Reflect.defineMetadata(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, true, Controller);
    authService.authenticateBearer.mockResolvedValue({
      ...principal,
      mustChangePassword: true,
    });
    const context = requestContext.createContext();
    const metadataGuard = new AuthenticationGuard(
      new Reflector(),
      authService as unknown as AuthService,
      requestContext,
    );

    await requestContext.run(context, async () => {
      await expect(
        metadataGuard.canActivate(
          executionContext(
            '/api/auth/me',
            'Bearer access-token',
            'GET',
            Controller.prototype.me,
            Controller,
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.AUTH_PASSWORD_CHANGE_REQUIRED,
        statusCode: 403,
      });
    });
  });

  it('uses explicit metadata to declare public endpoints', () => {
    class Controller {
      @Public()
      csrf() {}
    }

    expect(Reflect.getMetadata(PUBLIC_ROUTE_KEY, Controller.prototype.csrf)).toBe(true);
  });

  it('marks only bootstrap status, login, refresh, logout, csrf and health as public', () => {
    const publicAuthMethods = [
      'bootstrapStatus',
      'csrf',
      'login',
      'refresh',
      'logout',
    ] as const;
    for (const method of publicAuthMethods) {
      expect(Reflect.getMetadata(PUBLIC_ROUTE_KEY, AuthController.prototype[method])).toBe(true);
    }

    expect(Reflect.getMetadata(PUBLIC_ROUTE_KEY, AuthController.prototype.me)).not.toBe(true);
    expect(Reflect.getMetadata(PUBLIC_ROUTE_KEY, AuthController.prototype.changePassword)).not.toBe(
      true,
    );
    expect(
      Reflect.getMetadata(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, AuthController.prototype.me),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_BEFORE_PASSWORD_CHANGE_KEY,
        AuthController.prototype.changePassword,
      ),
    ).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_ROUTE_KEY, HealthController)).toBe(true);
  });
});

function executionContext(
  originalUrl: string,
  authorization?: string,
  method = 'GET',
  targetHandler?: (...args: never[]) => unknown,
  targetClass?: new (...args: never[]) => unknown,
): ExecutionContext {
  const request = {
    method,
    originalUrl,
    url: originalUrl,
    headers: { authorization },
  };
  const handler = targetHandler ?? (() => undefined);
  class DefaultController {}
  const Controller = targetClass ?? DefaultController;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => Controller,
    getArgs: () => [request],
    getArgByIndex: (index: number) => [request][index],
    switchToRpc: () => undefined,
    switchToWs: () => undefined,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}
