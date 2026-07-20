import { BadRequestException } from '@nestjs/common';
import {
  BASE_TEMPLATE_CATALOG,
  getValidatedTemplateCatalog,
} from '../../../../../src/modules/workbench/base/templates/base-template-catalog';
import { validateTemplateCatalog } from '../../../../../src/modules/workbench/base/templates/base-template-validator';

describe('base business template catalog', () => {
  it('contains exactly the five approved, immutable templates', () => {
    const catalog = getValidatedTemplateCatalog();
    expect(catalog.map((template) => template.key)).toEqual([
      'partner-ledger',
      'rd-application',
      'risk-register',
      'interview-tracker',
      'non-project-rd',
    ]);
    for (const template of catalog) {
      expect(template.fields.filter((field) => field.isPrimary)).toHaveLength(1);
      expect(template.views.length).toBeGreaterThanOrEqual(4);
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.fields)).toBe(true);
    }
  });

  it('rejects duplicate keys and invalid primary fields', () => {
    expect(() => validateTemplateCatalog([BASE_TEMPLATE_CATALOG[0]!, BASE_TEMPLATE_CATALOG[0]!])).toThrow(
      BadRequestException,
    );
    const invalid = structuredClone(BASE_TEMPLATE_CATALOG[0]!);
    invalid.fields[0]!.isRequired = false;
    expect(() => validateTemplateCatalog([invalid])).toThrow('primary');
  });

  it('rejects views that reference unknown fields and duplicate option values', () => {
    const invalidView = structuredClone(BASE_TEMPLATE_CATALOG[1]!);
    invalidView.views[0]!.config = { sorts: [{ fieldKey: 'missing', direction: 'asc' }] };
    expect(() => validateTemplateCatalog([invalidView])).toThrow('missing');
    const invalidOption = structuredClone(BASE_TEMPLATE_CATALOG[2]!);
    const select = invalidOption.fields.find((field) => field.type === 'SINGLE_SELECT')!;
    const option = (select.config?.options as Array<Record<string, unknown>>)[0]!;
    (select.config!.options as Array<Record<string, unknown>>).push({ ...option });
    expect(() => validateTemplateCatalog([invalidOption])).toThrow('option');
  });
});
