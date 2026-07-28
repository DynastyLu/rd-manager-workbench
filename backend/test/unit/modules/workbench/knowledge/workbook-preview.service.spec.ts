import * as XLSX from 'xlsx';
import { WorkbookPreviewService } from '../../../../../src/modules/workbench/knowledge/application/workbook-preview.service';

describe('WorkbookPreviewService', () => {
  it('keeps every worksheet and Chinese cell value from a legacy XLS workbook', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['采购单位名称', '采购项目名称', '预算金额'],
        ['兰州大学生命科学学院', 'X 射线辐照仪', 150],
      ]),
      '表1 采购意向项目',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['品目编码', '品目名称'],
        ['A032011', '医用 X 线设备'],
      ]),
      '表2 品目编码',
    );
    const content = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' }) as Buffer;

    const preview = new WorkbookPreviewService().parse({
      content,
      fileName: '采购意向申请表.xls',
    });

    expect(preview.fileName).toBe('采购意向申请表.xls');
    expect(preview.sheets.map((sheet) => sheet.name)).toEqual([
      '表1 采购意向项目',
      '表2 品目编码',
    ]);
    expect(preview.sheets[0]).toMatchObject({
      rowCount: 2,
      columnCount: 3,
      rows: [
        ['采购单位名称', '采购项目名称', '预算金额'],
        ['兰州大学生命科学学院', 'X 射线辐照仪', '150'],
      ],
    });
    expect(preview.sheets[1]?.rows[1]).toEqual(['A032011', '医用 X 线设备']);
  });
});
