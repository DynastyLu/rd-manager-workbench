import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { TenantDatabaseTarget } from './tenant-database-target.interface';

const POSTGRES_IDENTIFIER_LIMIT = 63;
const SCHEMA_PREFIX = 'tenant_';
const HASH_SUFFIX_LENGTH = 8;
const HASH_SEPARATOR = '_';
const MAX_NORMALIZED_PREFIX_LENGTH =
  POSTGRES_IDENTIFIER_LIMIT - SCHEMA_PREFIX.length - HASH_SEPARATOR.length - HASH_SUFFIX_LENGTH;

@Injectable()
export class TenantPrismaManagerService {
  constructor(private readonly configService: ConfigService) {}

  resolveTenantSchemaName(tenantKey: string): string {
    const rawKey = tenantKey.trim();
    const normalized = rawKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

    if (!normalized) {
      throw new Error('Tenant key cannot be empty');
    }

    const hash = this.shortHash(rawKey);
    const normalizedPrefix = normalized.slice(0, MAX_NORMALIZED_PREFIX_LENGTH).replace(/_+$/g, '');
    return `${SCHEMA_PREFIX}${normalizedPrefix}${HASH_SEPARATOR}${hash}`;
  }

  resolveTenantDatabaseTarget(input: { tenantKey: string }): TenantDatabaseTarget {
    const schemaName = this.resolveTenantSchemaName(input.tenantKey);
    return {
      tenantKey: input.tenantKey,
      schemaName,
      databaseUrl: this.buildTenantDatabaseUrl(schemaName),
    };
  }

  buildTenantDatabaseUrl(schemaName: string): string {
    const baseUrl = this.configService.get<string>('DATABASE_URL');
    if (!baseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    const url = new URL(baseUrl);
    url.searchParams.set('schema', schemaName);
    return url.toString();
  }

  private shortHash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, HASH_SUFFIX_LENGTH);
  }
}
