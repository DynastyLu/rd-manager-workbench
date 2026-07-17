import { describe, expect, it } from '@jest/globals'

import { parseEnvironment } from '../../src/infrastructure/config/env.schema'

const TEST_DATABASE_URL =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app'

const validEnvironment = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  DATABASE_ADMIN_URL: 'postgresql://dynastylu@127.0.0.1:5432/postgres',
  DATABASE_URL: TEST_DATABASE_URL,
  DATABASE_NAME: 'rd_manager_workbench_test',
  DATABASE_ROLE: 'rd_manager_workbench_app',
  INTERNAL_API_TOKEN: 'a'.repeat(43),
  APP_DATA_DIR: '/tmp/rd-manager-test',
  FILES_DIR: '/tmp/rd-manager-test/files',
}

describe('parseEnvironment', () => {
  it('accepts desktop mode on loopback with port zero', () => {
    const environment = parseEnvironment(validEnvironment)

    expect(environment).toMatchObject({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 0,
      LOG_LEVEL: 'info',
      ENABLE_SWAGGER: false,
    })
  })

  it.each(['debug', 'info', 'warn', 'error'] as const)('accepts the %s log level', (logLevel) => {
    const environment = parseEnvironment({
      ...validEnvironment,
      LOG_LEVEL: logLevel,
    })

    expect(environment.LOG_LEVEL).toBe(logLevel)
  })

  it('parses an explicitly enabled Swagger flag', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      ENABLE_SWAGGER: 'true',
    })

    expect(environment.ENABLE_SWAGGER).toBe(true)
  })

  it('rejects a non-loopback desktop host', () => {
    expect(() => parseEnvironment({ ...validEnvironment, HOST: '0.0.0.0' })).toThrow()
  })

  it('rejects a database name that differs from the database URL', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, DATABASE_NAME: 'rd_manager_workbench' }),
    ).toThrow('DATABASE_NAME')
  })

  it('rejects a production database URL while running tests', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL:
          'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        DATABASE_NAME: 'rd_manager_workbench',
      }),
    ).toThrow('test database')
  })

  it('rejects a database URL using a role other than the approved app role', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: TEST_DATABASE_URL.replace('rd_manager_workbench_app', 'postgres'),
      }),
    ).toThrow('DATABASE_ROLE')
  })

  it.each([
    ['a non-PostgreSQL URL', { DATABASE_URL: 'https://example.com/database' }],
    ['a non-PostgreSQL admin URL', { DATABASE_ADMIN_URL: 'https://example.com/postgres' }],
    ['a short internal token', { INTERNAL_API_TOKEN: 'too-short' }],
    ['a relative app data directory', { APP_DATA_DIR: './data' }],
    ['a relative files directory', { FILES_DIR: 'files' }],
    ['an out-of-range port', { PORT: '65536' }],
    ['an invalid log level', { LOG_LEVEL: 'fatal' }],
    ['an invalid Swagger flag', { ENABLE_SWAGGER: 'yes' }],
  ])('rejects %s', (_description, override) => {
    expect(() => parseEnvironment({ ...validEnvironment, ...override })).toThrow()
  })
})
