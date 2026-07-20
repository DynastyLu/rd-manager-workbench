import { DataFieldType } from '@prisma/client';

export type InferredImportType = 'TEXT' | 'NUMBER' | 'DATETIME' | 'CHECKBOX';

export interface ParsedImportRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface ParsedSheet {
  sheetNames: string[];
  selectedSheet: string;
  columns: string[];
  inferredTypes: Record<string, InferredImportType>;
  rows: ParsedImportRow[];
}

export interface ImportColumnMapping {
  sourceColumn: string;
  targetFieldId?: string;
  newField?: {
    name: string;
    key: string;
    type: Extract<
      DataFieldType,
      | 'TEXT'
      | 'LONG_TEXT'
      | 'NUMBER'
      | 'DATETIME'
      | 'SINGLE_SELECT'
      | 'MULTI_SELECT'
      | 'CHECKBOX'
      | 'LINK'
    >;
  };
  ignored?: boolean;
}

export interface ImportRowError {
  rowNumber: number;
  fields: string[];
  message: string;
  source: Record<string, unknown>;
}

export type RowConversionResult =
  | { ok: true; rowNumber: number; values: Record<string, unknown> }
  | ({ ok: false } & ImportRowError);
