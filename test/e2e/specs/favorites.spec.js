import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong } from '../lib/flows'

// Звезда избранного на странице песни: добавление/удаление,
// визуальное состояние, персистентность.

test.describe('Избранное', () => {
  test('клик по звезде добавляет в избранное (active + fill)', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    const star = page.locator(s.navbar.favoriteStar)
    await expect(star).not.toHaveClass(/active/)

    await star.click()
    await expect(star).toHaveClass(/active/)
  })

  test('повторный клик удаляет из избранного', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    const star = page.locator(s.navbar.favoriteStar)

    // Добавляем.
    await star.click()
    await expect(star).toHaveClass(/active/)

    // Удаляем.
    await star.click()
    await expect(star).not.toHaveClass(/active/)
  })

  test('состояние избранного persists после перезагрузки', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    const star = page.locator(s.navbar.favoriteStar)
    await star.click()
    await expect(star).toHaveClass(/active/)

    // Перезагружаем — звезда остаётся активной (IndexedDB хранит связь).
    await page.reload()
    await page.waitForSelector(s.song.title, { timeout: 30000 })
    await expect(page.locator(s.navbar.favoriteStar)).toHaveClass(/active/)
  })

  test('избранное доступно через сайдбар', async ({ page }) => {
    // Добавляем песню в избранное.
    await gotoSong(page, SONGS.ONE.n)
    await page.locator(s.navbar.favoriteStar).click()

    // Открываем сайдбар — «Избранное» первое со счётчиком 1.
    await page.click(s.navbar.menuBtn)
    await page.waitForSelector(s.sidebar.aside)
    const favLink = page.locator(s.sidebar.collectionLink).first()
    await expect(favLink).toContainText('Избранное')
    await expect(favLink.locator(s.sidebar.favoriteIcon)).toBeVisible()
    await expect(favLink.locator(s.sidebar.collectionCount)).toHaveText('1')
  })
})
