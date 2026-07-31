import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { IamModule } from '../../../../src/modules/iam/iam.module';
import { AuthController } from '../../../../src/modules/iam/interface/http/auth.controller';
import { AuthenticationGuard } from '../../../../src/modules/iam/interface/http/authentication.guard';
import { PermissionGuard } from '../../../../src/modules/iam/interface/http/permission.guard';

describe('IamModule throttling boundary', () => {
  it('applies throttling only to AuthController and authentication globally', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IamModule) as unknown[];
    const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, AuthController) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: APP_GUARD,
          useClass: AuthenticationGuard,
        }),
      ]),
    );
    expect(controllerGuards).toEqual(expect.arrayContaining([ThrottlerGuard]));
  });

  it('registers PermissionGuard as the second global guard after authentication', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IamModule) as unknown[];
    const globalGuards = providers.filter(
      (provider): provider is { provide: typeof APP_GUARD; useClass: unknown } =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === APP_GUARD,
    );

    expect(globalGuards.map(({ useClass }) => useClass)).toEqual([
      AuthenticationGuard,
      PermissionGuard,
    ]);
  });
});
