import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong } from '../lib/flows'

// Джорни: пользователь настраивает тему и размер шрифта, включает аккорды,
// открывает песню и видит применение настроек к отображению.

test.describe('Джорни: настройки → отображение песни', () => {
  test('тёмная тема + крупный шрифт + аккорды применяются к песне', async ({ page }) => {
    // 0. Тумблер аккордов живёт за режимом разработчика, поэтому включаем режим
    //    до загрузки страницы — сами аккорды дальше переключаем кликом, как
    //    это делает пользователь.
    await page.addInitScript(() => {
      localStorage.setItem('devMode', 'true')
    })

    // 1. В настройках включаем тёмную тему.
    await page.goto('/settings')
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Темная' }).click()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)

    // 2. Крупный шрифт.
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Больше' }).click()

    // 3. Аккорды — тумблером в настройках.
    const chordsSection = page.locator(s.settings.section, { hasText: 'Отображение аккордов' })
    await chordsSection.locator(s.settings.chordsToggle).click()
    await expect(chordsSection.locator(s.settings.chordsToggle).locator('input')).toBeChecked()

    // 4. Открываем песню — настройки применились.
    await gotoSong(page, SONGS.ONE.n)

    // Тёмная тема на корне .layout.
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)
    // Крупный шрифт — на .song-container (SongDisplay), не на .layout.
    await expect(page.locator(s.song.container)).toHaveClass(/font-size-large/)

    // Аккордов в текстах пока нет ни в одной песне (5.4 в дорожной карте),
    // поэтому проверяем не сами аккорды, а что включённый showChords не ломает
    // отрисовку: текст песни на месте.
    await expect(page.locator(s.song.container)).toBeVisible()
    await expect(page.locator(s.song.title)).toBeVisible()
  })

  test('светлая тема persists при переходе между страницами', async ({ page }) => {
    await page.goto('/settings')
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Светлая' }).click()

    // Переходим на главную — тема сохраняется.
    await page.goto('/')
    await page.waitForSelector(s.search.input, { timeout: 30000 })
    await expect(page.locator(s.layout.root)).toHaveClass(/light/)

    // Переходим на страницу песни — тема сохраняется.
    await gotoSong(page, SONGS.ONE.n)
    await expect(page.locator(s.layout.root)).toHaveClass(/light/)
  })
})
