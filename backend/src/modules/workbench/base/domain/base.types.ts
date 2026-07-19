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
  query?: string;
  filterField?: string;
  filterValue?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
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
