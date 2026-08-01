import { expect, type Page } from '@playwright/test'

const DEFAULT_E2E_ADMIN = 'admin'
const DEFAULT_E2E_PASSWORD = 'RdManager2026!'

export async function loginAsDefaultAdmin(page: Page): Promise<void> {
  await page.goto('/')

  const navigation = page.getByRole('navigation', { name: '主导航', exact: true })
  if (await navigation.isVisible()) return

  await page
    .getByPlaceholder('请输入账号或员工工号', { exact: true })
    .fill(process.env['E2E_ADMIN_USERNAME'] ?? DEFAULT_E2E_ADMIN)
  await page
    .getByPlaceholder('请输入密码', { exact: true })
    .fill(process.env['E2E_ADMIN_PASSWORD'] ?? DEFAULT_E2E_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expect(navigation).toBeVisible()
}
