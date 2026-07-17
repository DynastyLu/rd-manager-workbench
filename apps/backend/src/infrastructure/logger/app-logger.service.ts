import { Injectable, type LoggerService } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Environment } from '../config/env.schema'
import { RequestContextService } from '../context/request-context.service'

type LogLevel = Environment['LOG_LEVEL']

interface StructuredLogLine {
  timestamp: string
  level: LogLevel
  service: 'rd-manager-backend'
  message: string
  context: string
  traceId?: string
}

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"'<>]+/giu
const NAMED_SECRET_PATTERN = /\b(token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/giu

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly configuredLevel: LogLevel
  private readonly configuredSecrets: readonly string[]

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly requestContext: RequestContextService,
  ) {
    this.configuredLevel = this.config.get('LOG_LEVEL', { infer: true })
    this.configuredSecrets = [
      this.config.get('INTERNAL_API_TOKEN', { infer: true }),
      this.config.get('DATABASE_URL', { infer: true }),
    ]
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams)
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams)
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams)
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams)
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams)
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams)
  }

  private write(level: LogLevel, message: unknown, optionalParams: readonly unknown[]): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.configuredLevel]) {
      return
    }

    const traceId = this.requestContext.get()?.traceId
    const logLine: StructuredLogLine = {
      timestamp: new Date().toISOString(),
      level,
      service: 'rd-manager-backend',
      message: this.serializeMessage(message),
      context: this.resolveContext(optionalParams),
      ...(traceId ? { traceId } : {}),
    }
    const serializedLine = `${JSON.stringify(logLine)}\n`

    if (level === 'warn' || level === 'error') {
      process.stderr.write(serializedLine)
      return
    }

    process.stdout.write(serializedLine)
  }

  private serializeMessage(message: unknown): string {
    if (message instanceof Error) {
      return message.name
    }

    if (typeof message === 'string') {
      return this.redact(message)
    }

    if (
      typeof message === 'number' ||
      typeof message === 'boolean' ||
      typeof message === 'bigint'
    ) {
      return String(message)
    }

    return '[Non-serializable message]'
  }

  private resolveContext(optionalParams: readonly unknown[]): string {
    const candidate = optionalParams.at(-1)

    if (typeof candidate !== 'string' || candidate.includes('\n')) {
      return 'Application'
    }

    return this.redact(candidate).slice(0, 128) || 'Application'
  }

  private redact(value: string): string {
    const configuredValueRedacted = this.configuredSecrets.reduce(
      (result, secret) => result.replaceAll(secret, '[REDACTED]'),
      value,
    )

    return configuredValueRedacted
      .replace(DATABASE_URL_PATTERN, '[REDACTED_DATABASE_URL]')
      .replace(NAMED_SECRET_PATTERN, '$1=[REDACTED]')
  }
}
