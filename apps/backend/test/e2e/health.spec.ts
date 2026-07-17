import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'

import { AppModule } from '../../src/app.module'
import { configureBackendApp } from '../../src/bootstrap/create-backend-app'
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service'

const INTERNAL_API_TOKEN = 'test-internal-token-with-at-least-32-characters'

describe('health endpoints', () => {
  let app: INestApplication
  let queryRaw: jest.Mock<() => Promise<unknown>>

  beforeEach(async () => {
    queryRaw = jest.fn<() => Promise<unknown>>().mockResolvedValue([{ '?column?': 1 }])

    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw })
      .compile()

    app = configureBackendApp(testingModule.createNestApplication())
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('reports liveness without an internal token', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live').expect(200)

    expect(response.body).toEqual({ success: true, data: { status: 'live' } })
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('rejects readiness without an internal token', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(401)

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    })
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('rejects readiness with the wrong internal token', async () => {
    await request(app.getHttpServer())
      .get('/api/health/ready')
      .set('x-workbench-token', 'wrong-token')
      .expect(401)

    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('does not echo query-string secrets in error responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready?secret=leaked-query-secret')
      .expect(401)

    expect(response.body.path).toBe('/api/health/ready')
    expect(JSON.stringify(response.body)).not.toContain('leaked-query-secret')
  })

  it('reports readiness after checking PostgreSQL', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .set('x-workbench-token', INTERNAL_API_TOKEN)
      .expect(200)

    expect(response.body).toEqual({
      success: true,
      data: { status: 'ready', database: 'ready' },
    })
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('returns service unavailable without leaking database errors', async () => {
    queryRaw.mockRejectedValueOnce(
      new Error(`database password leaked; token=${INTERNAL_API_TOKEN}`),
    )

    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .set('x-workbench-token', INTERNAL_API_TOKEN)
      .expect(503)

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service Unavailable' },
    })
    expect(JSON.stringify(response.body)).not.toContain('database password leaked')
    expect(JSON.stringify(response.body)).not.toContain(INTERNAL_API_TOKEN)
    expect(response.body).not.toHaveProperty('stack')
  })
})
