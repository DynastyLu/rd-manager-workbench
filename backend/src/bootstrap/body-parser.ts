import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

export const LOCAL_API_BODY_LIMIT = '1mb';

export function configureBodyParser(app: INestApplication) {
  app.use(json({ limit: LOCAL_API_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: LOCAL_API_BODY_LIMIT }));
}
