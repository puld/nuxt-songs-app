import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'

// Настройки: тема, размер шрифта, отображение аккордов.
// Персистентность через Pinia + useStorage (localStorage).
//
// Внимание: класс font-size-* применяется к .song-container на странице песни
// (SongDisplay.vue), а не к корневому .layout. Тема (light/dark) — на .layout.

test.describe('Настройки', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('заголовок «Настройки» в навбаре', async ({ page }) => {
    await expect(page.locator(s.navbar.title)).toHaveText('Настройки')
  })

  test('тема «Светлая» → класс light', async ({ page }) => {
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Светлая' }).click()
    await expect(page.locator(s.layout.root)).toHaveClass(/light/)
  })

  test('тема «Тёмная» → класс dark', async ({ page }) => {
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Темная' }).click()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)
  })

  test('размер шрифта «Больше» → класс font-size-large на .song-container', async ({ page }) => {
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Больше' }).click()
    // Класс применяется в SongDisplay на странице песни.
    await page.goto(`/song/${SONGS.ONE.n}`)
    await page.waitForSelector(s.song.title, { timeout: 15000 })
    await expect(page.locator(s.song.container)).toHaveClass(/font-size-large/)
  })

  test('размер шрифта «Меньше» → класс font-size-small на .song-container', async ({ page }) => {
    await page.locator(s.settings.section, { hasText: 'Размер шрифта' })
      .getByRole('button', { name: 'Меньше' }).click()
    await page.goto(`/song/${SONGS.ONE.n}`)
    await page.waitForSelector(s.song.title, { timeout: 15000 })
    await expect(page.locator(s.song.container)).toHaveClass(/font-size-small/)
  })

  // ВРЕМЕННО СКИПНУТО: тумблер аккордов скрыт в UI (showChordsSection = false).
  // Вернуть вместе с раскомментированием секции в pages/settings.vue.
  test.skip('toggle аккордов переключает showChords', async ({ page }) => {
    const section = page.locator(s.settings.section, { hasText: 'Отображение аккордов' })
    const checkbox = section.locator('input[type="checkbox"]')
    const before = await checkbox.isChecked()
    await section.locator(s.settings.toggleSwitch).click()
    await expect(checkbox).toBeChecked(!before)
  })

  test('настройки темы persists после перезагрузки', async ({ page }) => {
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Темная' }).click()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)

    await page.reload()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)
  })
})
