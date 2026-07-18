import { INestApplication } from '@nestjs/common';

export const LOCAL_FRONTEND_ORIGIN = 'http://127.0.0.1:4312';

export function configureLocalCors(app: INestApplication): void {
  app.enableCors({
    origin: LOCAL_FRONTEND_ORIGIN,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}
