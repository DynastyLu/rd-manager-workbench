import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, jest } from '@jest/globals'

import type { Environment } from '../../src/infrastructure/config/env.schema'
import { RequestContextService } from '../../src/infrastructure/context/request-context.service'
import { AppLoggerService } from '../../src/infrastructure/logger/app-logger.service'

const DATABASE_URL =
  'postgresql://rd_manager_workbench_app:database-secret@127.0.0.1/rd_manager_workbench'
const INTERNAL_API_TOKEN = 'logger-test-token-with-at-least-32-characters'

interface SerializedLogLine {
  timestamp: string
  level: string
  service: string
  message: string
  context: string
  traceId?: string
}

function createLogger(
  logLevel: Environment['LOG_LEVEL'],
  requestContext = new RequestContextService(),
): AppLoggerService {
  const values: Pick<Environment, 'DATABASE_URL' | 'INTERNAL_API_TOKEN' | 'LOG_LEVEL'> = {
    DATABASE_URL,
    INTERNAL_API_TOKEN,
    LOG_LEVEL: logLevel,
  }
  const config = {
    get: (key: keyof typeof values) => values[key],
  } as unknown as ConfigService<Environment, true>

  return new AppLoggerService(config, requestContext)
}

describe('AppLoggerService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('writes one structured JSON line with request correlation', () => {
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const requestContext = new RequestContextService()
    const logger = createLogger('debug', requestContext)
    const traceId = '00000000-0000-4000-8000-000000000001'

    requestContext.run({ traceId, sourceIp: '127.0.0.1', startedAt: 1_752_764_400_000 }, () =>
      logger.log('Health probe ready', 'HealthController'),
    )

    const logLine = JSON.parse(String(output.mock.calls[0]?.[0])) as SerializedLogLine
    expect(logLine).toMatchObject({
      level: 'info',
      service: 'rd-manager-backend',
      message: 'Health probe ready',
      context: 'HealthController',
      traceId,
    })
    expect(new Date(logLine.timestamp).toISOString()).toBe(logLine.timestamp)
  })

  it('filters messages below the configured log level', () => {
    const standardOutput = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const errorOutput = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const logger = createLogger('warn')

    logger.debug('hidden debug')
    logger.log('hidden info')
    logger.warn('visible warning')

    expect(standardOutput).not.toHaveBeenCalled()
    expect(errorOutput).toHaveBeenCalledTimes(1)
  })

  it('never serializes exception details or configured secrets', () => {
    const errorOutput = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const logger = createLogger('error')
    const exception = new Error(`token=${INTERNAL_API_TOKEN}; database=${DATABASE_URL}`)

    logger.error(exception, exception.stack, DATABASE_URL)

    const serializedLine = String(errorOutput.mock.calls[0]?.[0])
    expect(serializedLine).not.toContain(INTERNAL_API_TOKEN)
    expect(serializedLine).not.toContain(DATABASE_URL)
    expect(serializedLine).not.toContain('database-secret')
    expect(serializedLine).not.toContain(exception.stack)
  })
})
