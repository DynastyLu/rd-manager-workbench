import { expect, test } from '@playwright/test'
import { loginAsDefaultAdmin } from './support/auth'

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1280, height: 600 },
]) {
  test(`keeps every Dock app accessible at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await loginAsDefaultAdmin(page)

    const dock = page.getByRole('navigation', { name: '主导航', exact: true })
    await expect(dock).toBeVisible()
    await expect(dock).toHaveCSS('height', `${viewport.height}px`)

    const links = dock.getByRole('link')
    const linkCount = await links.count()
    expect(linkCount).toBeGreaterThanOrEqual(8)
    const lastLink = links.nth(linkCount - 1)
    await lastLink.scrollIntoViewIfNeeded()
    await expect(lastLink).toBeVisible()

    const lastBox = await lastLink.boundingBox()
    expect(lastBox).not.toBeNull()
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(viewport.height)
  })
}

test('creates a continuous magnification wave and keeps the hovered tooltip visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await loginAsDefaultAdmin(page)

  const dock = page.getByRole('navigation', { name: '主导航', exact: true })
  const projects = dock.getByRole('link', { name: '项目', exact: true })
  const employees = dock.getByRole('link', { name: '员工', exact: true })
  const documents = dock.getByRole('link', { name: '文档与知识库', exact: true })

  await expect(employees).toBeVisible()
  await employees.hover()

  await expect
    .poll(async () => (await employees.locator('.workspace-dock__tile').boundingBox())?.width ?? 0)
    .toBeGreaterThan(72)
  await expect
    .poll(async () => (await projects.locator('.workspace-dock__tile').boundingBox())?.width ?? 0)
    .toBeGreaterThan(56)
  await expect
    .poll(async () => (await documents.locator('.workspace-dock__tile').boundingBox())?.width ?? 0)
    .toBeGreaterThan(56)
  await expect(employees.getByRole('tooltip')).toBeVisible()

  const employeeLinkBox = await employees.boundingBox()
  expect(employeeLinkBox?.height).toBe(56)
})

test('shows the same custom tooltip for keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await loginAsDefaultAdmin(page)

  const employees = page
    .getByRole('navigation', { name: '主导航', exact: true })
    .getByRole('link', { name: '员工', exact: true })
  await employees.focus()

  await expect(employees).toBeFocused()
  await expect(employees.getByRole('tooltip')).toBeVisible()
})
