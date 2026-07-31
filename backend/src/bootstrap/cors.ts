import { INestApplication } from '@nestjs/common';

export const LOCAL_FRONTEND_ORIGIN = 'http://127.0.0.1:4312';

/**
 * Response headers the frontend reads cross-origin. Without these the browser
 * hides them from fetch: download filenames fall back to "download" and
 * import provenance headers become unreadable on the dev origin.
 */
export const EXPOSED_RESPONSE_HEADERS = ['Content-Disposition', 'X-Source-Batch-Ids'];

export function configureLocalCors(
  app: INestApplication,
  allowedOrigins: string[] = [LOCAL_FRONTEND_ORIGIN],
): void {
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: EXPOSED_RESPONSE_HEADERS,
  });
}
