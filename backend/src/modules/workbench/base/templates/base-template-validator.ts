import { BadRequestException } from '@nestjs/common';
import { DataFieldType } from '@prisma/client';
import { DataTableTemplateDefinition } from './base-template.types';

export function validateTemplateCatalog(
  catalog: readonly DataTableTemplateDefinition[],
): readonly DataTableTemplateDefinition[] {
  const templateKeys = new Set<string>();
  for (const template of catalog) {
    if (templateKeys.has(template.key)) throw new BadRequestException(`Duplicate template key: ${template.key}`);
    templateKeys.add(template.key);
    const fieldKeys = new Set<string>();
    for (const field of template.fields) {
      if (!/^[a-z][a-z0-9_]*$/.test(field.key)) throw new BadRequestException(`Invalid field key: ${field.key}`);
      if (fieldKeys.has(field.key)) throw new BadRequestException(`Duplicate field key: ${field.key}`);
      fieldKeys.add(field.key);
      if (field.type === DataFieldType.SINGLE_SELECT || field.type === DataFieldType.MULTI_SELECT) {
        const options = field.config?.options;
        if (!Array.isArray(options) || !options.length) throw new BadRequestException(`Select field ${field.key} requires options`);
        const values = options.map((option) => (option as Record<string, unknown>).value);
        if (values.some((value) => typeof value !== 'string') || new Set(values).size !== values.length) {
          throw new BadRequestException(`Select field ${field.key} contains a duplicate option value`);
        }
      }
    }
    const primary = template.fields.filter((field) => field.isPrimary);
    if (primary.length !== 1 || primary[0]!.type !== DataFieldType.TEXT || !primary[0]!.isRequired) {
      throw new BadRequestException(`Template ${template.key} must have exactly one required TEXT primary field`);
    }
    const viewNames = new Set<string>();
    for (const view of template.views) {
      if (viewNames.has(view.name)) throw new BadRequestException(`Duplicate view name: ${view.name}`);
      viewNames.add(view.name);
      thisValidateReferences(view.config, fieldKeys);
    }
  }
  return catalog;
}

function thisValidateReferences(value: unknown, fields: Set<string>, property = ''): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => thisValidateReferences(entry, fields, property));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'fieldKey' || key.endsWith('FieldKey') || key === 'dateField') && typeof entry === 'string' && !fields.has(entry)) {
      throw new BadRequestException(`View references missing field: ${entry}`);
    }
    thisValidateReferences(entry, fields, key);
  }
}

export function deepFreezeTemplateCatalog<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezeTemplateCatalog(child);
  }
  return value;
}
