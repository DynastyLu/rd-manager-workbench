import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { BaseFileParserService } from '../../../../../src/modules/workbench/base/import/base-file-parser.service';

describe('BaseFileParserService', () => {
  const service = new BaseFileParserService();

  it('parses UTF-8 BOM CSV and infers primitive column types', async () => {
    const parsed = await service.parse(
      Buffer.from('\uFEFF名称,数量,启用\n演示,12,是\n'),
      'items.csv',
      'text/csv',
    );
    expect(parsed.sheetNames).toEqual(['CSV']);
    expect(parsed.columns).toEqual(['名称', '数量', '启用']);
    expect(parsed.inferredTypes).toMatchObject({ 数量: 'NUMBER', 启用: 'CHECKBOX' });
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 2, values: { 名称: '演示' } });
  });

  it('lists XLSX worksheets and lets the caller select a non-first sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('一').addRows([['名称'], ['第一张']]);
    workbook.addWorksheet('二').addRows([['名称'], ['第二张']]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await service.parse(
      buffer,
      'items.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '二',
    );
    expect(parsed.sheetNames).toEqual(['一', '二']);
    expect(parsed.rows[0]?.values).toEqual({ 名称: '第二张' });
  });

  it('rejects extension/signature mismatch and invalid UTF-8', async () => {
    await expect(service.parse(Buffer.from('not zip'), 'bad.xlsx', 'text/plain')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.parse(Buffer.from([0xff, 0xfe, 0xfd]), 'bad.csv', 'text/csv'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate or empty headers', async () => {
    await expect(service.parse(Buffer.from('名称,名称\na,b'), 'bad.csv', 'text/csv')).rejects.toThrow(
      'duplicate',
    );
    await expect(service.parse(Buffer.from('名称,\na,b'), 'bad.csv', 'text/csv')).rejects.toThrow(
      'empty',
    );
  });
});
