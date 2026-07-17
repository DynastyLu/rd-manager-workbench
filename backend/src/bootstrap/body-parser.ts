import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

export const AI_ASSISTANT_JSON_BODY_LIMIT = '10mb';

export function configureBodyParser(app: INestApplication) {
  app.use(json({ limit: AI_ASSISTANT_JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: AI_ASSISTANT_JSON_BODY_LIMIT }));
}
