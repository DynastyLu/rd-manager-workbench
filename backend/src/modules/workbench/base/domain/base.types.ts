import { DataFieldType, DataTableSource, DataViewType } from '@prisma/client';

export interface ComputedFieldError {
  code: 'INVALID_FORMULA' | 'TYPE_ERROR' | 'DIV_ZERO' | 'CYCLE' | 'MISSING_TARGET';
  message: string;
}

export interface UnifiedDataRecord {
  id: string;
  values: Record<string, unknown>;
  sourceType: string;
  sourceId: string;
  sourcePath: string;
  createdAt: Date;
  updatedAt: Date;
  computedErrors?: Record<string, ComputedFieldError>;
}

export interface RecordQuery {
  recordIds?: string[];
  viewId?: string;
  query?: string;
  filterField?: string;
  filterValue?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export type ViewFilterOperator =
  | 'EQ'
  | 'NE'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'EMPTY'
  | 'NOT_EMPTY'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'BEFORE'
  | 'AFTER'
  | 'IN';

export interface NormalizedRecordQuery {
  query?: string;
  filters: Array<{ fieldKey: string; operator: ViewFilterOperator; value?: unknown }>;
  sorts: Array<{ fieldKey: string; direction: 'asc' | 'desc' }>;
  page: number;
  pageSize: number;
}

export interface PresetField {
  key: string;
  name: string;
  type: DataFieldType;
  config?: Record<string, unknown>;
  isPrimary?: boolean;
  sequence: number;
}

export interface PresetDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  source: DataTableSource;
  fields: PresetField[];
  views: Array<{
    name: string;
    type: DataViewType;
    config?: Record<string, unknown>;
    isDefault?: boolean;
    sequence: number;
  }>;
}
