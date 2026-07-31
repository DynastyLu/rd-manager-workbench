import { PostgresToolsService } from '../../../../src/modules/workbench/governance/application/postgres-tools.service';

describe('PostgresToolsService', () => {
  it('discovers Windows PostgreSQL installations and parses compatible major versions', async () => {
    const run = jest.fn().mockImplementation(({ executable }: { executable: string }) => {
      if (
        executable === 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe'
        || executable === 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe'
      ) {
        return Promise.resolve({
          stdout: executable.includes('pg_dump')
            ? 'pg_dump (PostgreSQL) 17.5'
            : 'pg_restore (PostgreSQL) 17.5',
          stderr: '',
        });
      }
      return Promise.reject(new Error('PATH miss'));
    });
    const service = new PostgresToolsService(
      { run } as never,
      {
        platform: 'win32',
        programFiles: 'C:\\Program Files',
        programFilesX86: 'C:\\Program Files (x86)',
      },
    );

    const status = await service.inspect();

    expect(status.pgDump).toMatchObject({
      available: true,
      executable: 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
      version: 17,
    });
    expect(status.pgRestore).toMatchObject({
      available: true,
      executable: 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe',
      version: 17,
    });
  });

  it('rejects missing and pre-15 tools', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ stdout: 'pg_dump (PostgreSQL) 14.9', stderr: '' })
      .mockRejectedValue(new Error('missing'));
    const service = new PostgresToolsService({ run } as never, { platform: 'linux' });

    await expect(service.requireCompatible('pg_dump')).rejects.toThrow(
      'POSTGRES_TOOL_UNAVAILABLE',
    );
    await expect(service.requireCompatible('pg_restore')).rejects.toThrow(
      'POSTGRES_TOOL_UNAVAILABLE',
    );
  });
});
