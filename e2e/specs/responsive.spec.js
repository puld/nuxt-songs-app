import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, waitForHomeReady, openSidebar } from '../lib/flows'

// Адаптивность: мобильный viewport, отсутствие горизонтального скролла,
// сайдбар помещается в экран.

test.describe('Адаптивность (мобильный 375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('главная: нет горизонтального скролла', async ({ page }) => {
    await waitForHomeReady(page)
    const info = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(info.scrollWidth).toBeLessThanOrEqual(info.clientWidth)
  })

  test('сайдбар помещается в viewport', async ({ page }) => {
    await waitForHomeReady(page)
    await openSidebar(page)
    // Сайдбар анимируется через <Transition name="slide"> (translateX -100%→0,
    // 0.25s). Ждём окончания перехода, иначе boundingBox поймает середину.
    await expect(page.locator(s.sidebar.aside)).toHaveCSS('transform', 'none')
    const rect = await page.locator(s.sidebar.aside).boundingBox()
    expect(rect).toBeTruthy()
    expect(rect.width).toBeLessThanOrEqual(375)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    // Правый край не выходит за viewport.
    expect(rect.x + rect.width).toBeLessThanOrEqual(375)
  })

  test('страница песни без переполнения', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    const info = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(info.scrollWidth).toBeLessThanOrEqual(info.clientWidth)
  })

  test('страница песни с крупным шрифтом без переполнения', async ({ page }) => {
    // Включаем крупный шрифт через настройки.
    await page.goto('/settings')
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Больше' }).click()

    await gotoSong(page, SONGS.ONE.n)
    const info = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(info.scrollWidth).toBeLessThanOrEqual(info.clientWidth)
  })

  test('мульти-вариант: табы помещаются в мобильный viewport', async ({ page }) => {
    await gotoSong(page, SONGS.MULTI.n)
    const tabsBox = await page.locator(s.song.variantTabs).boundingBox()
    expect(tabsBox).toBeTruthy()
    expect(tabsBox.x).toBeGreaterThanOrEqual(0)
    expect(tabsBox.x + tabsBox.width).toBeLessThanOrEqual(375)
  })
})
