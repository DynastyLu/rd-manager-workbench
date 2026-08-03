import { expect, test, type Page } from '@playwright/test'
import { loginAsDefaultAdmin } from './support/auth'

const moduleRoutes = [
  '/',
  '/my-work',
  '/spaces/projects',
  '/employees?tab=directory',
  '/docs',
  '/base',
  '/calendar',
  '/search',
  '/library/applications',
  '/library/governance/risks',
  '/library/governance/issues',
  '/library/governance/decisions',
  '/library/governance/partners',
  '/library/operations',
  '/library/reports',
  '/library/intelligence',
  '/library/intelligence/briefs',
  '/settings',
  '/settings/data-governance',
  '/settings/extensions',
  '/settings/security',
  '/admin/users',
  '/admin/roles',
  '/admin/permissions',
  '/admin/security-audits',
  '/admin/ownership-migration',
] as const

async function collectLayoutProblems(page: Page, route: string): Promise<string[]> {
  // A full document navigation resets React's error boundary between lazy routes.
  // A hash-only transition can otherwise retain a transient Vite HMR import error.
  await page.goto(`/?layout-audit=${encodeURIComponent(route)}#${route}`)
  await expect(page.locator('main')).toBeVisible()
  await page.waitForTimeout(100)

  return page.evaluate((currentRoute) => {
    const problems: string[] = []
    const root = document.documentElement
    const viewportWidth = window.innerWidth

    if (root.scrollWidth > viewportWidth + 2) {
      problems.push(
        `${currentRoute}: document horizontal overflow ${root.scrollWidth - viewportWidth}px`,
      )
    }

    const main = document.querySelector<HTMLElement>('main')
    if (!main) {
      problems.push(`${currentRoute}: missing application main`)
      return problems
    }

    const mainBox = main.getBoundingClientRect()
    if (mainBox.right > viewportWidth + 2) {
      problems.push(`${currentRoute}: main exceeds viewport by ${Math.ceil(mainBox.right - viewportWidth)}px`)
    }

    const structuralSurfaces = [
      ...main.querySelectorAll<HTMLElement>('.workspace-page__inner, .workspace-card'),
    ].filter((element) => {
      const style = window.getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0
    })
    const overflowingSurface = structuralSurfaces.find(
      (element) => element.getBoundingClientRect().right > viewportWidth + 2,
    )
    if (overflowingSurface) {
      const box = overflowingSurface.getBoundingClientRect()
      problems.push(
        `${currentRoute}: ${overflowingSurface.className} exceeds viewport by ${Math.ceil(box.right - viewportWidth)}px`,
      )
    }

    main.querySelectorAll<HTMLElement>('.semi-table-wrapper').forEach((tableWrapper) => {
      const table = tableWrapper.querySelector<HTMLElement>('table')
      if (!table) return

      const wrapperBox = tableWrapper.getBoundingClientRect()
      const tableBox = table.getBoundingClientRect()
      if (wrapperBox.width > 0 && wrapperBox.width - tableBox.width > 4) {
        problems.push(
          `${currentRoute}: table leaves ${Math.round(wrapperBox.width - tableBox.width)}px unused`,
        )
      }
    })

    if (currentRoute === '/admin/security-audits') {
      const auditTable = main.querySelector<HTMLElement>('.admin-audits__table')
      const renderedTable = auditTable?.querySelector<HTMLElement>('table')
      if (auditTable && renderedTable) {
        const wrapperBox = auditTable.getBoundingClientRect()
        const tableBox = renderedTable.getBoundingClientRect()
        if (wrapperBox.width - tableBox.width > 4) {
          problems.push(
            `${currentRoute}: audit table leaves ${Math.round(wrapperBox.width - tableBox.width)}px unused`,
          )
        }
      }
    }

    return problems
  }, route)
}

for (const width of [1280, 1440, 1920]) {
  test(`keeps every module page aligned at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width, height: 900 })
    await loginAsDefaultAdmin(page)

    const problems: string[] = []
    for (const route of moduleRoutes) {
      await test.step(route, async () => {
        problems.push(...(await collectLayoutProblems(page, route)))
      })
    }

    expect(problems).toEqual([])
  })
}
