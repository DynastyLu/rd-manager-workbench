import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'

import { AppModule } from '../../src/app.module'
import { configureBackendApp } from '../../src/bootstrap/create-backend-app'
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service'

const INTERNAL_API_TOKEN = 'test-internal-token-with-at-least-32-characters'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

    expect(response.body).toEqual({
      success: true,
      data: { status: 'live' },
      traceId: expect.stringMatching(UUID_PATTERN),
    })
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('rejects readiness without an internal token', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(401)

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      traceId: expect.stringMatching(UUID_PATTERN),
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

  it('assigns a different trace ID to each request', async () => {
    const callerProvidedTraceId = '00000000-0000-4000-8000-000000000001'
    const firstResponse = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('x-request-id', callerProvidedTraceId)
      .expect(200)
    const secondResponse = await request(app.getHttpServer()).get('/api/health/live').expect(200)

    expect(firstResponse.body.traceId).toMatch(UUID_PATTERN)
    expect(secondResponse.body.traceId).toMatch(UUID_PATTERN)
    expect(firstResponse.body.traceId).not.toBe(callerProvidedTraceId)
    expect(firstResponse.body.traceId).not.toBe(secondResponse.body.traceId)
  })

  it('reports readiness after checking PostgreSQL', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .set('x-workbench-token', INTERNAL_API_TOKEN)
      .expect(200)

    expect(response.body).toEqual({
      success: true,
      data: { status: 'ready', database: 'ready' },
      traceId: expect.stringMatching(UUID_PATTERN),
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
      traceId: expect.stringMatching(UUID_PATTERN),
    })
    expect(JSON.stringify(response.body)).not.toContain('database password leaked')
    expect(JSON.stringify(response.body)).not.toContain(INTERNAL_API_TOKEN)
    expect(response.body).not.toHaveProperty('stack')
  })
})
