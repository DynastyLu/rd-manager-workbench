import { expect, test, type APIRequestContext } from '@playwright/test'

const API_BASE = process.env['E2E_API_BASE_URL'] ?? 'http://127.0.0.1:4311/api'

interface EmployeeSummary {
  id: string
  displayName: string
}

async function findEmployee(
  request: APIRequestContext,
  displayName: string,
  archiveState: 'ACTIVE' | 'ARCHIVED'
): Promise<EmployeeSummary | null> {
  const response = await request.get(
    `${API_BASE}/employees?q=${encodeURIComponent(displayName)}&archiveState=${archiveState}&pageSize=100`
  )
  if (!response.ok()) return null
  const body = (await response.json()) as { data?: { data?: EmployeeSummary[] } }
  return body.data?.data?.find((employee) => employee.displayName === displayName) ?? null
}

test('edits, archives, restores, and permanently deletes an unused employee', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const displayName = `员工生命周期验收-${Date.now()}`
  let employeeId: string | null = null

  try {
    await page.goto('/#/employees?tab=directory')
    await page.getByRole('button', { name: '新建员工' }).click()
    const createDialog = page.getByRole('dialog', { name: '新建员工' })
    await createDialog.getByRole('textbox', { name: '姓名' }).fill(displayName)
    await createDialog.getByRole('textbox', { name: '部门' }).fill('生命周期验收部')
    await createDialog.getByRole('button', { name: '保存员工档案' }).click()
    await expect(createDialog).not.toBeVisible()

    employeeId = (await findEmployee(request, displayName, 'ACTIVE'))?.id ?? null
    expect(employeeId, 'employee should exist after creation').toBeTruthy()

    await page.getByRole('textbox', { name: '搜索员工' }).fill(displayName)
    await expect(page.getByRole('link', { name: `查看${displayName}档案` }).first()).toBeVisible()

    await page.getByRole('button', { name: `编辑${displayName}` }).click()
    const editDialog = page.getByRole('dialog', { name: '编辑员工档案' })
    await editDialog.getByRole('textbox', { name: '岗位' }).fill('生命周期验收岗位')
    await editDialog.getByRole('button', { name: '保存员工档案' }).click()
    await expect(editDialog).not.toBeVisible()

    await page.getByRole('button', { name: `归档${displayName}` }).click()
    const archiveDialog = page.getByRole('dialog', { name: '归档员工？' })
    await archiveDialog.getByRole('button', { name: '确认归档' }).click()
    await expect(archiveDialog).not.toBeVisible()

    await page.getByRole('button', { name: '已归档' }).click()
    await expect(page.getByRole('button', { name: `恢复并编辑${displayName}` })).toBeVisible()
    await expect(
      page.locator('.employees-page__table .semi-table-body table').first()
    ).toHaveCSS('width', '1540px')
    await page.getByRole('button', { name: `恢复并编辑${displayName}` }).click()

    const restoredDialog = page.getByRole('dialog', { name: '编辑员工档案' })
    await expect(restoredDialog.getByRole('textbox', { name: '岗位' })).toHaveValue(
      '生命周期验收岗位'
    )
    await restoredDialog.getByRole('button', { name: '保存员工档案' }).click()
    await expect(restoredDialog).not.toBeVisible()

    await page.getByRole('button', { name: '在职员工' }).click()
    await expect(page.getByRole('button', { name: `归档${displayName}` })).toBeVisible()
    await page.getByRole('button', { name: `归档${displayName}` }).click()
    await page
      .getByRole('dialog', { name: '归档员工？' })
      .getByRole('button', { name: '确认归档' })
      .click()

    await page.getByRole('button', { name: '已归档' }).click()
    await page.getByRole('button', { name: `永久删除${displayName}` }).click()
    const deleteDialog = page.getByRole('dialog', { name: '永久删除员工？' })
    await deleteDialog.getByRole('button', { name: '确认永久删除' }).click()
    await expect(deleteDialog).not.toBeVisible()
    await expect(page.getByText(displayName, { exact: true })).toHaveCount(0)
    await expect.poll(() => findEmployee(request, displayName, 'ARCHIVED')).toBeNull()
    employeeId = null
  } finally {
    if (employeeId) {
      await request.delete(`${API_BASE}/employees/${employeeId}`)
      await request.delete(`${API_BASE}/employees/${employeeId}/permanent`)
    }
  }
})

test('permanently deletes an unused active employee directly', async ({ page, request }) => {
  test.setTimeout(60_000)
  const displayName = `在职删除验收-${Date.now()}`
  let employeeId: string | null = null

  try {
    await page.goto('/#/employees?tab=directory')
    await page.getByRole('button', { name: '新建员工' }).click()
    const createDialog = page.getByRole('dialog', { name: '新建员工' })
    await createDialog.getByRole('textbox', { name: '姓名' }).fill(displayName)
    await createDialog.getByRole('button', { name: '保存员工档案' }).click()
    await expect(createDialog).not.toBeVisible()

    employeeId = (await findEmployee(request, displayName, 'ACTIVE'))?.id ?? null
    expect(employeeId, 'active employee should exist before deletion').toBeTruthy()

    await page.getByRole('textbox', { name: '搜索员工' }).fill(displayName)
    await page.getByRole('button', { name: `删除${displayName}` }).click()
    const deleteDialog = page.getByRole('dialog', { name: '永久删除员工？' })
    await expect(deleteDialog).toContainText(`${displayName}的员工档案将无法恢复`)
    await deleteDialog.getByRole('button', { name: '确认永久删除' }).click()
    await expect(deleteDialog).not.toBeVisible()

    await expect.poll(() => findEmployee(request, displayName, 'ACTIVE')).toBeNull()
    employeeId = null
  } finally {
    if (employeeId) {
      await request.delete(`${API_BASE}/employees/${employeeId}/permanent`)
    }
  }
})
