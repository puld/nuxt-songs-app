import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { waitForHomeReady } from '../lib/flows'

// Джорни: пользователь ищет песню по тексту, открывает её, листает к соседней,
// переключает вариант. Сквозной сценарий «найти и открыть песню».

test.describe('Джорни: найти и открыть песню', () => {
  test('поиск по тексту → открытие → следующая → вариант', async ({ page }) => {
    // 1. Открываем приложение, ищем по тексту.
    await waitForHomeReady(page)
    await page.fill(s.search.input, 'повесть любви')
    await expect(page.locator(s.search.resultItem).first()).toBeVisible({ timeout: 5000 })

    // 2. Кликаем первый результат → переход на страницу песни.
    await page.locator(s.search.resultItem).first().click()
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))
    await expect(page.locator(s.song.title)).toHaveText(SONGS.ONE.title)

    // 3. Листаем к следующей песне.
    await page.click(s.navbar.nextBtn)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.TWO.n}$`))
    await expect(page.locator(s.song.title)).toHaveText(SONGS.TWO.title)

    // 4. Возвращаемся к предыдущей.
    await page.click(s.navbar.prevBtn)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))
  })

  test('поиск по номеру → открытие мульти-вариантной песни → смена варианта', async ({ page }) => {
    await waitForHomeReady(page)
    await page.fill(s.search.input, String(SONGS.MULTI.n))
    await page.press(s.search.input, 'Enter')

    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.MULTI.n}$`))
    await expect(page.locator(s.song.variantTab).first()).toHaveClass(/active/)

    // Переключаем на второй вариант.
    await page.locator(s.song.variantTab).nth(1).click()
    await expect(page.locator(s.song.variantTab).nth(1)).toHaveClass(/active/)
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.MULTI.n}\\?v=1$`))
  })

  test('goto-popover: переход между песнями без возврата на главную', async ({ page }) => {
    await waitForHomeReady(page)
    await page.fill(s.search.input, 'повесть')
    await page.locator(s.search.resultItem).first().click()
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))

    // Открываем goto-popover прямо со страницы песни.
    await page.click(s.navbar.gotoBtn)
    await expect(page.locator(s.goto.overlay)).toBeVisible()
    await page.fill(s.search.input, 'молитвы')
    await page.locator(s.search.resultItem).first().click()
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.TWO.n}$`))
    await expect(page.locator(s.goto.overlay)).toHaveCount(0)
  })
})
