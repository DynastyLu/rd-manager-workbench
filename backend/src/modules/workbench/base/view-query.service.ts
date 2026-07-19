import { BadRequestException, Injectable } from '@nestjs/common';
import { DataFieldType, DataViewType } from '@prisma/client';
import {
  NormalizedRecordQuery,
  RecordQuery,
  UnifiedDataRecord,
  ViewFilterOperator,
} from './domain/base.types';

type QueryField = { key: string; type: DataFieldType; archivedAt?: Date | null };
type ConfigObject = Record<string, unknown>;

const COMPUTED_TYPES = new Set<DataFieldType>([
  DataFieldType.LOOKUP,
  DataFieldType.ROLLUP,
  DataFieldType.FORMULA,
]);
const VALUELESS_OPERATORS = new Set<ViewFilterOperator>(['EMPTY', 'NOT_EMPTY']);
const TEXT_OPERATORS = new Set<ViewFilterOperator>([
  'EQ',
  'NE',
  'CONTAINS',
  'NOT_CONTAINS',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]);
const NUMBER_OPERATORS = new Set<ViewFilterOperator>([
  'EQ',
  'NE',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]);
const DATE_OPERATORS = new Set<ViewFilterOperator>([
  'EQ',
  'NE',
  'BEFORE',
  'AFTER',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]);
const COLLECTION_OPERATORS = new Set<ViewFilterOperator>([
  'CONTAINS',
  'NOT_CONTAINS',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]);
const BOOLEAN_OPERATORS = new Set<ViewFilterOperator>(['EQ', 'NE', 'EMPTY', 'NOT_EMPTY']);
const ALL_OPERATORS = new Set<ViewFilterOperator>([
  ...TEXT_OPERATORS,
  ...NUMBER_OPERATORS,
  ...DATE_OPERATORS,
  ...COLLECTION_OPERATORS,
  ...BOOLEAN_OPERATORS,
]);

@Injectable()
export class ViewQueryService {
  normalize(
    fields: readonly QueryField[],
    rawConfig: unknown,
    request: RecordQuery = {},
    viewType?: DataViewType,
  ): NormalizedRecordQuery {
    const config = this.normalizeConfig(fields, rawConfig, viewType);
    const fieldByKey = new Map(fields.map((field) => [field.key, field]));
    const filters = (config.filters as unknown[]).flatMap((raw) => {
      const value = this.object(raw);
      const field = fieldByKey.get(value.fieldKey as string)!;
      if (field.archivedAt) return [];
      return [
        {
          fieldKey: field.key,
          operator: value.operator as ViewFilterOperator,
          ...('value' in value ? { value: value.value } : {}),
        },
      ];
    });
    const sorts = (config.sorts as unknown[]).flatMap((raw) => {
      const value = this.object(raw);
      const field = fieldByKey.get(value.fieldKey as string)!;
      if (field.archivedAt) return [];
      return [
        {
          fieldKey: field.key,
          direction: value.direction as 'asc' | 'desc',
        },
      ];
    });
    const savedQuery = typeof config.query === 'string' ? config.query.trim() : '';
    const temporaryQuery = typeof request.query === 'string' ? request.query.trim() : undefined;
    const query = temporaryQuery !== undefined ? temporaryQuery : savedQuery;
    return {
      ...(query ? { query } : {}),
      filters,
      sorts,
      page: request.page ?? 1,
      pageSize: request.pageSize ?? 100,
    };
  }

  normalizeConfig(
    fields: readonly QueryField[],
    rawConfig: unknown,
    viewType?: DataViewType,
  ): ConfigObject {
    const config = this.object(rawConfig);
    const rawFilters = this.rawFilters(config);
    const rawSorts = this.rawSorts(config);
    if (rawFilters.length > 20)
      throw new BadRequestException('A view can contain at most 20 filters');
    if (rawSorts.length > 5) throw new BadRequestException('A view can contain at most 5 sorts');
    const fieldByKey = new Map(fields.map((field) => [field.key, field]));
    const filters = rawFilters.map((raw) => this.normalizeFilter(fieldByKey, raw));
    const sorts = rawSorts.map((raw) => this.normalizeSort(fieldByKey, raw));
    this.validateFieldReference(fieldByKey, config.groupField, 'groupField');
    if (viewType === DataViewType.GANTT) {
      this.validateFieldReference(fieldByKey, config.startFieldKey, 'startFieldKey', true);
      this.validateFieldReference(fieldByKey, config.endFieldKey, 'endFieldKey', true);
    }
    const normalized: ConfigObject = { ...config, filters, sorts };
    delete normalized.filterField;
    delete normalized.filterValue;
    delete normalized.sortField;
    delete normalized.sortOrder;
    return normalized;
  }

  apply(records: readonly UnifiedDataRecord[], query: NormalizedRecordQuery) {
    const searched = query.query
      ? records.filter((record) =>
          JSON.stringify(record.values)
            .toLocaleLowerCase()
            .includes(query.query!.toLocaleLowerCase()),
        )
      : [...records];
    const filtered = searched.filter((record) =>
      query.filters.every((filter) => this.matches(record.values[filter.fieldKey], filter)),
    );
    const indexed = filtered.map((record, index) => ({ record, index }));
    if (query.sorts.length) {
      indexed.sort((left, right) => {
        for (const sort of query.sorts) {
          const compared = this.compare(
            left.record.values[sort.fieldKey],
            right.record.values[sort.fieldKey],
          );
          if (compared !== 0) return sort.direction === 'desc' ? -compared : compared;
        }
        return left.index - right.index;
      });
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      data: indexed.slice(start, start + query.pageSize).map(({ record }) => record),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: indexed.length,
      },
    };
  }

  private rawFilters(config: ConfigObject): unknown[] {
    if (config.filters !== undefined && !Array.isArray(config.filters))
      throw new BadRequestException('Saved filters must be an array');
    if (Array.isArray(config.filters)) return config.filters;
    return typeof config.filterField === 'string' && config.filterField
      ? [
          {
            fieldKey: config.filterField,
            operator: 'EQ',
            value: config.filterValue,
          },
        ]
      : [];
  }

  private rawSorts(config: ConfigObject): unknown[] {
    if (config.sorts !== undefined && !Array.isArray(config.sorts))
      throw new BadRequestException('Saved sorts must be an array');
    if (Array.isArray(config.sorts)) return config.sorts;
    return typeof config.sortField === 'string' && config.sortField
      ? [
          {
            fieldKey: config.sortField,
            direction: config.sortOrder === 'desc' ? 'desc' : 'asc',
          },
        ]
      : [];
  }

  private normalizeFilter(fieldByKey: Map<string, QueryField>, raw: unknown) {
    const value = this.object(raw);
    if (typeof value.fieldKey !== 'string' || typeof value.operator !== 'string')
      throw new BadRequestException('Invalid saved filter');
    const field = this.field(fieldByKey, value.fieldKey);
    if (field.archivedAt) return { ...value };
    this.assertBaseField(field);
    if (!ALL_OPERATORS.has(value.operator as ViewFilterOperator))
      throw new BadRequestException(`Unsupported filter operator: ${value.operator}`);
    const operator = value.operator as ViewFilterOperator;
    if (!this.operatorsFor(field.type).has(operator))
      throw new BadRequestException(`Operator ${operator} is not supported for field ${field.key}`);
    const normalizedValue = this.normalizeValue(field.type, operator, value.value);
    return {
      fieldKey: field.key,
      operator,
      ...(!VALUELESS_OPERATORS.has(operator) ? { value: normalizedValue } : {}),
    };
  }

  private normalizeSort(fieldByKey: Map<string, QueryField>, raw: unknown) {
    const value = this.object(raw);
    if (typeof value.fieldKey !== 'string') throw new BadRequestException('Invalid saved sort');
    const field = this.field(fieldByKey, value.fieldKey);
    if (field.archivedAt) return { ...value };
    this.assertBaseField(field);
    if (value.direction !== 'asc' && value.direction !== 'desc')
      throw new BadRequestException('Saved sort direction must be asc or desc');
    return { fieldKey: field.key, direction: value.direction };
  }

  private validateFieldReference(
    fieldByKey: Map<string, QueryField>,
    key: unknown,
    property: string,
    requireDate = false,
  ) {
    if (key === undefined || key === null || key === '') return;
    if (typeof key !== 'string') throw new BadRequestException(`${property} must be a field key`);
    const field = this.field(fieldByKey, key);
    if (field.archivedAt) return;
    this.assertBaseField(field);
    if (requireDate && field.type !== DataFieldType.DATETIME)
      throw new BadRequestException('Gantt axes must use date fields');
  }

  private field(fieldByKey: Map<string, QueryField>, key: string) {
    const field = fieldByKey.get(key);
    if (!field) throw new BadRequestException(`Unknown view field: ${key}`);
    return field;
  }

  private matches(actual: unknown, filter: NormalizedRecordQuery['filters'][number]): boolean {
    const empty = this.isEmpty(actual);
    if (filter.operator === 'EMPTY') return empty;
    if (filter.operator === 'NOT_EMPTY') return !empty;
    if (filter.operator === 'CONTAINS' || filter.operator === 'NOT_CONTAINS') {
      const contains = Array.isArray(actual)
        ? actual.some((item) => this.equal(item, filter.value))
        : String(actual ?? '')
            .toLocaleLowerCase()
            .includes(String(filter.value ?? '').toLocaleLowerCase());
      return filter.operator === 'CONTAINS' ? contains : !contains;
    }
    if (filter.operator === 'IN') {
      const candidates = Array.isArray(filter.value) ? filter.value : [];
      return Array.isArray(actual)
        ? actual.some((item) => candidates.some((candidate) => this.equal(item, candidate)))
        : candidates.some((candidate) => this.equal(actual, candidate));
    }
    if (filter.operator === 'EQ' || filter.operator === 'NE') {
      const equal = this.equal(actual, filter.value);
      return filter.operator === 'EQ' ? equal : !equal;
    }
    const temporal = filter.operator === 'BEFORE' || filter.operator === 'AFTER';
    const left = temporal ? this.timestamp(actual) : this.scalar(actual);
    const right = temporal ? this.timestamp(filter.value) : this.scalar(filter.value);
    if (left === null || right === null) return false;
    switch (filter.operator) {
      case 'GT':
      case 'AFTER':
        return left > right;
      case 'GTE':
        return left >= right;
      case 'LT':
      case 'BEFORE':
        return left < right;
      case 'LTE':
        return left <= right;
      default:
        return false;
    }
  }

  private normalizeValue(type: DataFieldType, operator: ViewFilterOperator, value: unknown) {
    if (VALUELESS_OPERATORS.has(operator)) return undefined;
    if (operator === 'IN') {
      if (!Array.isArray(value)) throw new BadRequestException('IN filter value must be an array');
      if (value.length > 100)
        throw new BadRequestException('IN filters can contain at most 100 values');
      return value.map((item) => this.normalizeScalar(type, item));
    }
    if (value === undefined) throw new BadRequestException('Filter value is required');
    return this.normalizeScalar(type, value);
  }

  private normalizeScalar(type: DataFieldType, value: unknown) {
    if (type === DataFieldType.NUMBER) {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) throw new BadRequestException('Number filter value is invalid');
      return number;
    }
    if (
      type === DataFieldType.DATETIME ||
      type === DataFieldType.CREATED_AT ||
      type === DataFieldType.UPDATED_AT
    ) {
      if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime()))
        throw new BadRequestException('Date filter value is invalid');
      return new Date(value).toISOString();
    }
    if (type === DataFieldType.CHECKBOX) {
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (typeof value !== 'boolean')
        throw new BadRequestException('Checkbox filter value must be boolean');
      return value;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      throw new BadRequestException('Filter value must be scalar');
    return value;
  }

  private operatorsFor(type: DataFieldType) {
    if (type === DataFieldType.NUMBER) return NUMBER_OPERATORS;
    if (
      type === DataFieldType.DATETIME ||
      type === DataFieldType.CREATED_AT ||
      type === DataFieldType.UPDATED_AT
    )
      return DATE_OPERATORS;
    if (type === DataFieldType.CHECKBOX) return BOOLEAN_OPERATORS;
    if (
      type === DataFieldType.MULTI_SELECT ||
      type === DataFieldType.ATTACHMENT ||
      type === DataFieldType.RELATION
    )
      return COLLECTION_OPERATORS;
    return TEXT_OPERATORS;
  }

  private assertBaseField(field: QueryField) {
    if (COMPUTED_TYPES.has(field.type))
      throw new BadRequestException('Computed fields cannot be used in saved queries');
  }

  private equal(left: unknown, right: unknown) {
    if (left instanceof Date) return this.equal(left.toISOString(), right);
    if (right instanceof Date) return this.equal(left, right.toISOString());
    if (typeof left === 'string' && typeof right === 'string') {
      if (this.isoDate(left) && this.isoDate(right))
        return new Date(left).getTime() === new Date(right).getTime();
      return left.toLocaleLowerCase() === right.toLocaleLowerCase();
    }
    return left === right;
  }

  private scalar(value: unknown): number | string | null {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value;
    return null;
  }

  private timestamp(value: unknown): number | null {
    const timestamp = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private compare(left: unknown, right: unknown) {
    if (this.isEmpty(left) && this.isEmpty(right)) return 0;
    if (this.isEmpty(left)) return 1;
    if (this.isEmpty(right)) return -1;
    const leftDate = left instanceof Date || (typeof left === 'string' && this.isoDate(left));
    const rightDate = right instanceof Date || (typeof right === 'string' && this.isoDate(right));
    if (leftDate && rightDate) return this.timestamp(left)! - this.timestamp(right)!;
    const leftScalar = this.scalar(left);
    const rightScalar = this.scalar(right);
    if (typeof leftScalar === 'number' && typeof rightScalar === 'number')
      return leftScalar - rightScalar;
    return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', { numeric: true });
  }

  private isEmpty(value: unknown) {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private isoDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(new Date(value).getTime());
  }

  private object(value: unknown): ConfigObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as ConfigObject;
  }
}
