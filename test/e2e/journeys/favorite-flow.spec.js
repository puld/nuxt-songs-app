import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, waitForHomeReady, openSidebar } from '../lib/flows'

// Джорни: пользователь добавляет песню в «Избранное» со страницы песни,
// открывает «Избранное» через сайдбар, видит песню, открывает её,
// убирает из избранного.

test.describe('Джорни: избранное', () => {
  test('добавить → найти через сайдбар → открыть → убрать', async ({ page }) => {
    // 1. Открываем песню и добавляем в избранное.
    await gotoSong(page, SONGS.ONE.n)
    const star = page.locator(s.navbar.favoriteStar)
    await expect(star).not.toHaveClass(/active/)
    await star.click()
    await expect(star).toHaveClass(/active/)

    // 2. Открываем сайдбар — «Избранное» со счётчиком 1.
    await openSidebar(page)
    const favLink = page.locator(s.sidebar.collectionLink).first()
    await expect(favLink).toContainText('Избранное')
    await expect(favLink.locator(s.sidebar.collectionCount)).toHaveText('1')

    // 3. Открываем «Избранное».
    await favLink.click()
    await expect(page).toHaveURL(/\/collections\/\d+$/)
    await expect(page.locator(s.collection.songItem)).toHaveCount(1)
    await expect(page.locator(s.collection.songNumber)).toHaveText(String(SONGS.ONE.n))

    // 4. Открываем песню из подборки.
    await page.locator(s.collection.songLink).first().click()
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))
    // Звезда остаётся активной.
    await expect(page.locator(s.navbar.favoriteStar)).toHaveClass(/active/)

    // 5. Убираем из избранного.
    await page.locator(s.navbar.favoriteStar).click()
    await expect(page.locator(s.navbar.favoriteStar)).not.toHaveClass(/active/)
  })
})
