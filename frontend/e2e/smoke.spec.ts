import { expect, test } from '@playwright/test'

test.describe('workbench smoke', () => {
  test('renders the local workbench entry', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/研发主管工作台/)
    await expect(page.getByRole('heading', { name: '研发主管工作台' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
    await expect(page.locator('.app-page')).toHaveCSS('background-color', 'rgb(245, 246, 247)')
  })

  test('renders settings through the hash route', async ({ page }) => {
    await page.goto('/#/settings')

    await expect(page.getByRole('heading', { name: '工作台设置' })).toBeVisible()
    await expect(page.locator('.project-workspace__panel')).toHaveCount(3)
  })

  test('uses consistent workspace controls and modal actions', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: '全局新建' }).click()
    await page.getByRole('menuitem', { name: '新建任务' }).click()

    const dialog = page.getByRole('dialog', { name: '新建任务' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.semi-datepicker')).toHaveCount(1)
    await expect(dialog.locator('.semi-select')).toHaveCount(2)
    await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '保存任务' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '新建任务' })).not.toBeVisible()

    const modalBox = await dialog.boundingBox()
    const primaryBox = await dialog.getByRole('button', { name: '保存任务' }).boundingBox()
    expect(modalBox).not.toBeNull()
    expect(primaryBox).not.toBeNull()
    expect(modalBox!.y + modalBox!.height - (primaryBox!.y + primaryBox!.height)).toBeGreaterThanOrEqual(24)
    expect(modalBox!.x + modalBox!.width - (primaryBox!.x + primaryBox!.width)).toBeGreaterThanOrEqual(24)
  })

  test('renders the work calendar with Chinese locale', async ({ page }) => {
    await page.goto('/#/calendar')

    await expect(page.getByRole('heading', { name: '日历' })).toBeVisible()
    await expect(page.locator('.fc-toolbar-title')).toContainText('年')
  })

  test('uses the Semi date picker in task scheduling dialogs', async ({ page }) => {
    await page.goto('/#/my-work')

    const deferButton = page.locator('button[aria-label^="稍后处理："]').first()
    await expect(deferButton).toBeVisible()
    await deferButton.click()

    const dialog = page.getByRole('dialog', { name: '稍后处理' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.locator('input[type="date"], input[type="datetime-local"], input[type="time"]'),
    ).toHaveCount(0)
    await expect(dialog.locator('.semi-datepicker')).toHaveCount(1)
    await dialog.getByLabel('恢复日期').click()
    await expect(page.locator('.semi-datepicker-container')).toBeVisible()
  })

  test('keeps actions away from the bottom edge in footerless modals', async ({ page }) => {
    await page.goto('/#/spaces/projects')

    const projectLink = page.locator('a[aria-label^="打开项目空间："]').first()
    await expect(projectLink).toBeVisible()
    await projectLink.click()
    await page.getByRole('button', { name: '新建工作项' }).click()

    const dialog = page.getByRole('dialog', { name: '新建项目工作项' })
    const primary = dialog.getByRole('button', { name: '保存任务' })
    await expect(dialog).toBeVisible()
    await expect(primary).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    const primaryBox = await primary.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(primaryBox).not.toBeNull()
    expect(dialogBox!.y + dialogBox!.height - (primaryBox!.y + primaryBox!.height)).toBeGreaterThanOrEqual(24)
    expect(dialogBox!.x + dialogBox!.width - (primaryBox!.x + primaryBox!.width)).toBeGreaterThanOrEqual(24)
  })

  test('keeps actions inset in legacy workspace dialogs', async ({ page }) => {
    await page.goto('/#/issues')
    await page.getByRole('button', { name: '新建问题' }).click()

    const dialog = page.getByRole('dialog', { name: '新建问题' })
    const primary = dialog.getByRole('button', { name: '保存问题' })
    await expect(dialog).toBeVisible()
    await expect(primary).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    const primaryBox = await primary.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(primaryBox).not.toBeNull()
    expect(dialogBox!.y + dialogBox!.height - (primaryBox!.y + primaryBox!.height)).toBeGreaterThanOrEqual(16)
    expect(dialogBox!.x + dialogBox!.width - (primaryBox!.x + primaryBox!.width)).toBeGreaterThanOrEqual(16)
  })

  test('aligns project attachments with the project card content grid', async ({ page }) => {
    await page.goto('/#/spaces/projects')

    const projectLink = page.locator('a[aria-label^="打开项目空间："]').first()
    await expect(projectLink).toBeVisible()
    await projectLink.click()
    await page.getByRole('tab', { name: '文档与资料' }).click()

    const attachments = page.locator('.file-attachments')
    await expect(attachments).toBeVisible()
    await expect(attachments).toHaveCSS('padding-left', '18px')
    await expect(attachments).toHaveCSS('padding-right', '18px')
  })
})
