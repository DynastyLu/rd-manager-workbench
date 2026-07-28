import { expect, test } from '@playwright/test'

test.describe('workbench smoke', () => {
  test('persists high-frequency workspace state in the hash URL', async ({ page }) => {
    await page.goto('/#/spaces/projects?foreign=keep')
    await page.getByLabel('搜索项目').fill('评审')
    await expect(page).toHaveURL(/search=%E8%AF%84%E5%AE%A1/)
    await expect(page).toHaveURL(/foreign=keep/)

    await page.getByRole('combobox', { name: '项目状态' }).click()
    await page.getByRole('option', { name: '进行中' }).click()
    await expect(page).toHaveURL(/status=ACTIVE/)

    await page.reload()
    await expect(page.getByLabel('搜索项目')).toHaveValue('评审')
    await expect(page.getByRole('combobox', { name: '项目状态' })).toContainText('进行中')

    await page.goto('/#/my-work')
    await page.getByRole('button', { name: '今日' }).click()
    await expect(page).toHaveURL(/view=TODAY/)
    await page.reload()
    await expect(page.getByRole('button', { name: '今日' })).toHaveAttribute('aria-current', 'page')
  })

  test('restores calendar, knowledge, base, and global-search state from the URL', async ({ page }) => {
    await page.goto('/#/calendar?calendarView=timeGridWeek&date=2026-07-15')
    await expect(page.getByRole('button', { name: '周' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.fc-toolbar-title')).toContainText('2026年7月')

    await page.goto('/#/knowledge?directory=favorites&query=%E6%9D%90%E6%96%99')
    await expect(page.getByRole('button', { name: '收藏' })).toHaveAttribute('data-active', 'true')
    await expect(page.getByLabel('搜索文档')).toHaveValue('材料')

    await page.goto('/#/base?query=%E9%A3%8E%E9%99%A9')
    await expect(page.getByLabel('搜索当前表')).toHaveValue('风险')

    await page.goto('/#/search?q=%E9%A1%B9%E7%9B%AE%E8%BF%9B%E5%BA%A6&types=PROJECT')
    await expect(page.getByLabel('搜索全部工作内容')).toHaveValue('项目进度')
    await expect(page.getByRole('button', { name: '仅搜索项目' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('keeps one application main landmark on complex workspaces', async ({ page }) => {
    for (const route of ['/knowledge', '/base', '/library/intelligence/briefs']) {
      await page.goto(`/#${route}`)
      await expect(page.locator('main')).toHaveCount(1)
    }
  })

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

  test('exposes the complete project maintenance loop', async ({ page }) => {
    await page.goto('/#/spaces/projects')
    const projectLink = page.locator('a[aria-label^="打开项目空间："]').first()
    await expect(projectLink).toBeVisible()
    await projectLink.click()

    await expect(page.getByRole('button', { name: '编辑项目' })).toBeVisible()
    await expect(page.getByRole('button', { name: '删除项目' })).toBeVisible()
    await expect(page.locator('.project-workspace__status')).toHaveCount(1)
    await page.getByRole('button', { name: '编辑项目' }).click()

    const projectDialog = page.getByRole('dialog', { name: '编辑项目' })
    await expect(projectDialog.getByLabel('项目目标')).toBeVisible()
    await expect(projectDialog.locator('.semi-datepicker')).toHaveCount(2)
    await expect(projectDialog.locator('.semi-select')).toHaveCount(4)
    await expect(projectDialog.getByRole('combobox', { name: '里程碑权重方式' })).toBeVisible()
    await expect(projectDialog.getByRole('button', { name: '保存项目' })).toBeVisible()
    await projectDialog.locator('.semi-modal-close').click()

    await page.getByRole('tab', { name: '进展' }).click()
    await expect(page.getByRole('button', { name: '提交进展' })).toBeVisible()

    await page.getByRole('tab', { name: '工作项' }).click()
    await expect(page.getByRole('button', { name: '新建工作项' }).last()).toBeVisible()
    const workItemProgress = page.locator('.project-workspace__task-list [role="progressbar"]')
    if (await workItemProgress.count()) await expect(workItemProgress.first()).toBeVisible()

    await page.getByRole('tab', { name: '概览' }).click()
    await expect(page.getByText('项目实际进度')).toBeVisible()
    await expect(page.getByRole('button', { name: '新建里程碑' })).toBeVisible()
  })
})
