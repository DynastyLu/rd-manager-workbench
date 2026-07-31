import { spawn as nodeSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

interface SpawnedProcess extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals): boolean;
}

interface SpawnOptions {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdio: ['ignore', 'pipe', 'pipe'];
}

export type SpawnProcess = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions,
) => SpawnedProcess;

export interface ProcessRunnerOptions {
  allowedExecutables: readonly string[];
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  spawn?: SpawnProcess;
}

export interface ProcessInvocation {
  executable: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export class ProcessExecutionError extends Error {
  constructor(
    readonly code:
      | 'PROCESS_EXECUTABLE_FORBIDDEN'
      | 'PROCESS_ARGUMENT_INVALID'
      | 'PROCESS_SPAWN_FAILED'
      | 'PROCESS_TIMEOUT'
      | 'PROCESS_FAILED',
    message: string,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'ProcessExecutionError';
  }
}

export class ProcessRunner {
  private readonly allowedExecutables: ReadonlySet<string>;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly spawn: SpawnProcess;

  constructor(options: ProcessRunnerOptions) {
    this.allowedExecutables = new Set(options.allowedExecutables);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 8_192;
    this.spawn = options.spawn ?? this.spawnProcess;
  }

  async run(invocation: ProcessInvocation): Promise<ProcessResult> {
    if (!this.allowedExecutables.has(invocation.executable)) {
      throw new ProcessExecutionError(
        'PROCESS_EXECUTABLE_FORBIDDEN',
        'The requested maintenance executable is not allowed',
      );
    }
    if (invocation.args.some((argument) => argument.includes('\0'))) {
      throw new ProcessExecutionError(
        'PROCESS_ARGUMENT_INVALID',
        'A maintenance process argument is invalid',
      );
    }

    const timeoutMs = invocation.timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<ProcessResult>((resolve, reject) => {
      let child: SpawnedProcess;
      try {
        child = this.spawn(invocation.executable, [...invocation.args], {
          cwd: invocation.cwd,
          env: invocation.env ?? process.env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        reject(
          new ProcessExecutionError('PROCESS_SPAWN_FAILED', 'Unable to start maintenance process'),
        );
        return;
      }

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const collectionLimit = this.maxOutputBytes * 4;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;

      const collect = (target: Buffer[], currentBytes: number, chunk: Buffer | string): number => {
        if (currentBytes >= collectionLimit) return currentBytes;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const accepted = bytes.subarray(0, collectionLimit - currentBytes);
        target.push(accepted);
        return currentBytes + accepted.length;
      };
      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutBytes = collect(stdout, stdoutBytes, chunk);
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderrBytes = collect(stderr, stderrBytes, chunk);
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new ProcessExecutionError('PROCESS_TIMEOUT', 'Maintenance process timed out'));
      }, timeoutMs);
      timeout.unref?.();

      child.once('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          new ProcessExecutionError('PROCESS_SPAWN_FAILED', 'Unable to start maintenance process'),
        );
      });
      child.once('close', (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const cleanStdout = this.cleanOutput(Buffer.concat(stdout).toString('utf8'));
        const cleanStderr = this.cleanOutput(Buffer.concat(stderr).toString('utf8'));
        if (exitCode === 0) {
          resolve({ stdout: cleanStdout, stderr: cleanStderr });
          return;
        }
        reject(
          new ProcessExecutionError(
            'PROCESS_FAILED',
            cleanStderr ? `Maintenance process failed: ${cleanStderr}` : 'Maintenance process failed',
            cleanStderr,
          ),
        );
      });
    });
  }

  private readonly spawnProcess: SpawnProcess = (executable, args, options) =>
    nodeSpawn(executable, [...args], options) as SpawnedProcess;

  private cleanOutput(output: string): string {
    const cleaned = output
      .replace(/\b(?:postgres(?:ql)?|https?|file):\/\/[^\s]+/gi, '[REDACTED_URL]')
      .replace(
        /\b(password|token|secret|api[_-]?key)\s*[=:]\s*[^\s]+/gi,
        '$1=[REDACTED]',
      )
      .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)+[^\\\s]*/g, '[REDACTED_PATH]')
      .replace(/\/(?:Users|home)\/[^\s]+/g, '[REDACTED_PATH]')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .trim();
    return Buffer.from(cleaned).subarray(0, this.maxOutputBytes).toString('utf8');
  }
}
