import { test, expect } from '../lib/fixtures'
import { s } from '../lib/selectors'
import { SONGS } from '../lib/songs'
import { gotoSong, uniqueCollectionName } from '../lib/flows'

// Страница подборки: список песен, навигация, режим редактирования,
// удаление песни, удаление подборки, ошибочные состояния.

/** Создаёт подборку с одной песней и открывает её страницу. Возвращает имя. */
async function setupCollection(page, songNumber = SONGS.ONE.n) {
  await gotoSong(page, songNumber)
  await page.click(s.chips.chipAdd)
  const name = uniqueCollectionName()
  await page.fill(s.popup.input, name)
  await page.click(s.popup.createBtn)
  await expect(page.locator(`${s.chips.chip}:has-text("${name}")`)).toBeVisible()
  await page.locator(`${s.chips.chip}:has-text("${name}")`).click()
  await expect(page).toHaveURL(/\/collections\/\d+$/)
  return name
}

test.describe('Страница подборки', () => {
  test('показывает песню, заголовок = имя подборки', async ({ page }) => {
    const name = await setupCollection(page)
    await expect(page.locator(s.navbar.title)).toHaveText(name)
    await expect(page.locator(s.collection.songItem)).toHaveCount(1)
    await expect(page.locator(s.collection.songNumber)).toHaveText(String(SONGS.ONE.n))
  })

  test('клик по песне → переход на /song/{n}', async ({ page }) => {
    await setupCollection(page)
    await page.locator(s.collection.songLink).first().click()
    await expect(page).toHaveURL(new RegExp(`/song/${SONGS.ONE.n}$`))
  })

  test('режим редактирования: кнопки удаления появляются', async ({ page }) => {
    await setupCollection(page)
    await expect(page.locator(s.collection.removeBtn)).toHaveCount(0)

    await page.click(s.collection.editBtn)
    await expect(page.locator(s.collection.removeBtn)).toHaveCount(1)
    await expect(page.locator(s.collection.editDone)).toHaveText('Готово')
  })

  test('несуществующая подборка → «Подборка не найдена»', async ({ page }) => {
    await page.goto(`/collections/${SONGS.NONEXISTENT_COLLECTION}`)
    await expect(page.locator(s.collection.notFound)).toBeVisible({ timeout: 15000 })
    await expect(page.locator(s.collection.homeLink)).toBeVisible()
  })

  test('для «Избранного» кнопка «Удалить подборку» не видна', async ({ page }) => {
    // Добавим песню в избранное.
    await gotoSong(page, SONGS.ONE.n)
    await page.locator(s.navbar.favoriteStar).click()

    // Откроем «Избранное» через сайдбар.
    await page.click(s.navbar.menuBtn)
    await page.waitForSelector(s.sidebar.aside)
    await page.locator(s.sidebar.collectionLink).first().click()
    await expect(page).toHaveURL(/\/collections\/\d+$/)

    // В режиме редактирования — кнопки удаления песней есть, «Удалить подборку» — нет.
    await page.click(s.collection.editBtn)
    await expect(page.locator(s.collection.deleteBtn)).toHaveCount(0)
  })
})
