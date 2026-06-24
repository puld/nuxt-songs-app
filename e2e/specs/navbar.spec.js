import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { waitForHomeReady, gotoSong } from '../lib/flows'

// Навбар (глобальный chrome): заголовки per-page, гамбургер/назад,
// Teleport-слоты. Скрытие при скролле здесь не проверяем (флаки на CI).

test.describe('Навбар', () => {
  test('главная: заголовок «Сборник песен», гамбургер в левом слоте', async ({ page }) => {
    await waitForHomeReady(page)
    await expect(page.locator(`${s.navbar.center} ${s.navbar.title}`)).toHaveText('Сборник песен')
    await expect(page.locator(s.navbar.menuBtn)).toBeVisible()
    await expect(page.locator(s.navbar.backBtn)).toHaveCount(0)
  })

  test('настройки: заголовок «Настройки», стрелка назад', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator(`${s.navbar.center} ${s.navbar.title}`)).toHaveText('Настройки')
    await expect(page.locator(s.navbar.backBtn)).toBeVisible()
    await expect(page.locator(s.navbar.menuBtn)).toHaveCount(0)
  })

  test('песня: заголовок «№ N», гамбургер в левом слоте', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.navbar.titleBtn)).toHaveText(`№ ${SONGS.ONE.n}`)
    await expect(page.locator(s.navbar.menuBtn)).toBeVisible()
    await expect(page.locator(s.navbar.backBtn)).toHaveCount(0)
  })

  test('стрелка назад возвращает на предыдущую страницу', async ({ page }) => {
    await waitForHomeReady(page)
    await page.goto('/settings')
    await expect(page.locator(s.navbar.backBtn)).toBeVisible()
    await page.click(s.navbar.backBtn)
    // router.back() → должны вернуться на главную.
    await expect(page).toHaveURL(/\/$/)
  })
})
