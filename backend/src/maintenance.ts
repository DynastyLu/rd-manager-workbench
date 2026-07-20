import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RestoreEngine, RestoreInput } from './modules/workbench/governance/infrastructure/restore-engine';

const MAX_INPUT_BYTES = 16_384;

async function readInput(): Promise<RestoreInput & { maintenanceToken: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_INPUT_BYTES) throw new Error('Maintenance input is too large');
    chunks.push(bytes);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  for (const key of ['backupId', 'preflightId', 'confirmationToken', 'expectedHash', 'maintenanceToken']) {
    if (typeof value[key] !== 'string' || value[key] === '') throw new Error('Maintenance input is invalid');
  }
  return {
    backupId: String(value.backupId),
    preflightId: String(value.preflightId),
    confirmationToken: String(value.confirmationToken),
    expectedHash: String(value.expectedHash),
    maintenanceToken: String(value.maintenanceToken),
  };
}

async function main() {
  if (process.argv[2] !== 'restore') throw new Error('Maintenance command is not allowed');
  process.env.RD_MAINTENANCE_MODE = '1';
  const input = await readInput();
  const expectedToken = process.env.RD_MAINTENANCE_TOKEN;
  if (!expectedToken || input.maintenanceToken !== expectedToken) {
    throw new Error('Maintenance authorization failed');
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const engine = app.get(RestoreEngine);
    await engine.restore({
      backupId: input.backupId,
      preflightId: input.preflightId,
      confirmationToken: input.confirmationToken,
      expectedHash: input.expectedHash,
    });
    process.stdout.write('{"restored":true}\n');
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  process.stderr.write('Restore maintenance failed\n');
  process.exitCode = 1;
});
