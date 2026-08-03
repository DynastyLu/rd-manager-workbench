import { expect, test } from '@playwright/test'

test('keeps the React Bits galaxy canvas interactive beneath the login copy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/login')

  const galaxy = page.getByTestId('login-galaxy')
  await expect(galaxy.locator('canvas')).toBeVisible()
  await expect(galaxy).toHaveCSS('pointer-events', 'auto')
  await expect(galaxy).toHaveCSS('position', 'fixed')

  const galaxyBox = await galaxy.boundingBox()
  expect(galaxyBox).toEqual({ x: 0, y: 0, width: 1440, height: 900 })

  await expect(page.locator('.aurora-login-page__story-content')).toHaveCSS(
    'pointer-events',
    'none',
  )

  const decorativeLayers = await page.evaluate(() => {
    const story = document.querySelector('.aurora-login-page__story')
    const storyStyle = story ? window.getComputedStyle(story) : null
    const afterStyle = story ? window.getComputedStyle(story, '::after') : null

    return {
      storyBackgroundImage: storyStyle?.backgroundImage,
      storyAfterContent: afterStyle?.content,
      glowCount: document.querySelectorAll('.aurora-login-page__story-glow').length,
    }
  })

  expect(decorativeLayers).toEqual({
    storyBackgroundImage: 'none',
    storyAfterContent: 'none',
    glowCount: 0,
  })

  const access = page.locator('.aurora-login-page__access')
  await expect(access).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  const card = page.locator('.aurora-login-page__card')
  await expect(card).toHaveCSS('pointer-events', 'auto')

  const cardMaterial = await card.evaluate((element) => {
    const style = window.getComputedStyle(element)
    const alpha = Number(style.backgroundColor.match(/[\d.]+/g)?.[3] ?? 1)

    return {
      alpha,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
    }
  })

  expect(cardMaterial.alpha).toBeGreaterThan(0)
  expect(cardMaterial.alpha).toBeLessThanOrEqual(0.45)
  expect(cardMaterial.backdropFilter).not.toBe('none')
})

test('keeps the full-screen galaxy and login form usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/login')

  const galaxyBox = await page.getByTestId('login-galaxy').boundingBox()
  expect(galaxyBox).toEqual({ x: 0, y: 0, width: 390, height: 844 })

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(390)
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
})
