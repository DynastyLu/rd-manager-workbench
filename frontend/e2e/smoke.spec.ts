import { expect, test } from '@playwright/test'

test.describe('workbench smoke', () => {
  test('renders the local workbench entry', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/研发主管工作台/)
    await expect(page.getByRole('heading', { name: '研发主管工作台' })).toBeVisible()
  })

  test('renders settings through the hash route', async ({ page }) => {
    await page.goto('/#/settings')

    await expect(page.getByRole('heading', { name: '工作台设置' })).toBeVisible()
  })
})
