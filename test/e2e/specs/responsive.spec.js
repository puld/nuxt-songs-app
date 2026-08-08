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

  test('главная: нет вертикального скролла — контент помещается в окно', async ({ page }) => {
    await waitForHomeReady(page)
    const info = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }))
    expect(info.scrollHeight).toBeLessThanOrEqual(info.clientHeight)
  })

  test('высота страницы привязана к динамическому вьюпорту (dvh)', async ({ page }) => {
    // Регрессия: высота тянулась по цепочке 100% от layout-вьюпорта. В PWA на
    // Android системная навигация вызывается свайпом снизу и уменьшает окно,
    // но layout-вьюпорт (а с ним 100% и vh) остаётся прежним — на пустой
    // странице появлялся вертикальный скролл, содержимое уезжало вверх.
    //
    // Проверяем именно объявление, а не поведение: в desktop-Chromium
    // large-вьюпорт всегда равен окну, расхождение large/small там не
    // воспроизводится, и поведенческая проверка была бы зелёной и без фикса.
    await waitForHomeReady(page)
    const declared = await page.evaluate(() => {
      const wanted = new Set(['html', 'body', '#__nuxt', '.layout'])
      const found = {}
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue } // cross-origin
        for (const rule of rules) {
          const sel = rule.selectorText
          if (!sel) continue
          for (const part of sel.split(',').map(p => p.trim())) {
            if (!wanted.has(part)) continue
            const declaration = rule.style?.minHeight || rule.style?.height
            if (declaration) found[part] = declaration
          }
        }
      }
      return found
    })

    for (const sel of ['html', 'body', '#__nuxt', '.layout']) {
      expect(declared[sel], `нет объявления высоты для ${sel}`).toBeTruthy()
      expect(declared[sel], `${sel} должен тянуться по dvh`).toContain('dvh')
    }
  })

  test('meta viewport: клавиатура накрывает страницу, а не ужимает вьюпорт', async ({ page }) => {
    // Второй сценарий того же бага: при фокусе в поиске Chrome на Android
    // по умолчанию уменьшает окно — содержимое переверстывается и появляется
    // скролл. interactive-widget=overlays-content это отключает.
    // Тег должен быть ровно один: свой в layout соседствовал с дефолтным
    // от Nuxt, и в разметке оказывалось два viewport'а.
    await waitForHomeReady(page)
    const metas = await page.evaluate(
      () => [...document.querySelectorAll('meta[name="viewport"]')].map(m => m.content)
    )
    expect(metas).toHaveLength(1)
    expect(metas[0]).toContain('interactive-widget=overlays-content')
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
