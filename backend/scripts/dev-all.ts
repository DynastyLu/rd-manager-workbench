import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..');
const env = { ...process.env, ...readDotEnv(path.join(projectRoot, '.env')) };
const args = new Set(process.argv.slice(2));
const children = new Map<string, ChildProcess>();

async function main() {
  if (!args.has('--skip-infra')) {
    await startInfrastructure();
  }

  await runStep('pnpm', ['run', 'prisma:generate']);
  await runStep('pnpm', ['run', 'prisma:migrate:deploy']);
  await runStep('pnpm', ['run', 'build']);

  spawnService('api', 'node', ['dist/src/main.js'], {
    SERVICE_NAME: env.SERVICE_NAME || 'backend-core-platform-api',
    INSTANCE_ID: env.INSTANCE_ID || 'local-api',
  });
  spawnService('ocr-worker', 'node', ['dist/src/workers/ocr-worker.main.js'], {
    SERVICE_NAME: 'backend-core-platform-ocr-worker',
    INSTANCE_ID: 'local-ocr-worker',
  });

  console.log('\nbackend-core-platform is starting:');
  console.log(`- API: http://${env.HOST || '127.0.0.1'}:${env.PORT || '3000'}`);
  console.log('- OCR worker: running in this process group');
  console.log('\nPress Ctrl+C to stop API and worker. Infrastructure containers stay up.');
}

function runStep(command: string, commandArgs: string[]) {
  console.log(`\n$ ${[command, ...commandArgs].join(' ')}`);
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${commandArgs.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function startInfrastructure() {
  const infraServices = getInfraServices(env);
  try {
    await runStep('docker', ['compose', 'up', '-d', ...infraServices]);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
    console.warn('Docker compose did not start infrastructure. Checking local services...');
  }

  await waitForTcp('postgres', getDatabaseHost(env), getDatabasePort(env));
  await waitForTcp('redis', env.REDIS_HOST || '127.0.0.1', Number(env.REDIS_PORT || 6379));
}

function spawnService(
  name: string,
  command: string,
  commandArgs: string[],
  extraEnv: Record<string, string>,
) {
  console.log(`\n$ ${[command, ...commandArgs].join(' ')} # ${name}`);
  const child = spawn(command, commandArgs, {
    cwd: projectRoot,
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
  });
  children.set(name, child);

  child.on('error', (error) => {
    console.error(`[${name}] failed to start:`, error);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }
    console.error(`[${name}] exited with ${signal || code}`);
    shutdown(typeof code === 'number' ? code : 1);
  });

  return child;
}

function getInfraServices(values: Record<string, string>) {
  const services = ['postgres', 'redis'];
  if ((values.STORAGE_DRIVER || '').toLowerCase() === 's3') {
    services.push('minio', 'minio-setup');
  }
  return services;
}

function waitForTcp(name: string, host: string, port: number, timeoutMs = 60_000) {
  const startedAt = Date.now();
  return new Promise<void>((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(1_000);
      socket.once('connect', () => {
        socket.destroy();
        console.log(`${name} is ready at ${host}:${port}`);
        resolve();
      });
      const retry = () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`${name} did not become ready at ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 1_000);
      };
      socket.once('error', retry);
      socket.once('timeout', retry);
    };
    attempt();
  });
}

function getDatabaseHost(values: Record<string, string>) {
  try {
    return new URL(values.DATABASE_URL || '').hostname || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

function getDatabasePort(values: Record<string, string>) {
  try {
    return Number(new URL(values.DATABASE_URL || '').port || 5432);
  } catch {
    return 5432;
  }
}

function readDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  ) as Record<string, string>;
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children.values()) {
    child.kill('SIGTERM');
  }
  if (children.size === 0) {
    process.exit(code);
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});
