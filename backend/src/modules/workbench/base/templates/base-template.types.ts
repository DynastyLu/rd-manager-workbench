import { DataFieldType, DataViewType } from '@prisma/client';

export type TemplateCategory = 'PARTNER' | 'APPLICATION' | 'GOVERNANCE' | 'INTERVIEW' | 'RESEARCH';

export interface TemplateFieldDefinition {
  key: string;
  name: string;
  type: DataFieldType;
  config?: Record<string, unknown>;
  isPrimary?: boolean;
  isRequired?: boolean;
  sequence: number;
}

export interface TemplateViewDefinition {
  name: string;
  type: DataViewType;
  config: Record<string, unknown>;
  isDefault?: boolean;
  sequence: number;
}

export interface DataTableTemplateDefinition {
  key: string;
  version: 1;
  name: string;
  description: string;
  icon: string;
  category: TemplateCategory;
  fields: TemplateFieldDefinition[];
  views: TemplateViewDefinition[];
}
