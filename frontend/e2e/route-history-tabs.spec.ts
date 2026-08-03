import { expect, test } from '@playwright/test'
import { loginAsDefaultAdmin } from './support/auth'

test('records routes, restores them after reload, and closes the active route to its left neighbor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await loginAsDefaultAdmin(page)

  const navigation = page.getByRole('navigation', { name: '主导航', exact: true })
  const tabs = page.getByRole('tablist', { name: '历史路由' })
  await expect(tabs.getByRole('tab', { name: '工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭工作台' })).toHaveCount(0)

  await navigation.getByRole('link', { name: '员工', exact: true }).click()
  await expect(tabs.getByRole('tab', { name: '员工' })).toHaveAttribute('aria-selected', 'true')
  await navigation.getByRole('link', { name: '日历', exact: true }).click()
  await expect(tabs.getByRole('tab', { name: '日历' })).toHaveAttribute('aria-selected', 'true')

  await page.reload()
  await expect(tabs.getByRole('tab', { name: '员工' })).toBeVisible()
  await expect(tabs.getByRole('tab', { name: '日历' })).toBeVisible()

  await page.getByRole('button', { name: '关闭日历' }).click()
  await expect(page).toHaveURL(/#\/employees/)
  await expect(tabs.getByRole('tab', { name: '员工' })).toHaveAttribute('aria-selected', 'true')
})

test('updates a route when only query filters change and keeps the compact header inside the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 })
  await loginAsDefaultAdmin(page)

  await page.goto('/#/employees?tab=directory')
  const tabs = page.getByRole('tablist', { name: '历史路由' })
  await expect(tabs.getByRole('tab', { name: '员工' })).toBeVisible()
  await page.goto('/#/employees?tab=imports')
  await expect(tabs.getByRole('tab', { name: '员工' })).toHaveCount(1)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(2)
  await expect(page.locator('.workspace-header__context')).toBeVisible()
})

test('moves excess history routes into overflow instead of squeezing their titles to empty boxes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await loginAsDefaultAdmin(page)

  for (const route of ['/employees', '/calendar', '/base', '/spaces/projects']) {
    await page.goto(`/#${route}`)
  }

  const tabs = page.getByRole('tablist', { name: '历史路由' })
  await expect(tabs.getByRole('tab', { name: '项目' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '更多历史页面' })).toBeVisible()

  const visibleTitleWidths = await tabs.locator('.route-history__title:visible').evaluateAll((titles) =>
    titles.map((title) => title.getBoundingClientRect().width),
  )
  expect(visibleTitleWidths.every((width) => width >= 16)).toBe(true)
})

test('keeps route history inside its grid track before the search box at intermediate widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await loginAsDefaultAdmin(page)

  for (const route of ['/employees', '/docs', '/base', '/my-work']) {
    await page.goto(`/#${route}`)
  }

  const header = page.locator('.workspace-header')
  const context = header.locator('.workspace-header__context')
  const search = header.locator('.workspace-header__search-wrap')
  const actions = header.locator('.workspace-header__actions')
  const tabs = header.getByRole('tablist', { name: '历史路由' })

  await expect(search).toBeVisible()
  await expect(page.getByRole('button', { name: '更多历史页面' })).toBeVisible()
  await page.waitForTimeout(250)

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      const box = element?.getBoundingClientRect()
      return box ? { left: box.left, right: box.right, width: box.width } : null
    }
    const contextBox = rect('.workspace-header__context')
    const visibleTabBoxes = Array.from(
      document.querySelectorAll<HTMLElement>('.route-history__item'),
    ).map((element) => {
      const box = element.getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        width: box.width,
      }
    })

    return {
      context: contextBox,
      search: rect('.workspace-header__search-wrap'),
      actions: rect('.workspace-header__actions'),
      visibleTabBoxes,
    }
  })

  expect(layout.context).not.toBeNull()
  expect(layout.search).not.toBeNull()
  expect(layout.actions).not.toBeNull()
  expect(layout.context!.right).toBeLessThanOrEqual(layout.search!.left)
  expect(layout.search!.right).toBeLessThanOrEqual(layout.actions!.left)
  expect(layout.visibleTabBoxes.length).toBeLessThan(5)
  expect(layout.visibleTabBoxes.every((box) => box.right <= layout.context!.right + 1)).toBe(true)
  await expect(tabs).toBeVisible()
})
