import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from '@jest/globals'

import { formatBootstrapFailure } from '../../src/commands/bootstrap-database'
import {
  BootstrapEnvironmentError,
  loadBootstrapEnvironment,
  parseBootstrapEnvironment,
} from '../../src/infrastructure/database/bootstrap-env'

const createdDirectories: string[] = []

const productionEnvironment = {
  NODE_ENV: 'development',
  DATABASE_ADMIN_URL: 'postgresql://dynastylu@127.0.0.1:5432/postgres?application_name=production',
  DATABASE_URL:
    'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app&connection_limit=5',
  DATABASE_NAME: 'rd_manager_workbench',
  DATABASE_ROLE: 'rd_manager_workbench_app',
} as const

const testEnvironment = {
  NODE_ENV: 'test',
  DATABASE_ADMIN_URL: 'postgresql://dynastylu@127.0.0.1:5432/postgres?application_name=test',
  DATABASE_URL:
    'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app&connection_limit=5',
  DATABASE_NAME: 'rd_manager_workbench_test',
  DATABASE_ROLE: 'rd_manager_workbench_app',
} as const

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

describe('parseBootstrapEnvironment', () => {
  it('accepts the approved production bootstrap environment', () => {
    expect(parseBootstrapEnvironment(productionEnvironment)).toEqual(productionEnvironment)
  })

  it('accepts only the approved test database when NODE_ENV is test', () => {
    expect(parseBootstrapEnvironment(testEnvironment)).toEqual(testEnvironment)
    expect(() => parseBootstrapEnvironment({ ...productionEnvironment, NODE_ENV: 'test' })).toThrow(
      'BOOTSTRAP_CONFIG_INVALID',
    )
  })

  it('rejects a database URL whose role differs from the approved role', () => {
    expect(() =>
      parseBootstrapEnvironment({
        ...productionEnvironment,
        DATABASE_URL: productionEnvironment.DATABASE_URL.replace(
          'rd_manager_workbench_app',
          'postgres',
        ),
      }),
    ).toThrow('BOOTSTRAP_CONFIG_INVALID')
  })
})

describe('loadBootstrapEnvironment', () => {
  it('applies example, local override, then explicit process environment precedence', () => {
    const workspaceRoot = createWorkspaceRoot()
    writeEnvironmentFile(path.join(workspaceRoot, '.env.example'), productionEnvironment)
    writeEnvironmentFile(path.join(workspaceRoot, '.env.local'), testEnvironment)
    const explicitEnvironment = {
      ...productionEnvironment,
      NODE_ENV: 'production',
      DATABASE_ADMIN_URL:
        'postgresql://dynastylu@127.0.0.1:5432/postgres?application_name=explicit',
    }

    expect(
      loadBootstrapEnvironment({ workspaceRoot, processEnvironment: explicitEnvironment }),
    ).toEqual(explicitEnvironment)
  })

  it('loads defaults when the optional local environment file is absent', () => {
    const workspaceRoot = createWorkspaceRoot()
    writeEnvironmentFile(path.join(workspaceRoot, '.env.example'), productionEnvironment)

    expect(loadBootstrapEnvironment({ workspaceRoot, processEnvironment: {} })).toEqual(
      productionEnvironment,
    )
  })

  it('fails with a stable code when the required example file is absent', () => {
    const workspaceRoot = createWorkspaceRoot()

    expect(() => loadBootstrapEnvironment({ workspaceRoot, processEnvironment: {} })).toThrow(
      'BOOTSTRAP_DEFAULTS_MISSING',
    )
  })

  it('does not mutate the supplied process environment or copy unrelated file entries', () => {
    const workspaceRoot = createWorkspaceRoot()
    writeEnvironmentFile(path.join(workspaceRoot, '.env.example'), {
      ...productionEnvironment,
      UNRELATED_SECRET: 'must-not-leak',
    })
    const processEnvironment = { PATH: '/usr/local/bin' }

    const result = loadBootstrapEnvironment({ workspaceRoot, processEnvironment })

    expect(processEnvironment).toEqual({ PATH: '/usr/local/bin' })
    expect(result).not.toHaveProperty('UNRELATED_SECRET')
  })
})

describe('formatBootstrapFailure', () => {
  it('returns a stable diagnostic code without echoing an unknown error message', () => {
    const secret =
      'postgresql://rd_manager_workbench_app:do-not-print@127.0.0.1/rd_manager_workbench'

    const output = formatBootstrapFailure(new Error(`connection failed for ${secret}`))

    expect(output).toBe('Database bootstrap failed [BOOTSTRAP_FAILED].')
    expect(output).not.toContain(secret)
    expect(output).not.toContain('do-not-print')
  })

  it('preserves a known safe configuration error code', () => {
    expect(
      formatBootstrapFailure(new BootstrapEnvironmentError('BOOTSTRAP_DEFAULTS_MISSING')),
    ).toBe('Database bootstrap failed [BOOTSTRAP_DEFAULTS_MISSING].')
  })
})

function createWorkspaceRoot(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-manager-bootstrap-env-'))
  createdDirectories.push(directory)
  return directory
}

function writeEnvironmentFile(filePath: string, values: Record<string, string>): void {
  const contents = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  fs.writeFileSync(filePath, `${contents}\n`, { encoding: 'utf8', mode: 0o600 })
}
