/**
 * Generates the committed employee work import E2E fixtures.
 *
 * V1 compatibility workbooks and anonymous V2 protocol workbooks are generated
 * from the production codecs so they always match the current structures.
 * Every person represented below is synthetic; never copy a customer workbook
 * or a real employee name into these fixtures.
 *
 * Regenerate with: pnpm exec tsx test/fixtures/generate-employee-fixtures.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { EmployeeWorkbookV2Service } from '../../src/modules/workbench/employees/application/employee-workbook-v2.service';
import { EmployeeWorkbookService } from '../../src/modules/workbench/employees/application/employee-workbook.service';

const PERIOD_START = new Date(Date.UTC(2026, 6, 20));
const PERIOD_END = new Date(Date.UTC(2026, 6, 26));
const PROJECT_CODE = 'RD-111';
const TASK_CODE = 'TASK-5B29A48D65';

type DetailRow = Array<string | number | null>;

async function buildWorkbook(rows: DetailRow[]): Promise<Buffer> {
  const template = await new EmployeeWorkbookService().templateV1();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0], {
    ignoreNodes: ['dataValidations'],
  });
  const instructions = workbook.getWorksheet('说明');
  const details = workbook.getWorksheet('工作明细');
  if (!instructions || !details) throw new Error('Employee workbook sheets are missing');
  instructions.getCell('B4').value = PERIOD_START;
  instructions.getCell('B5').value = PERIOD_END;
  for (const row of rows) details.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const V2_EMPLOYEES = [
  { employeeName: '匿名员工甲', department: '匿名平台组', workDirection: '工程效率' },
  { employeeName: '匿名员工乙', department: '匿名产品组', workDirection: '产品交付' },
  { employeeName: '匿名员工丙', department: '匿名质量组', workDirection: '质量保障' },
] as const;

async function buildV2Workbook(mutate: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const template = await new EmployeeWorkbookV2Service().template({
    periodStart: PERIOD_START,
    employees: [...V2_EMPLOYEES],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  mutate(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildV2Fixtures(): Promise<Record<string, Buffer>> {
  const valid = await buildV2Workbook((workbook) => {
    workbook.getWorksheet('匿名员工甲')!.getRow(7).values = [
      1,
      '实现匿名格式探测',
      '覆盖 V1 与 V2',
      new Date(Date.UTC(2026, 6, 24)),
      '进行中',
      0.75,
      '已完成核心路径',
      '补齐异常用例',
    ];
    workbook.getWorksheet('匿名员工甲')!.getCell('F7').numFmt = '0%';
    workbook.getWorksheet('匿名员工乙')!.getRow(20).values = [
      1,
      '完善匿名预览',
      '展示来源坐标',
      new Date(Date.UTC(2026, 6, 31)),
      '高',
      '需要匿名协作者',
      '先完成接口再联调',
      '匿名数据',
    ];
  });
  const unknownEmployee = await buildV2Workbook((workbook) => {
    const directoryRow = workbook.getWorksheet('填写说明')!.getRow(7);
    directoryRow.getCell(1).value = '匿名未知员工';
    const sheet = workbook.getWorksheet('匿名员工丙')!;
    sheet.name = '匿名未知员工';
    sheet.getCell('B1').value = '匿名未知员工';
    sheet.getRow(7).values = [1, '等待员工映射', null, null, '未开始', 0, null, null];
  });
  const mixedPeriods = await buildV2Workbook((workbook) => {
    const sheet = workbook.getWorksheet('匿名员工丙')!;
    sheet.getCell('B2').value = new Date(Date.UTC(2026, 6, 27));
    sheet.getCell('D2').value = new Date(Date.UTC(2026, 7, 2));
    sheet.getCell('B3').value = new Date(Date.UTC(2026, 7, 3));
    sheet.getCell('D3').value = new Date(Date.UTC(2026, 7, 9));
  });
  const editableFormula = await buildV2Workbook((workbook) => {
    workbook.getWorksheet('匿名员工甲')!.getCell('B7').value = {
      formula: '"禁止的公式"',
      result: '禁止的公式',
    };
  });
  const invalidValues = await buildV2Workbook((workbook) => {
    workbook.getWorksheet('匿名员工甲')!.getRow(7).values = [
      1,
      '无效本周值',
      null,
      null,
      '未知状态',
      '101%',
      null,
      null,
    ];
    workbook.getWorksheet('匿名员工乙')!.getRow(20).values = [
      1,
      '无效下周值',
      null,
      null,
      '最高',
      null,
      null,
      null,
    ];
  });
  const partialAndBlankRows = await buildV2Workbook((workbook) => {
    workbook.getWorksheet('匿名员工甲')!.getCell('C7').value = '缺少本周标题';
    workbook.getWorksheet('匿名员工乙')!.getCell('F20').value = '缺少下周标题';
    // Other generated rows intentionally retain only sequence/default cells.
  });
  return {
    'employee-work-v2-valid.xlsx': valid,
    'employee-work-v2-unknown-employee.xlsx': unknownEmployee,
    'employee-work-v2-mixed-periods.xlsx': mixedPeriods,
    'employee-work-v2-editable-formula.xlsx': editableFormula,
    'employee-work-v2-invalid-values.xlsx': invalidValues,
    'employee-work-v2-partial-and-blank.xlsx': partialAndBlankRows,
  };
}

const VALID_ROWS: DetailRow[] = [
  [
    '验收员工甲',
    '完成员工导入联调',
    '完成接口联调',
    '联调完成 90%',
    90,
    '进行中',
    '收尾联调',
    null,
    8,
    7,
    PROJECT_CODE,
    TASK_CODE,
    null,
  ],
  [
    '验收员工甲',
    '修复权限校验缺陷',
    '修复缺陷',
    '缺陷已修复',
    100,
    '已完成',
    '回归验证',
    null,
    6,
    6,
    PROJECT_CODE,
    TASK_CODE,
    null,
  ],
  [
    '验收员工乙',
    '梳理依赖接口',
    '完成依赖梳理',
    '接口尚未完全冻结',
    60,
    '有风险',
    '推动接口冻结',
    '依赖方接口未冻结',
    10,
    8,
    PROJECT_CODE,
    TASK_CODE,
    null,
  ],
  [
    '验收员工乙',
    '整理团队周报',
    '汇总周报素材',
    null,
    null,
    '未开始',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ],
];

const INVALID_ROWS: DetailRow[] = [
  [
    '不存在的员工丙',
    '提交无法归属的工作',
    '计划',
    '完成一半',
    50,
    '进行中',
    null,
    null,
    4,
    4,
    PROJECT_CODE,
    TASK_CODE,
    null,
  ],
  [
    '验收员工甲',
    '关联不存在的项目',
    null,
    null,
    20,
    '进行中',
    null,
    null,
    null,
    null,
    'NO-SUCH-PROJECT',
    null,
    null,
  ],
];

async function main(): Promise<void> {
  const dir = __dirname;
  const valid = await buildWorkbook(VALID_ROWS);
  const invalid = await buildWorkbook(INVALID_ROWS);
  const v2Fixtures = await buildV2Fixtures();
  await writeFile(join(dir, 'employee-work-progress-valid.xlsx'), valid);
  await writeFile(join(dir, 'employee-work-progress-invalid.xlsx'), invalid);
  for (const [fileName, content] of Object.entries(v2Fixtures)) {
    await writeFile(join(dir, fileName), content);
  }
  console.log(
    `Wrote employee-work-progress-valid.xlsx (${valid.length} bytes) and ` +
      `employee-work-progress-invalid.xlsx (${invalid.length} bytes) for ` +
      `${PERIOD_START.toISOString().slice(0, 10)} ~ ${PERIOD_END.toISOString().slice(0, 10)}; ` +
      `also wrote ${Object.keys(v2Fixtures).length} anonymous V2 fixtures`,
  );
}

void main();
