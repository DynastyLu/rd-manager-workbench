import { expect, test } from '@playwright/test'
import { loginAsDefaultAdmin } from './support/auth'

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1280, height: 600 },
  { width: 1280, height: 500 },
  { width: 1280, height: 340 },
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

    const employees = dock.getByRole('link', { name: '员工', exact: true })
    await employees.scrollIntoViewIfNeeded()
    await employees.hover()
    await expect
      .poll(async () => {
        const dockBox = await dock.boundingBox()
        const tileBox = await employees.locator('.workspace-dock__tile').boundingBox()
        if (!dockBox || !tileBox) return 0
        return tileBox.x + tileBox.width - (dockBox.x + dockBox.width)
      })
      .toBeGreaterThan(24)
  })
}

test('creates a continuous magnification wave and keeps the hovered tooltip visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await loginAsDefaultAdmin(page)

  const dock = page.getByRole('navigation', { name: '主导航', exact: true })
  const tasks = dock.getByRole('link', { name: '我的工作', exact: true })
  const projects = dock.getByRole('link', { name: '项目', exact: true })
  const employees = dock.getByRole('link', { name: '员工', exact: true })
  const documents = dock.getByRole('link', { name: '文档与知识库', exact: true })
  const base = dock.getByRole('link', { name: '多维表格', exact: true })

  const projectsBefore = await projects.locator('.workspace-dock__tile').boundingBox()
  const documentsBefore = await documents.locator('.workspace-dock__tile').boundingBox()

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
  await expect
    .poll(async () => {
      const centerWidth =
        (await employees.locator('.workspace-dock__tile').boundingBox())?.width ?? 0
      const firstWidth =
        (await projects.locator('.workspace-dock__tile').boundingBox())?.width ?? 0
      const secondWidth =
        (await tasks.locator('.workspace-dock__tile').boundingBox())?.width ?? 0
      return centerWidth - firstWidth > 8 && firstWidth - secondWidth > 10
    })
    .toBe(true)
  await expect
    .poll(async () => {
      const centerWidth =
        (await employees.locator('.workspace-dock__tile').boundingBox())?.width ?? 0
      const firstWidth =
        (await documents.locator('.workspace-dock__tile').boundingBox())?.width ?? 0
      const secondWidth =
        (await base.locator('.workspace-dock__tile').boundingBox())?.width ?? 0
      return centerWidth - firstWidth > 8 && firstWidth - secondWidth > 10
    })
    .toBe(true)
  await expect(employees.getByRole('tooltip')).toBeVisible()
  await expect(employees.getByRole('tooltip')).toHaveCSS('opacity', '1')

  const dockBox = await dock.boundingBox()
  const employeeTileBox = await employees.locator('.workspace-dock__tile').boundingBox()
  const projectsAfter = await projects.locator('.workspace-dock__tile').boundingBox()
  const documentsAfter = await documents.locator('.workspace-dock__tile').boundingBox()
  const employeeLinkBox = await employees.boundingBox()

  expect(dockBox).not.toBeNull()
  expect(employeeTileBox).not.toBeNull()
  expect(projectsBefore).not.toBeNull()
  expect(projectsAfter).not.toBeNull()
  expect(documentsBefore).not.toBeNull()
  expect(documentsAfter).not.toBeNull()
  expect(employeeTileBox!.x + employeeTileBox!.width - (dockBox!.x + dockBox!.width)).toBeGreaterThan(
    24,
  )
  expect(projectsAfter!.y).toBeLessThan(projectsBefore!.y)
  expect(documentsAfter!.y).toBeGreaterThan(documentsBefore!.y)
  expect(employeeLinkBox?.height).toBe(56)

  await page.getByRole('main').hover()
  await dock.locator('.workspace-dock__brand').hover()
  await expect
    .poll(async () => {
      const projectBox = await projects.locator('.workspace-dock__tile').boundingBox()
      return projectBox ? Math.abs(projectBox.y - projectsBefore!.y) : Number.POSITIVE_INFINITY
    })
    .toBeLessThan(1)
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
  await expect(employees.getByRole('tooltip')).toHaveCSS('opacity', '1')
})

test('honours reduced-motion without magnifying or pulsing Dock apps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await loginAsDefaultAdmin(page)

  const dock = page.getByRole('navigation', { name: '主导航', exact: true })
  const employees = dock.getByRole('link', { name: '员工', exact: true })
  const homeTile = dock.getByRole('link', { name: '工作台', exact: true }).locator(
    '.workspace-dock__tile',
  )
  const employeeTile = employees.locator('.workspace-dock__tile')

  await employees.hover()

  await expect(employeeTile).toHaveCSS('width', '46px')
  await expect(employeeTile).toHaveCSS('height', '46px')
  await expect(employeeTile).toHaveCSS('transform', 'none')
  await expect(homeTile).toHaveCSS('transform', 'none')
})
