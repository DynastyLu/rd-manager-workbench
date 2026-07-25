/**
 * Generates the committed employee work import E2E fixtures.
 *
 * Both workbooks are built from the real EmployeeWorkbookService template so
 * they always match the current template structure. Rows reference the seeded
 * dev project RD-111 and its task TASK-5B29A48D65, plus the two employee
 * profiles the Playwright scenario creates (验收员工甲 / 验收员工乙).
 *
 * Regenerate with: pnpm exec tsx test/fixtures/generate-employee-fixtures.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { EmployeeWorkbookService } from '../../src/modules/workbench/employees/application/employee-workbook.service';

const PERIOD_START = new Date(Date.UTC(2026, 6, 20));
const PERIOD_END = new Date(Date.UTC(2026, 6, 26));
const PROJECT_CODE = 'RD-111';
const TASK_CODE = 'TASK-5B29A48D65';

type DetailRow = Array<string | number | null>;

async function buildWorkbook(rows: DetailRow[]): Promise<Buffer> {
  const template = await new EmployeeWorkbookService().template();
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
  await writeFile(join(dir, 'employee-work-progress-valid.xlsx'), valid);
  await writeFile(join(dir, 'employee-work-progress-invalid.xlsx'), invalid);
  console.log(
    `Wrote employee-work-progress-valid.xlsx (${valid.length} bytes) and ` +
      `employee-work-progress-invalid.xlsx (${invalid.length} bytes) for ` +
      `${PERIOD_START.toISOString().slice(0, 10)} ~ ${PERIOD_END.toISOString().slice(0, 10)}`,
  );
}

void main();
