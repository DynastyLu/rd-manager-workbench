import path from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ProcessRunner } from '../infrastructure/process-runner';

export const POSTGRES_TOOL_OPTIONS = Symbol('POSTGRES_TOOL_OPTIONS');

export type PostgresToolName = 'pg_dump' | 'pg_restore';

export interface PostgresToolOptions {
  platform?: NodeJS.Platform;
  programFiles?: string;
  programFilesX86?: string;
}

export interface PostgresToolStatus {
  available: boolean;
  executable?: string;
  version?: number;
}

const SUPPORTED_MAJOR_VERSION = 15;
const WINDOWS_VERSION_CANDIDATES = ['17', '18', '16', '15', '14', '13', '12'];

export function postgresToolCandidates(
  tool: PostgresToolName,
  options: PostgresToolOptions = {},
): string[] {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return [tool];

  const executable = `${tool}.exe`;
  const roots = [options.programFiles, options.programFilesX86].filter(
    (value): value is string => Boolean(value),
  );
  const candidates = [executable];
  for (const version of WINDOWS_VERSION_CANDIDATES) {
    for (const root of roots) {
      candidates.push(path.win32.join(root, 'PostgreSQL', version, 'bin', executable));
    }
  }
  return [...new Set(candidates)];
}

@Injectable()
export class PostgresToolsService {
  constructor(
    private readonly runner: ProcessRunner,
    @Optional()
    @Inject(POSTGRES_TOOL_OPTIONS)
    private readonly options: PostgresToolOptions = {
      platform: process.platform,
      programFiles: process.env.ProgramFiles,
      programFilesX86: process.env['ProgramFiles(x86)'],
    },
  ) {}

  async inspectTool(tool: PostgresToolName): Promise<PostgresToolStatus> {
    for (const executable of postgresToolCandidates(tool, this.options)) {
      try {
        const result = await this.runner.run({
          executable,
          args: ['--version'],
          env: process.env,
        });
        const version = Number(result.stdout.match(/(\d+)(?:\.\d+)?/)?.[1]);
        return {
          available: true,
          executable,
          version: Number.isInteger(version) ? version : undefined,
        };
      } catch {
        // Continue through the Windows installation locations when PATH is not configured.
      }
    }
    return { available: false };
  }

  async inspect() {
    const [pgDump, pgRestore] = await Promise.all([
      this.inspectTool('pg_dump'),
      this.inspectTool('pg_restore'),
    ]);
    return { pgDump, pgRestore };
  }

  async requireCompatible(tool: PostgresToolName): Promise<Required<PostgresToolStatus>> {
    const status = await this.inspectTool(tool);
    if (
      !status.available
      || !status.executable
      || !status.version
      || status.version < SUPPORTED_MAJOR_VERSION
    ) {
      throw new Error(
        `POSTGRES_TOOL_UNAVAILABLE: ${tool} ${SUPPORTED_MAJOR_VERSION}+ is required`,
      );
    }
    return status as Required<PostgresToolStatus>;
  }
}
