import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'

/**
 * End-to-end acceptance scenario for the employee work progress feature.
 *
 * Runs against the real dev stack: the Playwright webServer boots the Vite
 * frontend (or reuses the one on 4312) and expects the NestJS backend on
 * 4311 with the seeded project RD-111 and its task TASK-5B29A48D65.
 *
 * Fixture workbooks live in backend/test/fixtures and cover the week
 * 2026-07-20 ~ 2026-07-26 (the current week at authoring time). The project
 * workspace team-progress panel always shows the current week, so when this
 * spec runs in a later week the fixture period must be regenerated with
 * backend/test/fixtures/generate-employee-fixtures.ts.
 *
 * Re-run safety: committed batches deduplicate by file hash for 24h, so the
 * valid workbook is stamped with a unique run marker (a 备注 cell) before
 * upload. The invalid fixture is discarded during the scenario and can be
 * re-uploaded byte-identical.
 */

const API_BASE = process.env['E2E_API_BASE_URL'] ?? 'http://127.0.0.1:4311/api'
const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../backend/test/fixtures')
const VALID_FIXTURE = path.join(FIXTURE_DIR, 'employee-work-progress-valid.xlsx')
const INVALID_FIXTURE = path.join(FIXTURE_DIR, 'employee-work-progress-invalid.xlsx')

const EMPLOYEE_A = '验收员工甲'
const EMPLOYEE_B = '验收员工乙'
const DEPARTMENT = '验收部'
const PROJECT_CODE = 'RD-111'
const PROJECT_NAME = '测试-1'
const PERIOD_START = '2026-07-20'
const MONTH_START = '2026-07-01'

const backendRequire = createRequire(path.resolve(import.meta.dirname, '../../backend/package.json'))
// eslint is not applied to e2e specs; exceljs ships its own types via backend deps
const ExcelJS = backendRequire('exceljs') as {
  Workbook: new () => {
    xlsx: {
      load: (buffer: Buffer) => Promise<unknown>
      writeBuffer: () => Promise<Buffer | Uint8Array>
    }
    getWorksheet(name: string):
      | {
          getRow(n: number): { getCell(n: number): { value: unknown } }
        }
      | undefined
  }
}

const runId = new Date().toISOString()

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

interface EmployeeRecord {
  id: string
  displayName: string
}

interface ProjectRecord {
  id: string
  code: string
  name: string
}

interface RiskRecord {
  id: string
  title: string
  description?: string | null
}

async function apiData<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API_BASE}${path}`)
  expect(response.ok(), `GET ${path} should succeed`).toBeTruthy()
  const body = (await response.json()) as ApiEnvelope<T>
  return body.data
}

async function findEmployeeId(
  request: APIRequestContext,
  name: string
): Promise<string | null> {
  const data = await apiData<{ data: EmployeeRecord[] }>(
    request,
    `/employees?q=${encodeURIComponent(name)}&pageSize=100`
  )
  return data.data.find((employee) => employee.displayName === name)?.id ?? null
}

async function findProjectId(request: APIRequestContext, code: string): Promise<string> {
  const data = await apiData<{ data: ProjectRecord[] }>(request, '/projects?pageSize=100')
  const project = data.data.find((entry) => entry.code === code)
  expect(project, `seeded project ${code} must exist in the dev database`).toBeTruthy()
  return project!.id
}

async function countConvertedRisks(
  request: APIRequestContext,
  projectId: string
): Promise<number> {
  const data = await apiData<{ data: RiskRecord[] }>(
    request,
    `/risks?projectId=${encodeURIComponent(projectId)}&pageSize=100`
  )
  return data.data.filter(
    (risk) => risk.title === '梳理依赖接口' && (risk.description ?? '').includes('依赖方接口未冻结')
  ).length
}

async function ensureEmployee(
  page: Page,
  request: APIRequestContext,
  name: string
): Promise<string> {
  const existing = await findEmployeeId(request, name)
  if (existing) return existing

  await page.getByRole('button', { name: '新建员工' }).click()
  const dialog = page.getByRole('dialog', { name: '新建员工' })
  await dialog.getByRole('textbox', { name: '姓名' }).fill(name)
  await dialog.getByRole('textbox', { name: '部门' }).fill(DEPARTMENT)
  await dialog.getByRole('button', { name: '保存员工档案' }).click()
  await expect(dialog).not.toBeVisible()

  const created = await findEmployeeId(request, name)
  expect(created, `employee ${name} should exist after creation`).toBeTruthy()
  return created!
}

async function stampWorkbook(sourcePath: string, testInfo: TestInfo, fileName: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await readFile(sourcePath))
  const details = workbook.getWorksheet('工作明细')
  expect(details, 'fixture must contain the 工作明细 sheet').toBeTruthy()
  details!.getRow(2).getCell(13).value = `验收运行 ${runId}`
  const target = testInfo.outputPath(fileName)
  await writeFile(target, Buffer.from(await workbook.xlsx.writeBuffer()))
  return { workbook, details: details!, target }
}

async function reloadUntil(assertion: () => Promise<void>, page: Page) {
  await expect(async () => {
    await page.reload()
    await assertion()
  }).toPass({ timeout: 90_000, intervals: [2_000, 4_000, 6_000] })
}

test.describe('employee work progress acceptance', () => {
  test.describe.configure({ mode: 'serial' })

  let projectId = ''
  let employeeBId = ''
  let firstVersion = 0
  let secondVersion = 0

  test.beforeAll(async ({ request }) => {
    projectId = await findProjectId(request, PROJECT_CODE)
  })

  test('creates employees, downloads the template, and blocks commit on an invalid upload', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)

    // 1. Open /employees.
    await page.goto('/#/employees')
    await expect(page.getByRole('heading', { name: '员工', exact: true })).toBeVisible()

    // 2. Create two employees (reused when a previous run already created them).
    await ensureEmployee(page, request, EMPLOYEE_A)
    employeeBId = await ensureEmployee(page, request, EMPLOYEE_B)
    await expect(page.getByRole('link', { name: `查看${EMPLOYEE_A}档案` }).first()).toBeVisible()

    // 3. Download the template.
    await page.getByRole('tab', { name: '计划导入' }).click()
    await page.getByRole('button', { name: '导入工作计划' }).click()
    // Semi renders duplicate semi-modal-title ids, so the discard confirm also
    // resolves to the same accessible name; exclude it explicitly.
    const wizard = page
      .getByRole('dialog', { name: '导入员工计划与总结' })
      .filter({ hasNotText: '放弃本次导入' })
    await expect(wizard).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await wizard.getByRole('button', { name: '下载导入模板' }).click()
    const templateDownload = await downloadPromise
    expect(templateDownload.suggestedFilename()).toMatch(/\.xlsx$/)

    // 4. Upload the invalid fixture.
    await wizard.getByLabel('选择员工计划与总结 Excel').setInputFiles(INVALID_FIXTURE)

    // 5. Unknown employee/project errors surface and commit stays disabled.
    await expect(wizard.getByRole('heading', { name: '处理错误与待关联行' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(wizard.getByText('共 2 行')).toBeVisible()
    await expect(wizard.getByText(/错误 2 行/)).toBeVisible()
    await expect(wizard.getByText(/2 行待关联/)).toBeVisible()
    await expect(wizard.getByText('第 2 行', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(wizard.getByText(/不存在的员工丙/)).toBeVisible()
    await expect(wizard.getByText(/NO-SUCH-PROJECT/)).toBeVisible()
    await expect(wizard.getByRole('button', { name: '确认导入' })).toBeDisabled()

    // 6. Resolve the unknown employee and project rows.
    await wizard.getByRole('button', { name: '为第 2 行选择员工' }).click()
    await wizard.getByRole('combobox', { name: '第 2 行员工' }).click()
    await page.getByRole('option', { name: new RegExp(EMPLOYEE_A) }).click()
    await wizard.getByRole('button', { name: '保存关联' }).click()
    await expect(wizard.getByText(/1 行待关联/)).toBeVisible()

    await wizard.getByRole('button', { name: '为第 3 行完善关联' }).click()
    await wizard.getByRole('combobox', { name: '第 3 行项目' }).click()
    await page.getByRole('option', { name: new RegExp(PROJECT_CODE) }).click()
    await wizard.getByRole('button', { name: '保存关联' }).click()

    await expect(wizard.getByRole('heading', { name: '预检通过' })).toBeVisible()
    await expect(wizard.getByRole('button', { name: '确认导入' })).toBeEnabled()

    // Discard the corrected invalid upload; the valid fixture is committed next.
    await wizard.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('放弃本次导入？')).toBeVisible()
    await page.getByRole('button', { name: '删除并关闭' }).click()
    await expect(page.getByText('放弃本次导入？')).not.toBeVisible({ timeout: 15_000 })
    await expect(wizard).not.toBeVisible({ timeout: 15_000 })
  })

  test('commits the valid fixture and serves team, employee, and project dashboards', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000)

    const stamped = await stampWorkbook(VALID_FIXTURE, testInfo, 'valid-stamped.xlsx')

    // 7. Commit the valid fixture.
    await page.goto('/#/employees?tab=imports')
    await page.getByRole('button', { name: '导入工作计划' }).click()
    // Semi renders duplicate semi-modal-title ids, so the discard confirm also
    // resolves to the same accessible name; exclude it explicitly.
    const wizard = page
      .getByRole('dialog', { name: '导入员工计划与总结' })
      .filter({ hasNotText: '放弃本次导入' })
    await wizard.getByLabel('选择员工计划与总结 Excel').setInputFiles(stamped.target)

    await expect(wizard.getByRole('heading', { name: '预检通过' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(wizard.getByText('共 4 行')).toBeVisible()
    await expect(wizard.getByText('有效 4 行')).toBeVisible()
    await expect(wizard.getByText(/错误 0 行/)).toBeVisible()
    await wizard.getByRole('button', { name: '确认导入' }).click()
    await expect(
      wizard.getByRole('heading', { name: '确认导入并生成新版本？' })
    ).toBeVisible()
    await wizard.getByRole('button', { name: '确认替换并导入' }).click()

    await expect(wizard.getByRole('heading', { name: '导入完成' })).toBeVisible()
    const resultText = (await wizard.textContent()) ?? ''
    firstVersion = Number(/版本 v(\d+)/.exec(resultText)?.[1])
    expect(firstVersion, 'commit should report the created version').toBeGreaterThan(0)
    await wizard.getByRole('button', { name: '完成' }).click()
    await expect(wizard).not.toBeVisible()

    // 8. Verify team and employee weekly dashboards (snapshots build in the background).
    await page.goto(
      `/#/employees?tab=overview&periodType=WEEK&periodStart=${PERIOD_START}`
    )
    await reloadUntil(async () => {
      await expect(
        page.getByRole('link', { name: EMPLOYEE_A, exact: true })
      ).toBeVisible({ timeout: 5_000 })
      await expect(
        page.getByRole('link', { name: EMPLOYEE_B, exact: true })
      ).toBeVisible({ timeout: 5_000 })
      await expect(
        page.getByRole('link', { name: new RegExp(`${PROJECT_CODE} ${PROJECT_NAME}`) })
      ).toBeVisible({ timeout: 5_000 })
    }, page)

    // Employee drill-through.
    await page.getByRole('link', { name: EMPLOYEE_B, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/employees/${employeeBId}`))
    await expect(page.getByRole('heading', { name: EMPLOYEE_B })).toBeVisible()
    await expect(page.getByText('梳理依赖接口').first()).toBeVisible()
    await expect(page.getByText(/依赖方接口未冻结/).first()).toBeVisible()
    await expect(page.getByText('整理团队周报').first()).toBeVisible()

    // 9. Open the linked project and verify team progress for the current week.
    await page.goto(
      `/#/employees?tab=overview&periodType=WEEK&periodStart=${PERIOD_START}`
    )
    await page
      .getByRole('link', { name: new RegExp(`${PROJECT_CODE} ${PROJECT_NAME}`) })
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`/spaces/projects/${projectId}`))
    await page.getByRole('tab', { name: '进展' }).click()
    await reloadUntil(async () => {
      await expect(
        page.getByRole('heading', { name: '团队进展' })
      ).toBeVisible({ timeout: 5_000 })
      await expect(
        page.getByRole('link', { name: EMPLOYEE_A, exact: true })
      ).toBeVisible({ timeout: 5_000 })
      await expect(
        page.getByRole('link', { name: EMPLOYEE_B, exact: true })
      ).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(/参与 2 人/)).toBeVisible({ timeout: 5_000 })
    }, page)
  })

  test('replaces the period with a second version, warns on month view, and converts a risk', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(300_000)
    expect(firstVersion, 'the valid fixture commit must run first').toBeGreaterThan(0)

    // 10. Upload a second version for the same week (same base rows, updated content).
    const second = await stampWorkbook(VALID_FIXTURE, testInfo, 'valid-v2-stamped.xlsx')
    second.details.getRow(2).getCell(2).value = '联调收尾与验收（第二版）'
    second.details.getRow(2).getCell(5).value = 100
    second.details.getRow(2).getCell(6).value = '已完成'
    second.details.getRow(2).getCell(13).value = `验收运行 ${runId} v2`
    second.details.getRow(4).getCell(5).value = 80
    await writeFile(second.target, Buffer.from(await second.workbook.xlsx.writeBuffer()))

    await page.goto('/#/employees?tab=imports')
    await page.getByRole('button', { name: '导入工作计划' }).click()
    // Semi renders duplicate semi-modal-title ids, so the discard confirm also
    // resolves to the same accessible name; exclude it explicitly.
    const wizard = page
      .getByRole('dialog', { name: '导入员工计划与总结' })
      .filter({ hasNotText: '放弃本次导入' })
    await wizard.getByLabel('选择员工计划与总结 Excel').setInputFiles(second.target)
    await expect(wizard.getByRole('heading', { name: '预检通过' })).toBeVisible({
      timeout: 30_000,
    })
    await wizard.getByRole('button', { name: '确认导入' }).click()
    await wizard.getByRole('button', { name: '确认替换并导入' }).click()
    await expect(wizard.getByRole('heading', { name: '导入完成' })).toBeVisible()
    const secondResultText = (await wizard.textContent()) ?? ''
    secondVersion = Number(/版本 v(\d+)/.exec(secondResultText)?.[1])
    expect(secondVersion).toBe(firstVersion + 1)
    await wizard.getByRole('button', { name: '完成' }).click()

    // 11. The old version remains in history as 已被替换; dashboards use the new one.
    const oldRow = page.locator('tr', {
      has: page.getByText(`v${firstVersion}`, { exact: true }),
    })
    await expect(oldRow.getByText('已被替换')).toBeVisible()
    const newRow = page.locator('tr', {
      has: page.getByText(`v${secondVersion}`, { exact: true }),
    })
    await expect(newRow.getByText('已完成')).toBeVisible()

    await page.goto(
      `/#/employees?tab=work-items&periodType=WEEK&periodStart=${PERIOD_START}`
    )
    await reloadUntil(async () => {
      await expect(page.getByText('联调收尾与验收（第二版）')).toBeVisible({ timeout: 5_000 })
      await expect(
        page.getByText(`v${secondVersion} · 第 2 行`)
      ).toBeVisible({ timeout: 5_000 })
    }, page)
    await expect(page.getByText('完成员工导入联调', { exact: true })).toHaveCount(0)

    // Exporting the current filter must save a workbook with its real filename;
    // this catches both a missing download trigger and CORS hiding
    // Content-Disposition (which would degrade the filename to "download").
    const exportDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前筛选' }).click()
    const exportDownload = await exportDownloadPromise
    expect(exportDownload.suggestedFilename()).toMatch(/\.xlsx$/)

    // 12. Month view surfaces the missing-week warning.
    await page.goto(
      `/#/employees?tab=overview&periodType=MONTH&periodStart=${MONTH_START}`
    )
    await reloadUntil(async () => {
      await expect(page.getByText(/缺少已提交的计划数据/)).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(/2026-07-(06|13)/).first()).toBeVisible({ timeout: 5_000 })
    }, page)

    // 13. Convert one work risk into a project risk.
    const risksBefore = await countConvertedRisks(request, projectId)
    await page.goto(
      `/#/employees/${employeeBId}?periodType=WEEK&periodStart=${PERIOD_START}`
    )
    await expect(page.getByRole('heading', { name: EMPLOYEE_B })).toBeVisible()
    await reloadUntil(async () => {
      await expect(
        page.getByRole('button', { name: '转为项目风险' })
      ).toBeVisible({ timeout: 5_000 })
    }, page)
    await page.getByRole('button', { name: '转为项目风险' }).click()
    await expect(page.getByText('已转换为项目风险').first()).toBeVisible()
    await expect(page.getByText('已转风险').first()).toBeVisible()
    await expect(async () => {
      expect(await countConvertedRisks(request, projectId)).toBe(risksBefore + 1)
    }).toPass({ timeout: 15_000, intervals: [1_000, 2_000] })
  })
})
