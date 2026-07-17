import type { AddressInfo } from 'node:net'

import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { createBackendApp } from './bootstrap/create-backend-app'
import type { Environment } from './infrastructure/config/env.schema'

export interface RunningBackend {
  app: INestApplication
  port: number
}

export async function startBackend(): Promise<RunningBackend> {
  const app = await createBackendApp()
  const config = app.get(ConfigService<Environment, true>)

  await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }))

  const server = app.getHttpServer() as { address(): AddressInfo | string | null }
  const address = server.address()

  if (!address || typeof address === 'string') {
    await app.close()
    throw new Error('Backend did not bind to a TCP port')
  }

  return { app, port: address.port }
}

if (require.main === module) {
  void startBackend().catch(() => {
    process.stderr.write('Backend startup failed.\n')
    process.exitCode = 1
  })
}
