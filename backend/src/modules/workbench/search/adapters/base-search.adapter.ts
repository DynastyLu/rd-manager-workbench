import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { SearchAdapter, SearchCandidate, SearchType } from '../domain/search.types';
import { buildSearchSnippet } from '../domain/search-ranking';

interface RecordIdRow {
  id: string;
}

@Injectable()
export class BaseSearchAdapter implements SearchAdapter {
  readonly types = ['BASE_RECORD'] as const satisfies readonly SearchType[];

  constructor(private readonly prisma: PlatformPrismaService) {}

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    if (!types.includes('BASE_RECORD')) return [];
    const matchingIds = await this.prisma.$queryRaw<RecordIdRow[]>(Prisma.sql`
      SELECT record.id
      FROM app.data_records AS record
      INNER JOIN app.data_tables AS table_record ON table_record.id = record.table_id
      WHERE table_record.source = 'CUSTOM'::app."DataTableSource"
        AND table_record.archived_at IS NULL
        AND record.values::text ILIKE ${`%${query}%`}
      ORDER BY record.updated_at DESC, record.id DESC
      LIMIT 100
    `);
    if (matchingIds.length === 0) return [];

    const records = await this.prisma.dataRecord.findMany({
      where: {
        id: { in: matchingIds.map(({ id }) => id) },
        table: { source: 'CUSTOM', archivedAt: null },
      },
      include: {
        table: {
          include: {
            fields: {
              where: { archivedAt: null },
              orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });

    return records.map((record) => {
      const values = this.values(record.values);
      const primaryKey = record.table.fields.find(({ isPrimary }) => isPrimary)?.key;
      const titleValue = primaryKey ? values[primaryKey] : undefined;
      return {
        type: 'BASE_RECORD',
        id: record.id,
        title: this.displayValue(titleValue) ?? `${record.table.name} 记录`,
        snippet: this.recordSnippet(query, values, primaryKey),
        path: `/base?tableId=${encodeURIComponent(record.tableId)}&recordId=${encodeURIComponent(record.id)}`,
        updatedAt: record.updatedAt,
        actions: ['OPEN', 'COPY_LINK'],
      };
    });
  }

  private values(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private displayValue(value: Prisma.JsonValue | undefined): string | null {
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }

  private recordSnippet(
    query: string,
    values: Record<string, Prisma.JsonValue>,
    primaryKey: string | undefined,
  ): string | null {
    const fields = Object.entries(values)
      .filter(([key]) => key !== primaryKey)
      .map(([key, value]) => {
        const display = this.displayValue(value);
        return display ? `${key}: ${display}` : `${key}: ${JSON.stringify(value)}`;
      });
    return buildSearchSnippet(query, fields);
  }
}
