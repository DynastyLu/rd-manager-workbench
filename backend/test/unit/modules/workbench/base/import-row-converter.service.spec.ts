import { BadRequestException } from '@nestjs/common';
import { DataFieldType } from '@prisma/client';
import { ImportRowConverterService } from '../../../../../src/modules/workbench/base/import/import-row-converter.service';

const fields = [
  { id: 'title-id', key: 'title', name: '标题', type: DataFieldType.TEXT, config: {}, isPrimary: true, isRequired: true },
  { id: 'number-id', key: 'number', name: '数量', type: DataFieldType.NUMBER, config: {}, isPrimary: false, isRequired: false },
  { id: 'check-id', key: 'check', name: '启用', type: DataFieldType.CHECKBOX, config: {}, isPrimary: false, isRequired: false },
  { id: 'tags-id', key: 'tags', name: '标签', type: DataFieldType.MULTI_SELECT, config: { options: [{ value: 'A' }, { value: 'B' }] }, isPrimary: false, isRequired: false },
];

describe('ImportRowConverterService', () => {
  const service = new ImportRowConverterService({} as never);

  it('requires one unique mapping for the primary field', () => {
    expect(() => service.validateMapping(fields, [{ sourceColumn: '名称', ignored: true }], ['名称'])).toThrow(
      BadRequestException,
    );
    expect(() => service.validateMapping(fields, [
      { sourceColumn: '名称', targetFieldId: 'title-id' },
      { sourceColumn: '别名', targetFieldId: 'title-id' },
    ], ['名称', '别名'])).toThrow('more than once');
  });

  it('converts scalar and multi-select values without writing records', async () => {
    const result = await service.convertRows(fields, [
      { sourceColumn: '名称', targetFieldId: 'title-id' },
      { sourceColumn: '数量', targetFieldId: 'number-id' },
      { sourceColumn: '启用', targetFieldId: 'check-id' },
      { sourceColumn: '标签', targetFieldId: 'tags-id' },
    ], [{ rowNumber: 2, values: { 名称: '演示', 数量: '12.5', 启用: '是', 标签: 'A，B' } }]);
    expect(result[0]).toEqual({ ok: true, rowNumber: 2, values: { title: '演示', number: 12.5, check: true, tags: ['A', 'B'] } });
  });

  it('returns a row error for an invalid option instead of throwing the scan', async () => {
    const result = await service.convertRows(fields, [
      { sourceColumn: '名称', targetFieldId: 'title-id' },
      { sourceColumn: '标签', targetFieldId: 'tags-id' },
    ], [{ rowNumber: 3, values: { 名称: '演示', 标签: 'C' } }]);
    expect(result[0]).toMatchObject({ ok: false, rowNumber: 3, fields: ['标签'] });
  });

  it('rejects generated, computed and attachment targets', () => {
    for (const type of [DataFieldType.FORMULA, DataFieldType.LOOKUP, DataFieldType.ROLLUP, DataFieldType.ATTACHMENT, DataFieldType.CREATED_AT]) {
      expect(() => service.validateMapping([
        fields[0]!,
        { id: 'bad', key: 'bad', name: '只读', type, config: {}, isPrimary: false, isRequired: false },
      ], [
        { sourceColumn: '名称', targetFieldId: 'title-id' },
        { sourceColumn: '只读', targetFieldId: 'bad' },
      ], ['名称', '只读'])).toThrow('not writable');
    }
  });
});
