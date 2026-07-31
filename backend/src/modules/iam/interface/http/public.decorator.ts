import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_KEY = 'iam.public-route';
export const ALLOW_BEFORE_PASSWORD_CHANGE_KEY = 'iam.allow-before-password-change';

export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
export const AllowBeforePasswordChange = (): MethodDecorator =>
  SetMetadata(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, true);
