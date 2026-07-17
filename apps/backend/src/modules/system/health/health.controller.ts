import { createHash, timingSafeEqual } from 'node:crypto'

import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Environment } from '../../../infrastructure/config/env.schema'
import { PrismaService } from '../../../infrastructure/prisma/prisma.service'

export const INTERNAL_TOKEN_HEADER = 'x-workbench-token'

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  @Get('live')
  getLiveness(): { status: 'live' } {
    return { status: 'live' }
  }

  @Get('ready')
  async getReadiness(
    @Headers(INTERNAL_TOKEN_HEADER) providedToken?: string,
  ): Promise<{ status: 'ready'; database: 'ready' }> {
    const expectedToken = this.config.get('INTERNAL_API_TOKEN', { infer: true })

    if (!this.tokensMatch(providedToken, expectedToken)) {
      throw new UnauthorizedException()
    }

    try {
      await this.prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`
    } catch {
      throw new ServiceUnavailableException()
    }

    return { status: 'ready', database: 'ready' }
  }

  private tokensMatch(providedToken: string | undefined, expectedToken: string): boolean {
    const providedDigest = createHash('sha256')
      .update(providedToken ?? '')
      .digest()
    const expectedDigest = createHash('sha256').update(expectedToken).digest()

    return timingSafeEqual(providedDigest, expectedDigest)
  }
}
