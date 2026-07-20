import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  ProcessExecutionError,
  ProcessRunner,
  SpawnProcess,
} from '../../../../src/modules/workbench/governance/infrastructure/process-runner';

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = jest.fn(() => true);
}

describe('ProcessRunner', () => {
  it('uses an executable allowlist, an argv array and shell:false', async () => {
    const child = new FakeChild();
    const spawn = jest.fn<ReturnType<SpawnProcess>, Parameters<SpawnProcess>>(() => child);
    const runner = new ProcessRunner({ allowedExecutables: ['pg_dump'], spawn });

    const completed = runner.run({
      executable: 'pg_dump',
      args: ['--format=custom', '--file=/tmp/database.dump', 'name; touch /tmp/pwned'],
    });
    child.stdout.end('done');
    child.stderr.end();
    child.emit('close', 0, null);

    await expect(completed).resolves.toEqual({ stdout: 'done', stderr: '' });
    expect(spawn).toHaveBeenCalledWith(
      'pg_dump',
      ['--format=custom', '--file=/tmp/database.dump', 'name; touch /tmp/pwned'],
      expect.objectContaining({ shell: false, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  it('rejects executables outside the configured allowlist before spawning', async () => {
    const spawn = jest.fn<ReturnType<SpawnProcess>, Parameters<SpawnProcess>>();
    const runner = new ProcessRunner({ allowedExecutables: ['pg_dump'], spawn });

    await expect(runner.run({ executable: 'sh', args: ['-c', 'exit 0'] })).rejects.toMatchObject({
      code: 'PROCESS_EXECUTABLE_FORBIDDEN',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('kills a timed out process and returns a stable timeout error', async () => {
    jest.useFakeTimers();
    const child = new FakeChild();
    const spawn = jest.fn<ReturnType<SpawnProcess>, Parameters<SpawnProcess>>(() => child);
    const runner = new ProcessRunner({ allowedExecutables: ['pg_dump'], spawn });

    const completed = runner.run({ executable: 'pg_dump', args: [], timeoutMs: 25 });
    const rejection = expect(completed).rejects.toMatchObject({ code: 'PROCESS_TIMEOUT' });
    await jest.advanceTimersByTimeAsync(25);

    await rejection;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  it('truncates and redacts sensitive stderr from failed commands', async () => {
    const child = new FakeChild();
    const spawn = jest.fn<ReturnType<SpawnProcess>, Parameters<SpawnProcess>>(() => child);
    const runner = new ProcessRunner({
      allowedExecutables: ['pg_restore'],
      maxOutputBytes: 96,
      spawn,
    });

    const completed = runner.run({ executable: 'pg_restore', args: [] });
    child.stdout.end();
    child.stderr.end(
      'failed postgresql://app:secret@127.0.0.1/db?token=abc password=hunter2 ' + 'x'.repeat(200),
    );
    child.emit('close', 1, null);

    let error: unknown;
    try {
      await completed;
    } catch (reason) {
      error = reason;
    }
    expect(error).toBeInstanceOf(ProcessExecutionError);
    if (!(error instanceof ProcessExecutionError)) throw error;
    expect(error.code).toBe('PROCESS_FAILED');
    expect(error.message).not.toMatch(/secret|hunter2|token=abc/);
    expect(error.stderr).not.toMatch(/secret|hunter2|token=abc/);
    expect(Buffer.byteLength(error.stderr)).toBeLessThanOrEqual(96);
  });
});
