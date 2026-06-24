import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, uniqueCollectionName } from '../lib/flows'

// Попап добавления в подборку со страницы песни: открытие, список доступных
// подборок, создание новой, навигация по чипу, disabled-состояние.

test.describe('Добавление в подборку', () => {
  test('кнопка «+» открывает попап с заголовком', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)

    await expect(page.locator(s.popup.overlay)).toBeVisible()
    await expect(page.locator(s.popup.title)).toHaveText('Добавить в подборку')
  })

  test('«Создать» disabled при пустом имени, активна при вводе', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)
    await expect(page.locator(s.popup.createBtn)).toBeDisabled()

    await page.fill(s.popup.input, 'Новая подборка')
    await expect(page.locator(s.popup.createBtn)).toBeEnabled()

    // Закрытие без создания.
    await page.locator(s.popup.overlay).click({ position: { x: 5, y: 5 } })
    await expect(page.locator(s.popup.overlay)).toHaveCount(0)
  })

  test('создание подборки из попапа → чип появляется', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)

    const name = uniqueCollectionName()
    await page.fill(s.popup.input, name)
    await page.click(s.popup.createBtn)

    await expect(page.locator(s.popup.overlay)).toHaveCount(0)
    await expect(page.locator(`${s.chips.chip}:has-text("${name}")`)).toBeVisible()
  })

  test('клик по чипу подборки → переход на /collections/{id}', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)
    const name = uniqueCollectionName('NAV')
    await page.fill(s.popup.input, name)
    await page.click(s.popup.createBtn)
    await expect(page.locator(`${s.chips.chip}:has-text("${name}")`)).toBeVisible()

    await page.locator(`${s.chips.chip}:has-text("${name}")`).click()
    await expect(page).toHaveURL(/\/collections\/\d+$/)
    await expect(page.locator(s.navbar.title)).toHaveText(name)
  })

  test('закрытие попапа кликом по overlay', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)
    await expect(page.locator(s.popup.overlay)).toBeVisible()

    await page.locator(s.popup.overlay).click({ position: { x: 5, y: 5 } })
    await expect(page.locator(s.popup.overlay)).toHaveCount(0)
  })

  test('попап не показывает «Избранное» в списке доступных', async ({ page }) => {
    await gotoSong(page, SONGS.ONE.n)
    await page.click(s.chips.chipAdd)
    await expect(page.locator(s.popup.overlay)).toBeVisible()

    // «Избранное» не должно быть в списке доступных подборок попапа.
    await expect(page.locator(`${s.popup.collectionItem}:has-text("Избранное")`)).toHaveCount(0)

    await page.locator(s.popup.overlay).click({ position: { x: 5, y: 5 } })
  })
})
