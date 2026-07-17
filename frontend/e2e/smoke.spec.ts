import { expect, test } from '@playwright/test'

test.describe('app smoke', () => {
  test('renders the login page shell', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveTitle(/Treasure Box/)
    await expect(page.getByRole('heading', { name: '百宝箱开球' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '用户名' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '密码' })).toBeVisible()
    await expect(page.getByRole('button', { name: /\[ KICK OFF \]/ })).toBeVisible()
  })
})
