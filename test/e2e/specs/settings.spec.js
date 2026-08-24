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

  // Секция аккордов — за режимом разработчика: в текстах песен разметка аккордов
  // ещё не расставлена, и обычному пользователю тумблер ничего не меняет.
  test('без devMode секции аккордов нет', async ({ page }) => {
    // Ждём отрисовки страницы: приложение SPA, и проверка отсутствия на ещё
    // пустом DOM прошла бы при любом состоянии гейта.
    await expect(page.locator(s.settings.section, { hasText: 'Тема приложения' }))
      .toBeVisible()
    await expect(page.locator(s.settings.section, { hasText: 'Отображение аккордов' }))
      .toHaveCount(0)
  })

  test('с devMode toggle аккордов переключает showChords', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
    await page.reload()

    const section = page.locator(s.settings.section, { hasText: 'Отображение аккордов' })
    const checkbox = section.locator('input[type="checkbox"]')
    // По умолчанию аккорды выключены — проверяем оба перехода, иначе тест
    // прошёл бы и на тумблере, который умеет только включаться.
    await expect(checkbox).not.toBeChecked()

    await section.locator(s.settings.toggleSwitch).click()
    await expect(checkbox).toBeChecked()

    await section.locator(s.settings.toggleSwitch).click()
    await expect(checkbox).not.toBeChecked()
  })

  test('состояние аккордов переживает перезагрузку', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('devMode', 'true'))
    await page.reload()

    const section = page.locator(s.settings.section, { hasText: 'Отображение аккордов' })
    await section.locator(s.settings.toggleSwitch).click()
    await expect(section.locator('input[type="checkbox"]')).toBeChecked()

    await page.reload()
    await expect(
      page.locator(s.settings.section, { hasText: 'Отображение аккордов' })
        .locator('input[type="checkbox"]')
    ).toBeChecked()
  })

  test('настройки темы persists после перезагрузки', async ({ page }) => {
    await page.locator(s.settings.section, { hasText: 'Тема приложения' })
      .getByRole('button', { name: 'Темная' }).click()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)

    await page.reload()
    await expect(page.locator(s.layout.root)).toHaveClass(/dark/)
  })
})
