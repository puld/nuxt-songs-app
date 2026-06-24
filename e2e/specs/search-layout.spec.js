import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'

// Адаптивная высота выпадающего списка результатов поиска.
//
// На главной: CSS max-height: calc(100dvh - 210px) — дропдаун занимает
// доступное место, на маленьком экране появляется скролл, не выходя за viewport.
//
// На странице песни (popover «Перейти к песне»): prop max-results-height="none"
// задаёт inline-стиль, переопределяющий CSS-класс — popover растётся естественно.
//
// Запрос «Бог» в фикстуре находит 22 песни → лимит 7 результатов срабатывает.

test.describe('Адаптивная высота dropdown', () => {
  test('большой экран: 7 результатов без скролла', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })

    await page.fill(s.search.input, 'Бог')
    await expect(page.locator(s.search.resultItem)).toHaveCount(7)

    const info = await page.evaluate(() => {
      const r = document.querySelector('.search-results')
      const cs = getComputedStyle(r)
      return {
        scrollHeight: r.scrollHeight,
        clientHeight: r.clientHeight,
        maxHeight: cs.maxHeight,
        childCount: r.children.length,
        viewportHeight: window.innerHeight,
      }
    })

    expect(info.childCount).toBe(7)
    expect(info.maxHeight).toBe('690px') // 900 - 210
    expect(info.scrollHeight).toBe(info.clientHeight) // скролла нет
  })

  test('маленький экран: скролл, дропдаун в пределах viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 480 })
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })

    await page.fill(s.search.input, 'Бог')
    await expect(page.locator(s.search.resultItem)).toHaveCount(7)

    const info = await page.evaluate(() => {
      const r = document.querySelector('.search-results')
      const cs = getComputedStyle(r)
      const rect = r.getBoundingClientRect()
      return {
        scrollHeight: r.scrollHeight,
        clientHeight: r.clientHeight,
        maxHeight: cs.maxHeight,
        childCount: r.children.length,
        rectBottom: rect.bottom,
        viewportHeight: window.innerHeight,
      }
    })

    expect(info.childCount).toBe(7)
    expect(info.maxHeight).toBe('270px') // 480 - 210
    expect(info.scrollHeight).toBeGreaterThan(info.clientHeight) // есть скролл
    expect(info.rectBottom).toBeLessThanOrEqual(info.viewportHeight) // не выходит за экран
  })

  test('popover на странице песни: max-height: none, без скролла', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/song/${SONGS.ONE.n}`)
    await page.waitForSelector(s.song.title, { timeout: 30000 })

    await page.click(s.navbar.gotoBtn)
    await expect(page.locator(s.goto.overlay)).toBeVisible()
    await page.waitForSelector(s.search.input)

    await page.fill(s.search.input, 'Бог')
    await expect(page.locator(s.search.resultItem)).toHaveCount(7)

    const info = await page.evaluate(() => {
      const r = document.querySelector('.search-results')
      const cs = getComputedStyle(r)
      return {
        inlineMaxHeight: r.style.maxHeight,
        computedMaxHeight: cs.maxHeight,
        scrollHeight: r.scrollHeight,
        clientHeight: r.clientHeight,
        childCount: r.children.length,
      }
    })

    expect(info.inlineMaxHeight).toBe('none')
    expect(info.computedMaxHeight).toBe('none')
    expect(info.childCount).toBe(7)
    expect(info.scrollHeight).toBe(info.clientHeight) // скролла нет

    // Закрытие кликом по overlay.
    await page.locator(s.goto.overlay).click({ position: { x: 5, y: 5 } })
    await expect(page.locator(s.goto.overlay)).toHaveCount(0)
  })
})
