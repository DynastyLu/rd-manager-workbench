import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/backend_core_platform?schema=platform';

export async function createE2eApp() {
  configureE2eEnvironment();
  const prisma = new PrismaClient({
    datasources: { db: { url: E2E_DATABASE_URL } },
  });
  await cleanupE2eAuthUsers(prisma);

  const appModuleImport = await import('../../../src/app.module');
  const AppModule = appModuleImport.AppModule ?? (appModuleImport as any).default;
  const { configureBodyParser } = await import('../../../src/bootstrap/body-parser');
  const { HttpExceptionFilter } = await import('../../../src/shared/filters/http-exception.filter');
  const { ResponseInterceptor } = await import('../../../src/shared/interceptors/response.interceptor');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureBodyParser(app);
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'sys/(.*)', method: RequestMethod.ALL },
      { path: 'label/(.*)', method: RequestMethod.ALL },
      { path: 'labelCategory/(.*)', method: RequestMethod.ALL },
      { path: 'audit/(.*)', method: RequestMethod.ALL },
      { path: 'authority/(.*)', method: RequestMethod.ALL },
      { path: 'dataResource/(.*)', method: RequestMethod.ALL },
      { path: 'open/(.*)', method: RequestMethod.ALL },
      { path: ':appId/sys/(.*)', method: RequestMethod.ALL },
      { path: ':basePath/:appId/sys/(.*)', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(app.get(HttpExceptionFilter));
  app.useGlobalInterceptors(app.get(ResponseInterceptor));
  await app.init();

  return { app, prisma };
}

export async function closeE2eApp(app: INestApplication | undefined, prisma: PrismaClient | undefined) {
  if (app) {
    await app.close();
  }
  if (prisma) {
    await cleanupE2eAuthUsers(prisma);
    await prisma.$disconnect();
  }
}

export async function cleanupE2eAuthUsers(prisma: PrismaClient) {
  await prisma.paperRefreshToken.deleteMany({
    where: { user: { username: { startsWith: 'e2e_' } } },
  });
  await prisma.paperUser.deleteMany({
    where: { username: { startsWith: 'e2e_' } },
  });
}

export function configureE2eEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.SERVICE_NAME = 'backend-core-platform';
  process.env.INSTANCE_ID = 'e2e';
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  process.env.ADMIN_USERNAME = 'e2e_admin';
  process.env.ADMIN_PASSWORD = 'changeme123';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.QUEUE_PREFIX = 'backend-core-platform-e2e';
  process.env.LOCAL_STORAGE_ROOT = 'var/e2e-storage';
}
