import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { waitForHomeReady, gotoSong, openSidebar } from '../lib/flows'

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
    // Переход внутри приложения, а не `goto`: только так в истории роутера
    // появляется предыдущая запись, и видно, что кнопка идёт по ней, а не на
    // главную запасным путём — со страницы песни разница заметна.
    await gotoSong(page, SONGS.ONE.n)
    await openSidebar(page)
    await page.click(`${s.sidebar.link}:has-text("Настройки")`)
    await expect(page.locator(s.navbar.backBtn)).toBeVisible()

    await page.click(s.navbar.backBtn)

    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))
  })

  test('стрелка назад при заходе по прямой ссылке ведёт на главную', async ({ page }) => {
    // Приложение открыто сразу на внутреннем экране: возвращаться внутри него
    // некуда, и `router.back()` уводил бы из приложения вовсе.
    await page.goto('/settings')
    await expect(page.locator(s.navbar.backBtn)).toBeVisible()

    await page.click(s.navbar.backBtn)

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator(s.search.input)).toBeVisible()
  })
})
